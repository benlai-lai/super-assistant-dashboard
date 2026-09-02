import { assertId, assertIsoDateTime } from './database.mjs';

export function createAuditRepository(db) {
  return {
    log(entry) {
      assertId(entry.id, 'audit id');
      assertId(entry.entityId, 'audit entity id');
      assertIsoDateTime(entry.createdAt, 'createdAt');
      const payloadJson = JSON.stringify(entry.payload ?? {});
      db.prepare(`
        INSERT INTO audit_logs (id, entity_type, entity_id, action, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(entry.id, entry.entityType, entry.entityId, entry.action, payloadJson, entry.createdAt);
      return db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(entry.id);
    },
    listForEntity(entityType, entityId) {
      assertId(entityId, 'audit entity id');
      return db.prepare('SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at, id').all(entityType, entityId);
    },
  };
}
