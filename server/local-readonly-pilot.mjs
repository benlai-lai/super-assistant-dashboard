import { randomBytes, scrypt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import { openPhase2bDatabase } from './database.mjs';
import { createCustomerRepository } from './customer-repository.mjs';
import { HttpServer } from './http-server.mjs';
import { createInquiryRepository } from './inquiry-repository.mjs';

const scryptAsync = promisify(scrypt);
const LOOPBACK_HOST = '127.0.0.1';
const PILOT_PORT = 18885;
const PILOT_ACTOR_ID = 'local-readonly-pilot-viewer';
const PILOT_USERNAME = 'pilot-viewer';
const SESSION_COOKIE = 'bk_dashboard_pilot_session';
const ID_PATTERN = '[A-Za-z0-9][A-Za-z0-9_-]{1,80}';
const SAFE_FETCH_SITES = new Set(['none', 'same-origin']);
const SENSITIVE_SINGLE_HEADERS = new Set([
  'host',
  'origin',
  'sec-fetch-site',
  'cookie',
  'content-type',
  'content-length',
  'transfer-encoding',
]);
const STATIC_ROUTES = Object.freeze([
  Object.freeze({ path: '/pilot/', file: 'index.html', type: 'text/html; charset=utf-8' }),
  Object.freeze({ path: '/pilot/pilot.css', file: 'pilot.css', type: 'text/css; charset=utf-8' }),
  Object.freeze({ path: '/pilot/pilot.js', file: 'pilot.js', type: 'text/javascript; charset=utf-8' }),
]);

function headerCardinalityIsSafe(req) {
  const counts = new Map();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index].toLowerCase();
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...SENSITIVE_SINGLE_HEADERS].every((name) => (counts.get(name) || 0) <= 1)
    && counts.get('host') === 1;
}

function parseRequestTarget(target) {
  if (
    typeof target !== 'string'
    || !target.startsWith('/')
    || target.startsWith('//')
    || target.includes('\\')
    || target.includes('#')
    || target.includes('%')
    || /[\u0000-\u001f\u007f]/.test(target)
  ) {
    return null;
  }

  try {
    return new URL(target, 'http://127.0.0.1');
  } catch {
    return null;
  }
}

function validListQuery(url) {
  if ([...url.searchParams.keys()].some((key) => key !== 'limit')) return false;
  const limits = url.searchParams.getAll('limit');
  return limits.length <= 1 && (limits.length === 0 || /^\d{1,3}$/.test(limits[0]));
}

function isAllowedApiRequest(method, url) {
  if (url.pathname === '/api/session') {
    return url.search === '' && ['GET', 'POST', 'DELETE'].includes(method);
  }
  if (method !== 'GET') return false;
  if (url.pathname === '/api/customers' || url.pathname === '/api/inquiries') {
    return validListQuery(url);
  }
  if (url.search !== '') return false;
  return new RegExp(`^/api/customers/${ID_PATTERN}$`).test(url.pathname)
    || new RegExp(`^/api/inquiries/${ID_PATTERN}$`).test(url.pathname)
    || new RegExp(`^/api/inquiries/${ID_PATTERN}/items$`).test(url.pathname);
}

function writePlain(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function seedPilotDatabase(db) {
  const customers = createCustomerRepository(db);
  const inquiries = createInquiryRepository(db);
  const createdAt = '2026-09-06T00:00:00.000Z';

  customers.create({
    id: 'pilot-customer-one',
    displayName: '範例客戶：晨光企業',
    contactName: '王小明（合成）',
    email: 'pilot-contact@example.test',
    phone: '0900-000-001',
    createdAt,
  });
  customers.create({
    id: 'pilot-customer-empty',
    displayName: '範例客戶：尚無詢價',
    createdAt: '2026-09-06T00:01:00.000Z',
  });

  inquiries.create({
    id: 'pilot-inquiry-one',
    customerId: 'pilot-customer-one',
    title: '秋季活動提袋',
    status: 'active',
    createdAt: '2026-09-06T00:02:00.000Z',
    updatedAt: '2026-09-06T00:02:00.000Z',
  });
  inquiries.create({
    id: 'pilot-inquiry-two',
    customerId: 'pilot-customer-one',
    title: '空白品項示範',
    status: 'draft',
    createdAt: '2026-09-06T00:03:00.000Z',
    updatedAt: '2026-09-06T00:03:00.000Z',
  });
  inquiries.create({
    id: 'pilot-inquiry-three',
    customerId: 'pilot-customer-one',
    title: '年度禮贈品補充',
    status: 'closed',
    createdAt: '2026-09-06T00:04:00.000Z',
    updatedAt: '2026-09-06T00:04:00.000Z',
  });

  inquiries.addItem({
    id: 'pilot-item-one',
    inquiryId: 'pilot-inquiry-one',
    description: '帆布提袋（合成品項）',
    quantity: 120,
    notes: '僅供本機試用',
    createdAt: '2026-09-06T00:05:00.000Z',
  });
  inquiries.addItem({
    id: 'pilot-item-two',
    inquiryId: 'pilot-inquiry-one',
    description: '紙盒包裝（合成品項）',
    quantity: 120,
    createdAt: '2026-09-06T00:06:00.000Z',
  });
  inquiries.addItem({
    id: 'pilot-item-three',
    inquiryId: 'pilot-inquiry-three',
    description: '保溫袋（合成品項）',
    quantity: 40,
    notes: '已結案範例',
    createdAt: '2026-09-06T00:07:00.000Z',
  });

  const migrations = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
  if (JSON.stringify(migrations.map(({ version }) => version)) !== '[1,2,3,4]') {
    throw new Error('Pilot database did not reach schema migrations 1-4');
  }

  const counts = Object.freeze({
    customers: db.prepare('SELECT COUNT(*) AS count FROM customers').get().count,
    inquiries: db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count,
    items: db.prepare('SELECT COUNT(*) AS count FROM inquiry_items').get().count,
  });
  const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all();
  if (counts.customers !== 2 || counts.inquiries !== 3 || counts.items !== 3) {
    throw new Error('Pilot database seed count mismatch');
  }
  if (foreignKeyErrors.length !== 0) {
    throw new Error('Pilot database seed violates a foreign key');
  }

  return Object.freeze({
    ...counts,
    migrations: Object.freeze(migrations.map(({ version, name }) => Object.freeze({ version, name }))),
  });
}

async function createCredential(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return {
    [PILOT_ACTOR_ID]: {
      username: PILOT_USERNAME,
      passwordHash: hash.toString('hex'),
      salt: salt.toString('hex'),
      role: 'viewer',
    },
  };
}

export class LocalReadonlyPilotServer extends HttpServer {
  constructor(options) {
    super(options);
    this.expectedHost = null;
    this.staticResponses = options.staticResponses;
  }

  setSecurityHeaders(res) {
    super.setSecurityHeaders(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "img-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  validateHostOrigin(req) {
    if (!this.expectedHost || !headerCardinalityIsSafe(req)) return false;
    if (req.headers.host !== this.expectedHost) return false;

    const expectedOrigin = `http://${this.expectedHost}`;
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== expectedOrigin) return false;
    if (['POST', 'DELETE'].includes(req.method) && origin !== expectedOrigin) return false;

    const fetchSite = req.headers['sec-fetch-site'];
    return fetchSite === undefined || SAFE_FETCH_SITES.has(fetchSite);
  }

  setSessionCookie(res, token, expiresAt) {
    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
    );
  }

  clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }

  getSessionToken(req) {
    const values = String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
      .map((part) => part.slice(SESSION_COOKIE.length + 1));
    return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]) ? values[0] : null;
  }

  async listen() {
    await new Promise((resolve, reject) => {
      this.server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        this.route(req, res).catch(() => {
          if (!res.headersSent) {
            this.setSecurityHeaders(res);
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        });
      });
      this.server.listen(this.port, this.host, resolve);
      this.server.on('error', reject);
    });
    const address = this.server.address();
    if (!address || typeof address === 'string' || address.address !== LOOPBACK_HOST) {
      this.server.closeAllConnections?.();
      await super.close();
      throw new Error('Pilot listener is not bound to the authorized loopback address');
    }
    this.port = address.port;
    this.expectedHost = `${LOOPBACK_HOST}:${address.port}`;
  }

  async route(req, res) {
    this.setSecurityHeaders(res);
    if (!this.validateHostOrigin(req)) {
      writePlain(res, 403, 'Forbidden');
      return;
    }

    const url = parseRequestTarget(req.url);
    if (!url) {
      writePlain(res, 400, 'Bad Request');
      return;
    }

    const staticResponse = this.staticResponses.get(url.pathname);
    if (staticResponse && url.search === '' && ['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(200, {
        'Content-Type': staticResponse.type,
        'Content-Length': staticResponse.body.byteLength,
      });
      res.end(req.method === 'HEAD' ? undefined : staticResponse.body);
      return;
    }

    if (!isAllowedApiRequest(req.method, url)) {
      writePlain(res, 404, 'Not Found');
      return;
    }

    await super.route(req, res);
  }
}

export async function createLocalReadonlyPilot({
  host = LOOPBACK_HOST,
  port = PILOT_PORT,
  sessionExpiry = 30 * 60 * 1000,
  password = randomBytes(18).toString('base64url'),
  pilotDirectory = fileURLToPath(new URL('../pilot/', import.meta.url)),
} = {}) {
  if (host !== LOOPBACK_HOST) throw new Error('Local read-only pilot must bind to 127.0.0.1');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid pilot port');
  if (!Number.isSafeInteger(sessionExpiry) || sessionExpiry < 1) throw new Error('Invalid session expiry');

  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Pilot password must contain 12 to 128 characters.');
  }

  const db = openPhase2bDatabase(':memory:');
  try {
    const seed = seedPilotDatabase(db);
    const credentials = await createCredential(password);
    const staticResponses = new Map();
    for (const route of STATIC_ROUTES) {
      staticResponses.set(route.path, {
        type: route.type,
        body: await readFile(new URL(route.file, pathToFileURL(`${pilotDirectory}/`))),
      });
    }

    const server = new LocalReadonlyPilotServer({
      host,
      port,
      db,
      credentials,
      sessionExpiry,
      staticResponses,
    });
    let closed = false;
    let closePromise = null;

    async function close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        let firstError = null;
        try {
          if (server.server?.listening) {
            server.server.closeIdleConnections?.();
            const forceTimer = setTimeout(() => server.server?.closeAllConnections?.(), 2_000);
            forceTimer.unref?.();
            try {
              await server.close();
            } catch (error) {
              firstError = error;
            } finally {
              clearTimeout(forceTimer);
            }
          }
        } finally {
          server.sessionStore.deleteByActorId(PILOT_ACTOR_ID);
          try {
            db.close();
          } catch (error) {
            firstError ||= error;
          }
          closed = true;
        }
        if (firstError) throw firstError;
      })();
      return closePromise;
    }

    return {
      server,
      db,
      username: PILOT_USERNAME,
      password,
      seed,
      get url() {
        return server.expectedHost ? `http://${server.expectedHost}/pilot/` : null;
      },
      get closed() {
        return closed;
      },
      close,
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function startLocalReadonlyPilot(options = {}) {
  const pilot = await createLocalReadonlyPilot(options);
  try {
    await pilot.server.listen();
    return pilot;
  } catch (error) {
    await pilot.close();
    throw error;
  }
}

export function readInteractivePilotPassword({ input = process.stdin, output = process.stdout, signals = process } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('An interactive terminal is required.'));
  }
  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw);
    const wasFlowing = input.readableFlowing === true;
    const decoder = new StringDecoder('utf8');
    let first = '';
    let current = '';
    let confirming = false;
    let settled = false;
    let previousCR = false;
    const prompt = () => output.write(confirming ? 'Confirm temporary password: ' : 'Set temporary password (12-128 characters): ');
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      input.removeListener('end', cancel);
      input.removeListener('error', cancel);
      signals.removeListener('SIGINT', cancel);
      signals.removeListener('SIGTERM', cancel);
      try {
        input.setRawMode(wasRaw);
      } catch {
        error = new Error('Unable to restore terminal state.');
      } finally {
        if (wasFlowing) input.resume();
        else input.pause();
        first = '';
        current = '';
      }
      if (error) reject(error);
      else resolve(value);
    };
    const cancel = () => finish(new Error('Password entry cancelled.'));
    const onData = (chunk) => {
      try {
        const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
        for (const char of text) {
          if (settled) break;
          if (char === '\n' && previousCR) { previousCR = false; continue; }
          previousCR = char === '\r';
          if (['\u0003', '\u0004', '\u001a', '\u001b'].includes(char)) { cancel(); break; }
          if (char === '\r' || char === '\n') {
            output.write('\n');
            if (!confirming && current.length >= 12 && current.length <= 128) {
              first = current;
              current = '';
              confirming = true;
            } else if (confirming && current === first) {
              finish(null, first);
              break;
            } else {
              first = '';
              current = '';
              confirming = false;
              output.write('Password length or confirmation did not match. Please try again.\n');
            }
            prompt();
          } else if (char === '\u007f' || char === '\b') {
            current = Array.from(current).slice(0, -1).join('');
          } else if (char.codePointAt(0) >= 32) {
            if (current.length + char.length > 128) { cancel(); break; }
            current += char;
          } else {
            cancel();
            break;
          }
        }
      } catch {
        finish(new Error('Unable to read password input.'));
      }
    };
    input.on('data', onData);
    input.once('end', cancel);
    input.once('error', cancel);
    signals.once('SIGINT', cancel);
    signals.once('SIGTERM', cancel);
    try {
      input.setRawMode(true);
      prompt();
      input.resume();
    } catch {
      finish(new Error('Unable to initialize password input.'));
    }
  });
}

async function runCli() {
  let password = await readInteractivePilotPassword();
  let pilot;
  try {
    pilot = await startLocalReadonlyPilot({ host: LOOPBACK_HOST, port: PILOT_PORT, password });
  } finally {
    password = undefined;
  }
  console.log(`Local read-only pilot: ${pilot.url}`);
  console.log('Press Ctrl+C to stop and erase the in-memory database.');

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await pilot.close();
      process.exitCode = 0;
    } catch {
      console.error('Unable to stop the local read-only pilot.');
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(() => {
    console.error('Unable to start the local read-only pilot.');
    process.exitCode = 1;
  });
}
