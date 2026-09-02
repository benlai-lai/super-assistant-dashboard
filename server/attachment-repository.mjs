import { assertHttpUrl, assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

const ENTITY_TABLES = {
  inquiry: { table: 'inquiries', inquiryColumn: 'id' },
  inquiry_item: { table: 'inquiry_items', inquiryColumn: 'inquiry_id' },
  quotation_version: { table: 'quotation_versions', inquiryColumn: 'inquiry_id' },
  quotation_item: {
    query: `
      SELECT qv.inquiry_id
      FROM quotation_items qi
      JOIN quotation_versions qv ON qv.id = qi.quotation_version_id
      WHERE qi.id = ?
    `,
  },
  cost_estimate: { table: 'cost_estimates', inquiryColumn: 'inquiry_id' },
};

function assertEntityBelongsToInquiry(db, entityType, entityId, inquiryId) {
  const config = ENTITY_TABLES[entityType];
  if (!config) throw new Error('Unknown attachment entity type');
  let row;
  if (config.query) {
    row = db.prepare(config.query).get(entityId);
  } else {
    row = db.prepare(`SELECT ${config.inquiryColumn} AS inquiry_id FROM ${config.table} WHERE id = ?`).get(entityId);
  }
  if (!row || row.inquiry_id !== inquiryId) throw new Error('Attachment entity does not belong to inquiry');
}

export function createAttachmentRepository(db) {
  return {
    add(attachment) {
      assertId(attachment.id, 'attachment id');
      assertId(attachment.inquiryId, 'inquiry id');
      assertId(attachment.entityId, 'attachment entity id');
      assertHttpUrl(attachment.url);
      assertIsoDateTime(attachment.createdAt, 'createdAt');
      if (!['internal', 'customer'].includes(attachment.visibility)) throw new Error('Unknown attachment visibility');
      return runInTransaction(db, () => {
        ensureFound(db.prepare('SELECT id FROM inquiries WHERE id = ?').get(attachment.inquiryId), 'Unknown inquiry');
        assertEntityBelongsToInquiry(db, attachment.entityType, attachment.entityId, attachment.inquiryId);
        db.prepare(`
          INSERT INTO attachments (id, inquiry_id, entity_type, entity_id, title, url, visibility, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          attachment.id,
          attachment.inquiryId,
          attachment.entityType,
          attachment.entityId,
          attachment.title,
          attachment.url,
          attachment.visibility,
          attachment.createdAt,
        );
        return db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachment.id);
      });
    },
    listForInquiry(inquiryId) {
      assertId(inquiryId, 'inquiry id');
      return db.prepare('SELECT * FROM attachments WHERE inquiry_id = ? ORDER BY created_at, id').all(inquiryId);
    },
  };
}
