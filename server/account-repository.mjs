import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

const scryptAsync = promisify(scrypt);
const PASSWORD_ALGORITHM = 'scrypt-v1';
const DUMMY_SALT = Buffer.alloc(16).toString('hex');
const DUMMY_HASH = Buffer.alloc(32).toString('hex');
const VALID_ROLES = new Set(['editor', 'viewer', 'approver']);

function usernameKey(username) {
  if (typeof username !== 'string') throw new Error('Invalid username');
  const normalized = username.normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) throw new Error('Invalid username');
  return normalized;
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Password must contain 12 to 128 characters');
  }
}

async function passwordDigest(password, saltHex) {
  const result = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 32);
  return Buffer.from(result);
}

function publicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.is_active === 1,
    sessionEpoch: row.session_epoch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAccountRepository(db, { now = () => new Date().toISOString() } = {}) {
  function getRow(id) {
    assertId(id, 'account id');
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) ?? null;
  }

  async function passwordFields(password) {
    assertPassword(password);
    const salt = randomBytes(16).toString('hex');
    const hash = await passwordDigest(password, salt);
    return { salt, hash: hash.toString('hex') };
  }

  return {
    async create({ id, username, password, role = 'editor' }) {
      assertId(id, 'account id');
      if (!VALID_ROLES.has(role)) throw new Error('Invalid account role');
      const key = usernameKey(username);
      const timestamp = now();
      assertIsoDateTime(timestamp, 'account timestamp');
      const fields = await passwordFields(password);
      return runInTransaction(db, () => {
        db.prepare(`
          INSERT INTO accounts
            (id, username, username_key, password_algorithm, password_salt, password_hash,
             role, is_active, session_epoch, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(id, username.trim(), key, PASSWORD_ALGORITHM, fields.salt, fields.hash, role, timestamp, timestamp);
        return publicAccount(getRow(id));
      });
    },

    async authenticate(username, password) {
      let key = null;
      try {
        key = usernameKey(username);
      } catch {
        // Continue through the same scrypt path as an unknown account.
      }
      const row = key ? db.prepare('SELECT * FROM accounts WHERE username_key = ?').get(key) : null;
      const salt = row?.password_salt ?? DUMMY_SALT;
      const stored = Buffer.from(row?.password_hash ?? DUMMY_HASH, 'hex');
      let computed;
      try {
        computed = await passwordDigest(typeof password === 'string' ? password : '', salt);
      } catch {
        computed = Buffer.alloc(32);
      }
      const matches = stored.length === computed.length && timingSafeEqual(stored, computed);
      if (!row || !matches || row.is_active !== 1 || row.password_algorithm !== PASSWORD_ALGORITHM) return null;
      return { actorId: row.id, role: row.role, sessionEpoch: row.session_epoch };
    },

    get(id) {
      return publicAccount(getRow(id));
    },

    list() {
      return db.prepare('SELECT * FROM accounts ORDER BY username_key, id').all().map(publicAccount);
    },

    validateSession(session) {
      if (!session || typeof session.actorId !== 'string' || !Number.isInteger(session.sessionEpoch)) return false;
      const row = getRow(session.actorId);
      return Boolean(row && row.is_active === 1 && row.role === session.role && row.session_epoch === session.sessionEpoch);
    },

    disable(id) {
      const timestamp = now();
      assertIsoDateTime(timestamp, 'account timestamp');
      return runInTransaction(db, () => {
        ensureFound(getRow(id), 'Unknown account');
        db.prepare(`
          UPDATE accounts
          SET is_active = 0, session_epoch = session_epoch + 1, updated_at = ?
          WHERE id = ?
        `).run(timestamp, id);
        return publicAccount(getRow(id));
      });
    },

    async resetPassword(id, password) {
      const timestamp = now();
      assertIsoDateTime(timestamp, 'account timestamp');
      const fields = await passwordFields(password);
      return runInTransaction(db, () => {
        ensureFound(getRow(id), 'Unknown account');
        db.prepare(`
          UPDATE accounts
          SET password_algorithm = ?, password_salt = ?, password_hash = ?,
              session_epoch = session_epoch + 1, updated_at = ?
          WHERE id = ?
        `).run(PASSWORD_ALGORITHM, fields.salt, fields.hash, timestamp, id);
        return publicAccount(getRow(id));
      });
    },
  };
}
