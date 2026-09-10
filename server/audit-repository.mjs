import { assertId, assertIsoDateTime } from './database.mjs';

export function createAuditRepository(db) {
  return {
    log(entry) {
      assertId(entry.id, 'audit id');
      assertId(entry.entityId, 'audit entity id');
      if (entry.actorId !== undefined && entry.actorId !== null) assertId(entry.actorId, 'audit actor id');
      assertIsoDateTime(entry.createdAt, 'createdAt');
      const payloadJson = JSON.stringify(entry.payload ?? {});
      db.prepare(`
        INSERT INTO audit_logs
          (id, entity_type, entity_id, action, payload_json, created_at,
           actor_id, request_id, before_json, after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id,
        entry.entityType,
        entry.entityId,
        entry.action,
        payloadJson,
        entry.createdAt,
        entry.actorId ?? null,
        entry.requestId ?? null,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
      );
      return db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(entry.id);
    },
    listForEntity(entityType, entityId) {
      assertId(entityId, 'audit entity id');
      return db.prepare('SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at, id').all(entityType, entityId);
    },
  };
}
