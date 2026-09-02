import { createHash } from 'node:crypto';

/**
 * In-memory session store for Phase 2C-A.
 * Stores hashed session tokens, not raw tokens.
 * Session: { actorId, role, expiresAt }
 */
class SessionStore {
  constructor() {
    // Map<tokenHash, { actorId, role, expiresAt }>
    this.sessions = new Map();
  }

  /**
   * Hash a session token using SHA-256
   * @param {string} token - Raw session token
   * @returns {string} Hex-encoded SHA-256 hash
   */
  static hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create a new session
   * @param {string} token - Raw session token
   * @param {string} actorId - User ID / actor identifier
   * @param {string} role - 'editor' or 'viewer'
   * @param {number} expiresAt - Unix timestamp (ms) when session expires
   */
  create(token, actorId, role, expiresAt) {
    const hash = SessionStore.hashToken(token);
    this.sessions.set(hash, { actorId, role, expiresAt });
  }

  /**
   * Get session by token
   * @param {string} token - Raw session token
   * @returns {{ actorId, role, expiresAt } | null} Session or null if not found/expired
   */
  get(token) {
    const hash = SessionStore.hashToken(token);
    const session = this.sessions.get(hash);

    if (!session) {
      return null;
    }

    // Check expiry
    if (Date.now() >= session.expiresAt) {
      this.sessions.delete(hash);
      return null;
    }

    return session;
  }

  /**
   * Delete a session by token
   * @param {string} token - Raw session token
   * @returns {boolean} True if deleted, false if not found
   */
  delete(token) {
    const hash = SessionStore.hashToken(token);
    return this.sessions.delete(hash);
  }

  /**
   * Delete all sessions for a given actor (for logout)
   * @param {string} actorId - User ID / actor identifier
   */
  deleteByActorId(actorId) {
    const toDelete = [];
    for (const [hash, session] of this.sessions.entries()) {
      if (session.actorId === actorId) {
        toDelete.push(hash);
      }
    }
    toDelete.forEach((hash) => this.sessions.delete(hash));
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpired() {
    const now = Date.now();
    const toDelete = [];
    for (const [hash, session] of this.sessions.entries()) {
      if (now >= session.expiresAt) {
        toDelete.push(hash);
      }
    }
    toDelete.forEach((hash) => this.sessions.delete(hash));
  }

  /**
   * Get session count (for testing)
   */
  getCount() {
    return this.sessions.size;
  }
}

export const createSessionStore = () => new SessionStore();
