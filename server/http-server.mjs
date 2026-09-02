import { createServer } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { checkPermission, validateRoleFromSession } from './access-policy.mjs';
import { createSessionStore } from './session-store.mjs';
import { createCustomerRepository } from './customer-repository.mjs';
import { createInquiryRepository } from './inquiry-repository.mjs';
import { createCustomerInquiryApi } from './customer-inquiry-api.mjs';

const scryptAsync = promisify(scrypt);
const DUMMY_CREDENTIAL = {
  salt: '00000000000000000000000000000000',
  passwordHash: '0000000000000000000000000000000000000000000000000000000000000000',
};

/**
 * Configuration and credential mapping
 * In production, credentials would come from secure credential management
 */
class CredentialManager {
  constructor(credentials) {
    // credentials format: { actorId: { username, passwordHash, salt, role } }
    this.credentials = credentials;
  }

  /**
   * Verify password against stored hash using timingSafeEqual
   * @param {string} password - Raw password
   * @param {string} storedHash - Stored bcrypt/scrypt hash (hex)
   * @param {string} salt - Salt used for hashing (hex)
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, storedHash, salt) {
    try {
      const saltBuffer = Buffer.from(salt, 'hex');
      const hashBuffer = await scryptAsync(password, saltBuffer, 32);
      const computedHash = hashBuffer.toString('hex');
      const storedHashBuffer = Buffer.from(storedHash, 'hex');
      const computedHashBuffer = Buffer.from(computedHash, 'hex');
      return timingSafeEqual(computedHashBuffer, storedHashBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Find actor by username
   * @returns {{ actorId, role } | null}
   */
  async authenticate(username, password) {
    let matchedActor = null;
    let matchedCredential = null;

    for (const [actorId, cred] of Object.entries(this.credentials)) {
      if (cred.username === username) {
        matchedActor = { actorId, role: cred.role };
        matchedCredential = cred;
        break;
      }
    }

    const credential = matchedCredential || DUMMY_CREDENTIAL;
    const isValid = await this.verifyPassword(password, credential.passwordHash, credential.salt);
    if (matchedActor && isValid) {
      return matchedActor;
    }

    return null;
  }
}

/**
 * Rate limiter for login attempts
 * Simple in-memory implementation
 */
class RateLimiter {
  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000, maxEntries = 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    // Map<ip, { attempts, resetTime }>
    this.attempts = new Map();
  }

  isLimited(ip) {
    const now = Date.now();
    this.cleanupExpired(now);
    const record = this.attempts.get(ip);

    if (!record) {
      if (this.attempts.size >= this.maxEntries) {
        return true;
      }
      this.attempts.set(ip, { attempts: 1, resetTime: now + this.windowMs });
      return false;
    }

    record.attempts++;
    return record.attempts > this.maxAttempts;
  }

  cleanupExpired(now = Date.now()) {
    for (const [ip, record] of this.attempts) {
      if (now >= record.resetTime) {
        this.attempts.delete(ip);
      }
    }
  }

  reset(ip) {
    this.attempts.delete(ip);
  }
}

/**
 * HTTP Server for Phase 2C-A session & permission foundation
 */
export class HttpServer {
  constructor(options = {}) {
    this.sessionStore = createSessionStore();
    this.credentialManager = new CredentialManager(options.credentials || {});
    this.rateLimiter = new RateLimiter(
      options.maxLoginAttempts || 5,
      options.rateLimitWindowMs || 15 * 60 * 1000,
      options.maxRateLimitEntries || 1000,
    );
    this.server = null;
    this.port = options.port || 8080;
    this.host = options.host || '127.0.0.1';
    this.maxBodySize = options.maxBodySize || 16 * 1024; // 16KB
    this.sessionExpiry = options.sessionExpiry || 24 * 60 * 60 * 1000; // 24 hours
    this.customerInquiryApi = options.customerInquiryApi || (options.db
      ? createCustomerInquiryApi({
        customers: createCustomerRepository(options.db),
        inquiries: createInquiryRepository(options.db),
        getSession: (req) => {
          const token = this.getSessionToken(req);
          return token ? this.sessionStore.get(token) : null;
        },
        parseJsonBody: (req) => this.parseJsonBody(req),
      })
      : null);
  }

  /**
   * Parse JSON body with size limit
   */
  async parseJsonBody(req) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      throw { status: 415, message: 'Unsupported Media Type' };
    }

    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > this.maxBodySize) {
          req.destroy();
          reject({ status: 413, message: 'Payload Too Large' });
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch {
          reject({ status: 400, message: 'Malformed JSON' });
        }
      });

      req.on('error', () => {
        reject({ status: 400, message: 'Bad Request' });
      });
    });
  }

  /**
   * Get client IP
   */
  getClientIp(req) {
    return req.socket.remoteAddress;
  }

  /**
   * Validate Host and Origin headers
   */
  validateHostOrigin(req) {
    const host = req.headers.host || '';
    const origin = req.headers.origin || '';

    // For localhost development, be permissive
    if (!host.includes('127.0.0.1') && !host.includes('localhost')) {
      return false;
    }

    if (origin && !origin.includes('127.0.0.1') && !origin.includes('localhost')) {
      return false;
    }

    return true;
  }

  /**
   * Set secure session cookie
   */
  setSessionCookie(res, token, expiresAt) {
    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
    const cookie = `bk_dashboard_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
    res.setHeader('Set-Cookie', cookie);
  }

  /**
   * Clear session cookie
   */
  clearSessionCookie(res) {
    res.setHeader('Set-Cookie', 'bk_dashboard_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  }

  /**
   * Get session token from cookie
   */
  getSessionToken(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/bk_dashboard_session=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Set security headers
   */
  setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }

  /**
   * Handle GET /api/health
   */
  handleHealth(req, res) {
    this.setSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  }

  /**
   * Handle POST /api/session (login)
   */
  async handlePostSession(req, res) {
    try {
      this.setSecurityHeaders(res);

      const clientIp = this.getClientIp(req);

      // Rate limiting
      if (this.rateLimiter.isLimited(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many login attempts' }));
        return;
      }

      const body = await this.parseJsonBody(req);
      const { username, password } = body;

      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
      }

      // Generic error message for security
      const genericError = { error: 'Invalid credentials' };

      const actor = await this.credentialManager.authenticate(username, password);
      if (!actor) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(genericError));
        return;
      }

      // Generate high-entropy session token
      const token = randomBytes(32).toString('hex');
      const expiresAt = Date.now() + this.sessionExpiry;

      // Store session (token is hashed in session store)
      this.sessionStore.create(token, actor.actorId, actor.role, expiresAt);

      // Set cookie
      this.setSessionCookie(res, token, expiresAt);

      // Reset rate limit on successful login
      this.rateLimiter.reset(clientIp);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      if (error.status) {
        res.writeHead(error.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  }

  /**
   * Handle GET /api/session
   */
  handleGetSession(req, res) {
    try {
      this.setSecurityHeaders(res);

      const token = this.getSessionToken(req);
      if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const session = this.sessionStore.get(token);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Validate role
      validateRoleFromSession(session.role);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        actorId: session.actorId,
        role: session.role,
        expiresAt: session.expiresAt,
      }));
    } catch (error) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
  }

  /**
   * Handle DELETE /api/session (logout)
   */
  handleDeleteSession(req, res) {
    try {
      this.setSecurityHeaders(res);

      const token = this.getSessionToken(req);
      if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const session = this.sessionStore.get(token);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Delete session
      this.sessionStore.delete(token);

      // Clear cookie
      this.clearSessionCookie(res);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  /**
   * Route request to appropriate handler
   */
  async route(req, res) {
    this.setSecurityHeaders(res);

    // Validate Host/Origin
    if (!this.validateHostOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    const { method, url } = req;

    if (this.customerInquiryApi) {
      const handled = await this.customerInquiryApi.handle(req, res);
      if (handled !== false) return;
    }

    if (url === '/api/health' && method === 'GET') {
      this.handleHealth(req, res);
    } else if (url === '/api/session' && method === 'POST') {
      await this.handlePostSession(req, res);
    } else if (url === '/api/session' && method === 'GET') {
      this.handleGetSession(req, res);
    } else if (url === '/api/session' && method === 'DELETE') {
      this.handleDeleteSession(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  /**
   * Create and start HTTP server
   */
  listen() {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.route(req, res).catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        });
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Close server
   */
  close() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get server info for testing
   */
  getInfo() {
    return {
      host: this.host,
      port: this.port,
      url: `http://${this.host}:${this.port}`,
    };
  }
}

export const createHttpServer = (options) => new HttpServer(options);
