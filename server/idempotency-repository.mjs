import { assertId, assertIsoDateTime } from './database.mjs';

function assertToken(value, label, maximum = 160) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !/^[a-zA-Z0-9._:-]+$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

export function createIdempotencyRepository(db) {
  return {
    get(actorId, operation, key) {
      assertId(actorId, 'idempotency actor id');
      assertToken(operation, 'idempotency operation');
      assertToken(key, 'idempotency key');
      const row = db.prepare(`
        SELECT * FROM idempotency_requests
        WHERE actor_id = ? AND operation = ? AND idempotency_key = ?
      `).get(actorId, operation, key);
      if (!row) return null;
      return { ...row, response: JSON.parse(row.response_json) };
    },

    record({ actorId, operation, key, requestHash, responseStatus, response, createdAt }) {
      assertId(actorId, 'idempotency actor id');
      assertToken(operation, 'idempotency operation');
      assertToken(key, 'idempotency key');
      if (!/^[a-f0-9]{64}$/.test(requestHash)) throw new Error('idempotency request hash is invalid');
      if (!Number.isInteger(responseStatus) || responseStatus < 200 || responseStatus > 299) {
        throw new Error('idempotency response status is invalid');
      }
      assertIsoDateTime(createdAt, 'idempotency createdAt');
      db.prepare(`
        INSERT INTO idempotency_requests
          (actor_id, operation, idempotency_key, request_hash, response_status, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(actorId, operation, key, requestHash, responseStatus, JSON.stringify(response), createdAt);
    },

    count() {
      return db.prepare('SELECT COUNT(*) AS count FROM idempotency_requests').get().count;
    },
  };
}
