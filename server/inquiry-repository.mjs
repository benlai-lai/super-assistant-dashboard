import { assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

export function createInquiryRepository(db) {
  const inquiryUpdateColumns = {
    title: 'title',
    status: 'status',
  };
  const itemUpdateColumns = {
    description: 'description',
    quantity: 'quantity',
    notes: 'notes',
  };

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
    list({ limit = 50 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid inquiry limit');
      return db.prepare('SELECT * FROM inquiries ORDER BY created_at, id LIMIT ?').all(limit);
    },
    update(id, patch) {
      assertId(id, 'inquiry id');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid inquiry patch');
      const entries = Object.entries(patch);
      if (entries.length === 0 || entries.some(([key]) => !inquiryUpdateColumns[key])) throw new Error('Invalid inquiry patch');
      requireInquiry(id);
      const assignments = entries.map(([key]) => `${inquiryUpdateColumns[key]} = ?`).join(', ');
      return runInTransaction(db, () => {
        db.prepare(`UPDATE inquiries SET ${assignments}, updated_at = ? WHERE id = ?`).run(
          ...entries.map(([, value]) => value),
          new Date().toISOString(),
          id,
        );
        return requireInquiry(id);
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
    updateItem(inquiryId, itemId, patch) {
      assertId(inquiryId, 'inquiry id');
      assertId(itemId, 'inquiry item id');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid inquiry item patch');
      const entries = Object.entries(patch);
      if (entries.length === 0 || entries.some(([key]) => !itemUpdateColumns[key])) throw new Error('Invalid inquiry item patch');
      return runInTransaction(db, () => {
        this.requireItemInInquiry(itemId, inquiryId);
        const assignments = entries.map(([key]) => `${itemUpdateColumns[key]} = ?`).join(', ');
        db.prepare(`UPDATE inquiry_items SET ${assignments} WHERE id = ? AND inquiry_id = ?`).run(
          ...entries.map(([, value]) => value),
          itemId,
          inquiryId,
        );
        return this.getItem(itemId);
      });
    },
  };
}
