import { createServer as createHttpsServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpServer } from './http-server.mjs';
import { openPhase2bDatabase } from './database.mjs';
import { createAccountRepository } from './account-repository.mjs';
import { createAuditRepository } from './audit-repository.mjs';
import { createCustomerRepository } from './customer-repository.mjs';
import { createInquiryRepository } from './inquiry-repository.mjs';
import { createIdempotencyRepository } from './idempotency-repository.mjs';
import { createCustomerInquiryWriteService } from './customer-inquiry-write-service.mjs';
import { createCustomerInquiryApi } from './customer-inquiry-api.mjs';

const LOOPBACK = '127.0.0.1';
const projectRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const staticFiles = new Map([
  ['/lan-pilot/', { path: resolve(projectRoot, 'lan-pilot/index.html'), type: 'text/html; charset=utf-8' }],
  ['/lan-pilot/lan-pilot.js', { path: resolve(projectRoot, 'lan-pilot/lan-pilot.js'), type: 'text/javascript; charset=utf-8' }],
  ['/lan-pilot/lan-pilot.css', { path: resolve(projectRoot, 'lan-pilot/lan-pilot.css'), type: 'text/css; charset=utf-8' }],
]);

function isInside(parent, child) {
  const value = relative(parent, child);
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value));
}

function canonicalPotentialPath(path) {
  let existing = path;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error('Pilot data path has no existing ancestor');
    existing = parent;
  }
  return resolve(realpathSync(existing), relative(existing, path));
}

export function assertPilotDataPath(path, allowedRoot) {
  if (!isAbsolute(path) || !isAbsolute(allowedRoot)) throw new Error('Pilot data paths must be absolute');
  if (!existsSync(allowedRoot)) throw new Error('Dedicated pilot data root must already exist');
  const root = realpathSync(allowedRoot);
  const target = canonicalPotentialPath(resolve(path));
  if (!isInside(root, target)) throw new Error('Pilot data path is outside the dedicated root');
  if (isInside(projectRoot, target) || /[\\/]OneDrive[\\/]/i.test(target) || /[\\/]\.git(?:[\\/]|$)/i.test(target)) {
    throw new Error('Pilot data must remain outside Git and OneDrive');
  }
  return target;
}

function sensitiveHeadersAreSingular(req) {
  const counts = new Map();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index].toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return ['host', 'origin', 'cookie', 'idempotency-key', 'if-match'].every((name) => (counts.get(name) ?? 0) <= 1);
}

export class LanWritePilotServer extends HttpServer {
  constructor({ db, accounts, tls = null, ...options }) {
    const createNetworkServer = tls
      ? (handler) => createHttpsServer({ ...tls, joinDuplicateHeaders: true }, handler)
      : options.createNetworkServer;
    super({
      ...options,
      db: null,
      authenticator: accounts,
      sessionValidator: (session) => accounts.validateSession(session),
      secureCookies: Boolean(tls),
      createNetworkServer,
    });
    this.db = db;
    this.protocol = tls ? 'https' : 'http';
    this.expectedHost = null;
    const customers = createCustomerRepository(db);
    const inquiries = createInquiryRepository(db);
    const audit = createAuditRepository(db);
    const idempotency = createIdempotencyRepository(db);
    const writeService = createCustomerInquiryWriteService({ db, customers, inquiries, audit, idempotency });
    this.customerInquiryApi = createCustomerInquiryApi({
      customers,
      inquiries,
      audit,
      writeService,
      getSession: (req) => this.getSession(req),
      parseJsonBody: (req) => this.parseJsonBody(req),
    });
  }

  validateHostOrigin(req) {
    if (!this.expectedHost || !sensitiveHeadersAreSingular(req)) return false;
    if (req.headers.host !== this.expectedHost) return false;
    const expectedOrigin = `${this.protocol}://${this.expectedHost}`;
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== expectedOrigin) return false;
    if (['POST', 'PATCH', 'DELETE'].includes(req.method) && origin !== expectedOrigin) return false;
    return true;
  }

  setSecurityHeaders(res) {
    super.setSecurityHeaders(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  }

  async route(req, res) {
    this.setSecurityHeaders(res);
    if (!this.validateHostOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const target = new URL(req.url, `${this.protocol}://${this.expectedHost}`);
    const asset = staticFiles.get(target.pathname);
    if (asset && ['GET', 'HEAD'].includes(req.method)) {
      const body = readFileSync(asset.path);
      res.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': body.length });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return;
    }
    await super.route(req, res);
  }

  async listen() {
    await super.listen();
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to resolve pilot listener');
    this.port = address.port;
    this.expectedHost = `${this.host}:${this.port}`;
  }

  getInfo() {
    return { host: this.host, port: this.port, url: `${this.protocol}://${this.expectedHost}` };
  }
}

export async function createLanWritePilot({
  host = LOOPBACK,
  port = 0,
  databasePath,
  allowedDataRoot,
  testMode = false,
  tls = null,
  connectionOptions = {},
} = {}) {
  if (!databasePath || !allowedDataRoot) throw new Error('Pilot databasePath and allowedDataRoot are required');
  if (!tls && (host !== LOOPBACK || testMode !== true)) {
    throw new Error('Insecure pilot startup is limited to explicit loopback test mode');
  }
  const safeDatabasePath = assertPilotDataPath(databasePath, allowedDataRoot);
  mkdirSync(dirname(safeDatabasePath), { recursive: true });
  const db = openPhase2bDatabase(safeDatabasePath, {}, connectionOptions);
  const accounts = createAccountRepository(db);
  const server = new LanWritePilotServer({ host, port, db, accounts, tls });
  let closed = false;
  return {
    db,
    accounts,
    server,
    async start() {
      await server.listen();
      return this;
    },
    get url() {
      return server.getInfo().url;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await server.close();
      } finally {
        db.close();
      }
    },
  };
}
