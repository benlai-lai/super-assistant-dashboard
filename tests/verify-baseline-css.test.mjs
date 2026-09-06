import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { parse } from 'acorn';

// Exercise the actual helpers without importing the validator's CLI entry point.
const source = readFileSync(new URL('../scripts/verify-baseline.mjs', import.meta.url), 'utf8');
const syntaxTree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const helperNames = ['stripCssComments', 'extractCssReferences'];
const helperSource = helperNames.map((name) => {
  const declaration = syntaxTree.body.find((node) => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert.ok(declaration, `Missing validator helper: ${name}`);
  return source.slice(declaration.start, declaration.end);
}).join('\n');
const extract = vm.runInNewContext(`${helperSource}\nextractCssReferences`);

function references(css) {
  return Array.from(extract(css, 'css-regression-fixture'));
}

test('CSS references preserve url quoting, casing, whitespace and unquoted paths', () => {
  assert.deepEqual(references([
    'a { background: URL ( " ./images/hero.png " ); }',
    "b { background: url( './images/other image.png' ); }",
    'c { background: url( ./images/plain.png?size=2#detail ); }',
    'd { background: url\u00a0(\uFEFF"./images/unicode-space.png"\u00a0); }',
  ].join('\n')), [
    './images/hero.png', './images/other image.png', './images/plain.png?size=2#detail', './images/unicode-space.png',
  ]);
});

test('CSS references preserve direct imports and media suffixes', () => {
  assert.deepEqual(references([
    '@IMPORT\t" theme.css " screen and (min-width: 1px);',
    "@import\n'print.css' print;",
    '@import\u00a0"unicode-space.css";',
  ].join('\n')), ['theme.css', 'print.css', 'unicode-space.css']);
});

test('CSS reference list keeps URL-first order, direct-import order, duplicates and empty captures', () => {
  assert.deepEqual(references([
    '@import "first.css";',
    'a { background: url(shared.png), url(""), url(   ); }',
    '@import url("wrapped.css");',
    '@import "";',
    'b { background: url(shared.png); }',
    '@import "first.css";',
  ].join('\n')), ['shared.png', '', '', 'wrapped.css', 'shared.png', 'first.css', '', 'first.css']);
});

test('CSS references preserve raw escapes rather than decoding or normalizing paths', () => {
  assert.deepEqual(references(String.raw`
    a { background: url("images/a\"b.png"), url('images/a\'b.png'), url(images/a\ b.png); }
    @import "themes/a\\b.css";
  `), [String.raw`images/a\"b.png`, String.raw`images/a\'b.png`, String.raw`images/a\ b.png`, String.raw`themes/a\\b.css`]);
  assert.deepEqual(references('url("line\\\npath.png"); @import "theme\\\nnext.css";'), ['line\\\npath.png', 'theme\\\nnext.css']);
  assert.deepEqual(references(String.raw`url(a\)b.png)`), ['a\\']);
});

test('CSS references preserve comments inside strings and remove actual comments', () => {
  assert.deepEqual(references([
    '/* url(hidden.png) @import "hidden.css"; */',
    'a { background: url(/* ignored */ "images/a/*literal*/b.png" /* ignored */); }',
    '@import/* separator */"visible.css";',
    'b { background: url(/* ignored */ plain.png); }',
  ].join('\n')), ['images/a/*literal*/b.png', 'plain.png', 'visible.css']);
});

test('CSS references retain existing token boundaries and string-content discovery', () => {
  assert.deepEqual(references([
    'xurl(no.png) _url(no.png) urlSuffix(no.png) éurl(yes.png)',
    '@importx "no.css";',
    "a { content: 'url(in-content.png) @import \"in-content.css\"'; }",
  ].join('\n')), ['yes.png', 'in-content.png', 'in-content.css']);
  assert.deepEqual(references('@import " url(inner.png) "; url(outer.png)'), ['inner.png', 'outer.png', 'url(inner.png)']);
});

test('CSS references preserve quoted parentheses and legacy unquoted fallback captures', () => {
  assert.deepEqual(references([
    'url("a)b.png")',
    'url("a.png"junk)',
    "url('b.png'junk)",
    'url(a(b.png))',
    "a { content: 'url(\"nested.png)'; }",
  ].join('\n')), ['a)b.png', '"a.png"junk', "'b.png'junk", 'a(b.png', '"nested.png']);
});

test('CSS references preserve closing-quote fallback after a backslash', () => {
  assert.deepEqual(references(String.raw`a { content: 'url("a\") @import "b\"'; }`), ['a\\', 'b\\']);
});

test('CSS references keep malformed non-string URLs ignored and later references visible', () => {
  assert.deepEqual(references('url("closed.png"; @import "visible.css";'), ['visible.css']);
  assert.deepEqual(references('url(unterminated'), []);
  assert.deepEqual(references('@import not-quoted; url(valid.png)'), ['valid.png']);
});

test('CSS references retain labelled errors for globally unterminated comments and strings', () => {
  assert.throws(() => references('/* unfinished'), { message: 'Unterminated CSS comment in css-regression-fixture' });
  assert.throws(() => references('url("unfinished'), { message: 'Unterminated CSS string in css-regression-fixture' });
  assert.throws(() => references("@import 'unfinished"), { message: 'Unterminated CSS string in css-regression-fixture' });
});

// Each hostile fixture runs in its own process. A regression must time out that
// disposable child, never hold the main test runner inside a pathological regex.
const childProgram = String.raw`
  import { readFileSync } from 'node:fs';
  import { createHash } from 'node:crypto';
  import vm from 'node:vm';
  const { helperSource, css } = JSON.parse(readFileSync(0, 'utf8'));
  const extract = vm.runInNewContext(helperSource + '\nextractCssReferences');
  try {
    const result = Array.from(extract(css, 'bounded-css-fixture'));
    process.stdout.write(JSON.stringify({
      count: result.length,
      digest: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error.message }));
  }
`;

function boundedReferences(css, expectedReferences, expectedError) {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram], {
    input: JSON.stringify({ helperSource, css }),
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  assert.equal(child.error, undefined, `CSS helper child failed or exceeded the 5000 ms bound: ${child.error?.code}`);
  assert.equal(child.signal, null, 'CSS helper child must exit without a signal');
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const expected = expectedError ? { error: expectedError } : {
    count: expectedReferences.length,
    digest: createHash('sha256').update(JSON.stringify(expectedReferences)).digest('hex'),
  };
  assert.deepEqual(JSON.parse(child.stdout), expected);
}

for (const quote of ['"', "'"]) {
  const quoteLabel = quote === '"' ? 'double' : 'single';
  const outerQuote = quote === '"' ? "'" : '"';
  const backslashes = '\\'.repeat(30000);

  test(`CSS bounded parsing: ${quoteLabel}-quoted URL with backslashes but no closing parenthesis`, () => {
    boundedReferences(`url(${quote}${backslashes}${quote};`, []);
  });

  test(`CSS bounded parsing: nested unterminated ${quoteLabel}-quoted import with backslashes`, () => {
    boundedReferences(`a { content: ${outerQuote}@import ${quote}${backslashes}${outerQuote}; }`, []);
  });

  test(`CSS bounded parsing: nested unterminated ${quoteLabel}-quoted URL falls back safely`, () => {
    boundedReferences(`a { content: ${outerQuote}url(${quote}${backslashes})${outerQuote}; }`, [quote + backslashes]);
  });

  test(`CSS bounded parsing: long valid ${quoteLabel}-quoted URL and import keep their captures`, () => {
    boundedReferences(`url(${quote}${backslashes}${quote}); @import ${quote}${backslashes}${quote};`, [backslashes, backslashes]);
  });

  test(`CSS bounded parsing: globally unterminated ${quoteLabel}-quoted string fails closed`, () => {
    boundedReferences(`url(${quote}${backslashes}`, [], 'Unterminated CSS string in bounded-css-fixture');
  });
}

test('CSS bounded parsing: repeated malformed URL prefixes do not rescan the remaining suffix', () => {
  boundedReferences('url('.repeat(30000), []);
});

test('CSS bounded parsing: repeated malformed imports preserve a final valid reference', () => {
  boundedReferences('@import \t'.repeat(30000) + 'url(valid.png)', ['valid.png']);
});
