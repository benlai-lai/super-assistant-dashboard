import { assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

export function createInquiryRepository(db) {
  function get(id) {
    assertId(id, 'inquiry id');
    return db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id) ?? null;
  }

  function requireInquiry(id) {
    return ensureFound(get(id), 'Unknown inquiry');
  }

  return {
    create(inquiry) {
      assertId(inquiry.id, 'inquiry id');
      assertId(inquiry.customerId, 'customer id');
      assertIsoDateTime(inquiry.createdAt, 'createdAt');
      assertIsoDateTime(inquiry.updatedAt, 'updatedAt');
      return runInTransaction(db, () => {
        ensureFound(
          db.prepare('SELECT id FROM customers WHERE id = ?').get(inquiry.customerId),
          'Unknown customer',
        );
        db.prepare(`
          INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          inquiry.id,
          inquiry.customerId,
          inquiry.title,
          inquiry.status ?? 'draft',
          inquiry.createdAt,
          inquiry.updatedAt,
        );
        return requireInquiry(inquiry.id);
      });
    },
    addItem(item) {
      assertId(item.id, 'inquiry item id');
      assertId(item.inquiryId, 'inquiry id');
      assertIsoDateTime(item.createdAt, 'createdAt');
      return runInTransaction(db, () => {
        requireInquiry(item.inquiryId);
        db.prepare(`
          INSERT INTO inquiry_items (id, inquiry_id, description, quantity, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          item.id,
          item.inquiryId,
          item.description,
          item.quantity,
          item.notes ?? null,
          item.createdAt,
        );
        return this.getItem(item.id);
      });
    },
    get,
    require: requireInquiry,
    getItem(id) {
      assertId(id, 'inquiry item id');
      return db.prepare('SELECT * FROM inquiry_items WHERE id = ?').get(id) ?? null;
    },
    requireItemInInquiry(itemId, inquiryId) {
      assertId(itemId, 'inquiry item id');
      assertId(inquiryId, 'inquiry id');
      return ensureFound(
        db.prepare('SELECT * FROM inquiry_items WHERE id = ? AND inquiry_id = ?').get(itemId, inquiryId),
        'Unknown inquiry item for inquiry',
      );
    },
    listItems(inquiryId) {
      requireInquiry(inquiryId);
      return db.prepare('SELECT * FROM inquiry_items WHERE inquiry_id = ? ORDER BY created_at, id').all(inquiryId);
    },
  };
}
