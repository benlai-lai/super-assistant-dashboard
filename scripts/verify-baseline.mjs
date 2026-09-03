import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';

const projectRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const excludedDirectories = new Set(['.git', 'node_modules']);

function projectRelative(path) {
  return relative(projectRoot, path).replaceAll('\\', '/');
}

function assertInsideProject(path, label) {
  const relativePath = relative(projectRoot, path);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`${label} resolves outside the repository`);
  }
}

function assertNoSymlinkSegments(path, label) {
  assertInsideProject(path, label);
  const relativePath = relative(projectRoot, path);
  let currentPath = projectRoot;

  for (const segment of relativePath.split(sep).filter(Boolean)) {
    currentPath = resolve(currentPath, segment);
    if (!existsSync(currentPath)) {
      throw new Error(`${label} is missing: ${projectRelative(path)}`);
    }
    if (lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`${label} uses a symbolic link: ${projectRelative(currentPath)}`);
    }
  }

  assertInsideProject(realpathSync(path), `${label} real path`);
}

function assertNonEmptyFile(path, label) {
  assertNoSymlinkSegments(path, label);
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`${label} is missing, empty, or not a file: ${projectRelative(path)}`);
  }
}

function collectScriptFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;

    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Repository path uses a symbolic link: ${projectRelative(path)}`);
    }
    if (entry.isDirectory()) {
      collectScriptFiles(path, files);
    } else if (entry.isFile() && ['.js', '.mjs'].includes(extname(entry.name).toLowerCase())) {
      assertNoSymlinkSegments(path, 'JavaScript file');
      files.push(path);
    }
  }

  return files;
}

function getTrackedFiles(extension) {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Unable to enumerate tracked files');

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .filter((path) => extname(path).toLowerCase() === extension)
    .map((path) => resolve(projectRoot, path))
    .sort();
}

function runLint() {
  const scriptFiles = collectScriptFiles(projectRoot).sort();
  if (scriptFiles.length === 0) throw new Error('No JavaScript files found');

  for (const file of scriptFiles) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Syntax check failed: ${projectRelative(file)}`);
  }

  console.log(`lint_checked=${scriptFiles.length}`);
}

function isExternalReference(reference) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference);
}

function normalizeLocalReference(reference, label) {
  const withoutQueryOrHash = reference.split(/[?#]/, 1)[0];
  if (!withoutQueryOrHash) throw new Error(`${label} is empty`);
  try {
    return decodeURIComponent(withoutQueryOrHash);
  } catch {
    throw new Error(`${label} contains invalid URL encoding`);
  }
}

function resolveLocalReference(sourceFile, reference) {
  const label = `Reference ${reference} from ${projectRelative(sourceFile)}`;
  const cleanReference = normalizeLocalReference(reference, label);
  const path = cleanReference.startsWith('/')
    ? resolve(projectRoot, cleanReference.slice(1))
    : resolve(dirname(sourceFile), cleanReference);
  assertInsideProject(path, label);
  return path;
}

function resolveModuleReference(sourceFile, reference) {
  const path = resolveLocalReference(sourceFile, reference);
  const candidates = extname(path)
    ? [path]
    : [path, `${path}.js`, `${path}.mjs`, resolve(path, 'index.js'), resolve(path, 'index.mjs')];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    assertNonEmptyFile(candidate, `Module ${reference} from ${projectRelative(sourceFile)}`);
    return candidate;
  }
  return null;
}

function isHtmlSpace(character) {
  return [' ', '\t', '\n', '\r', '\f'].includes(character);
}

function parseHtmlStartTags(source, sourceLabel) {
  const tags = [];
  let index = 0;

  while (index < source.length) {
    const tagStart = source.indexOf('<', index);
    if (tagStart === -1) break;
    if (source.startsWith('<!--', tagStart)) {
      const commentEnd = source.indexOf('-->', tagStart + 4);
      if (commentEnd === -1) throw new Error(`Unterminated HTML comment in ${sourceLabel}`);
      index = commentEnd + 3;
      continue;
    }

    let cursor = tagStart + 1;
    if (source[cursor] === '/' || source[cursor] === '!' || source[cursor] === '?') {
      const tagEnd = source.indexOf('>', cursor + 1);
      if (tagEnd === -1) throw new Error(`Unterminated HTML tag in ${sourceLabel}`);
      index = tagEnd + 1;
      continue;
    }
    while (isHtmlSpace(source[cursor])) cursor += 1;

    const nameStart = cursor;
    while (/[A-Za-z0-9:-]/.test(source[cursor] || '')) cursor += 1;
    if (cursor === nameStart) {
      index = tagStart + 1;
      continue;
    }

    const name = source.slice(nameStart, cursor).toLowerCase();
    const attributes = [];
    let selfClosing = false;
    let closed = false;

    while (cursor < source.length) {
      while (isHtmlSpace(source[cursor])) cursor += 1;
      if (source[cursor] === '>') {
        cursor += 1;
        closed = true;
        break;
      }
      if (source[cursor] === '/' && source[cursor + 1] === '>') {
        selfClosing = true;
        cursor += 2;
        closed = true;
        break;
      }

      const attributeStart = cursor;
      while (cursor < source.length && !isHtmlSpace(source[cursor]) && !['=', '/', '>'].includes(source[cursor])) {
        cursor += 1;
      }
      if (cursor === attributeStart) throw new Error(`Invalid HTML attribute in ${sourceLabel}`);
      const attributeName = source.slice(attributeStart, cursor).toLowerCase();
      while (isHtmlSpace(source[cursor])) cursor += 1;

      let value = null;
      if (source[cursor] === '=') {
        cursor += 1;
        while (isHtmlSpace(source[cursor])) cursor += 1;
        const quote = source[cursor];
        if (quote === '"' || quote === "'") {
          cursor += 1;
          const valueStart = cursor;
          while (cursor < source.length && source[cursor] !== quote) cursor += 1;
          if (cursor >= source.length) throw new Error(`Unterminated HTML attribute in ${sourceLabel}`);
          value = source.slice(valueStart, cursor);
          cursor += 1;
        } else {
          const valueStart = cursor;
          while (cursor < source.length && !isHtmlSpace(source[cursor]) && source[cursor] !== '>') cursor += 1;
          if (cursor === valueStart) throw new Error(`Empty HTML attribute in ${sourceLabel}`);
          value = source.slice(valueStart, cursor);
        }
      }
      attributes.push({ name: attributeName, value });
    }

    if (!closed) throw new Error(`Unterminated HTML tag in ${sourceLabel}`);
    tags.push({ name, attributes });
    index = cursor;

    if (!selfClosing && (name === 'script' || name === 'style')) {
      const closingPattern = new RegExp(`</${name}\\s*>`, 'ig');
      closingPattern.lastIndex = index;
      const closingMatch = closingPattern.exec(source);
      if (!closingMatch) throw new Error(`Missing closing ${name} tag in ${sourceLabel}`);
      index = closingPattern.lastIndex;
    }
  }

  return tags;
}

const htmlReferenceAttributes = new Map([
  ['audio', ['src']], ['embed', ['src']], ['iframe', ['src']], ['image', ['href']],
  ['img', ['src', 'srcset']], ['input', ['src']], ['link', ['href']], ['object', ['data']],
  ['script', ['src']], ['source', ['src', 'srcset']], ['track', ['src']], ['use', ['href']],
  ['video', ['poster', 'src']]
]);

function extractSrcsetReferences(value) {
  if (isExternalReference(value.trim())) return [value.trim()];
  return value.split(',').map((candidate) => candidate.trim().split(/\s+/, 1)[0]).filter(Boolean);
}

function extractHtmlReferences(source, sourceLabel) {
  const references = [];
  for (const tag of parseHtmlStartTags(source, sourceLabel)) {
    const referenceNames = htmlReferenceAttributes.get(tag.name);
    if (!referenceNames) continue;
    for (const referenceName of referenceNames) {
      const matches = tag.attributes.filter((attribute) => attribute.name === referenceName);
      if (matches.length > 1) {
        throw new Error(`Duplicate ${referenceName} attribute on ${tag.name} in ${sourceLabel}`);
      }
      if (matches.length === 0 || matches[0].value === null) continue;
      if (referenceName === 'srcset') references.push(...extractSrcsetReferences(matches[0].value));
      else references.push(matches[0].value);
    }
  }
  return references;
}

function stripCssComments(source, sourceLabel) {
  let result = '';
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const character = source[index];
    if (quote) {
      result += character;
      if (character === '\\' && index + 1 < source.length) {
        result += source[index + 1];
        index += 2;
        continue;
      }
      if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += character;
      index += 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const commentEnd = source.indexOf('*/', index + 2);
      if (commentEnd === -1) throw new Error(`Unterminated CSS comment in ${sourceLabel}`);
      result += ' ';
      index = commentEnd + 2;
      continue;
    }
    result += character;
    index += 1;
  }
  if (quote) throw new Error(`Unterminated CSS string in ${sourceLabel}`);
  return result;
}

function extractCssReferences(source, sourceLabel) {
  const withoutComments = stripCssComments(source, sourceLabel);
  const references = [];
  const urlPattern = /\burl\s*\(\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^)]*?))\s*\)/gi;
  const importPattern = /@import\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')/gi;
  for (const match of withoutComments.matchAll(urlPattern)) {
    references.push((match[1] ?? match[2] ?? match[3]).trim());
  }
  for (const match of withoutComments.matchAll(importPattern)) {
    references.push((match[1] ?? match[2]).trim());
  }
  return references;
}

function staticModuleSpecifier(node, sourceLabel, statementType) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const cookedValue = node.quasis[0]?.value.cooked;
    if (typeof cookedValue === 'string') return cookedValue;
  }

  throw new Error(`${statementType} must use a static string in ${sourceLabel}`);
}

function extractJavaScriptModuleReferences(source, sourceLabel) {
  let syntaxTree;
  try {
    syntaxTree = parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module'
    });
  } catch (error) {
    const location = error?.loc ? `:${error.loc.line}:${error.loc.column + 1}` : '';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse JavaScript module ${sourceLabel}${location}: ${message}`);
  }

  const references = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (node.type === 'ImportDeclaration') {
      references.push(staticModuleSpecifier(node.source, sourceLabel, 'Import declaration'));
    } else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      if (node.source) references.push(staticModuleSpecifier(node.source, sourceLabel, 'Export declaration'));
    } else if (node.type === 'ImportExpression') {
      references.push(staticModuleSpecifier(node.source, sourceLabel, 'Dynamic import'));
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  }

  visit(syntaxTree);
  return references;
}

function validateLocalReference(sourceFile, reference, type) {
  if (!reference || isExternalReference(reference)) return false;
  const isBareModuleSpecifier = type === 'module'
    && !reference.startsWith('.')
    && !reference.startsWith('/');
  if (isBareModuleSpecifier) return false;
  const path = type === 'module'
    ? resolveModuleReference(sourceFile, reference)
    : resolveLocalReference(sourceFile, reference);
  if (!path) throw new Error(`Unresolved module ${reference} from ${projectRelative(sourceFile)}`);
  if (type !== 'module') assertNonEmptyFile(path, `Asset ${reference} from ${projectRelative(sourceFile)}`);
  return true;
}

function runBuild() {
  const htmlFiles = getTrackedFiles('.html');
  const cssFiles = getTrackedFiles('.css');
  const scriptFiles = collectScriptFiles(projectRoot).sort();
  if (htmlFiles.length === 0) throw new Error('No tracked HTML entrypoints found');

  let assetReferences = 0;
  for (const htmlFile of htmlFiles) {
    assertNonEmptyFile(htmlFile, 'Tracked HTML entrypoint');
    const sourceLabel = projectRelative(htmlFile);
    for (const reference of extractHtmlReferences(readFileSync(htmlFile, 'utf8'), sourceLabel)) {
      if (validateLocalReference(htmlFile, reference, 'asset')) assetReferences += 1;
    }
  }

  let cssReferences = 0;
  for (const cssFile of cssFiles) {
    assertNonEmptyFile(cssFile, 'Tracked CSS file');
    const sourceLabel = projectRelative(cssFile);
    for (const reference of extractCssReferences(readFileSync(cssFile, 'utf8'), sourceLabel)) {
      if (validateLocalReference(cssFile, reference, 'asset')) cssReferences += 1;
    }
  }

  let moduleReferences = 0;
  for (const scriptFile of scriptFiles) {
    const sourceLabel = projectRelative(scriptFile);
    for (const reference of extractJavaScriptModuleReferences(readFileSync(scriptFile, 'utf8'), sourceLabel)) {
      if (validateLocalReference(scriptFile, reference, 'module')) moduleReferences += 1;
    }
  }

  console.log(
    `build_verified=${htmlFiles.length} entrypoints, ${assetReferences} HTML assets, `
      + `${cssFiles.length} CSS files, ${cssReferences} CSS assets, ${moduleReferences} module references`
  );
}

const mode = process.argv[2];

try {
  if (mode === 'lint') runLint();
  else if (mode === 'build') runBuild();
  else throw new Error('Usage: node scripts/verify-baseline.mjs <lint|build>');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
