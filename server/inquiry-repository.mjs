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

  function staleVersion(label) {
    const error = new Error(`Stale ${label} version`);
    error.status = 409;
    error.code = 'stale_version';
    return error;
  }

  function transact(options, operation) {
    return options?.inTransaction ? operation() : runInTransaction(db, operation);
  }

  return {
    create(inquiry, options = {}) {
      assertId(inquiry.id, 'inquiry id');
      assertId(inquiry.customerId, 'customer id');
      assertIsoDateTime(inquiry.createdAt, 'createdAt');
      assertIsoDateTime(inquiry.updatedAt, 'updatedAt');
      return transact(options, () => {
        ensureFound(
          db.prepare('SELECT id FROM customers WHERE id = ?').get(inquiry.customerId),
          'Unknown customer',
        );
        db.prepare(`
          INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at, row_version)
          VALUES (?, ?, ?, ?, ?, ?, 1)
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
    update(id, patch, options = {}) {
      assertId(id, 'inquiry id');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid inquiry patch');
      const entries = Object.entries(patch);
      if (entries.length === 0 || entries.some(([key]) => !inquiryUpdateColumns[key])) throw new Error('Invalid inquiry patch');
      const timestamp = options.updatedAt ?? new Date().toISOString();
      assertIsoDateTime(timestamp, 'updatedAt');
      return transact(options, () => {
        requireInquiry(id);
        const assignments = entries.map(([key]) => `${inquiryUpdateColumns[key]} = ?`).join(', ');
        const versionClause = options.expectedVersion === undefined ? '' : ' AND row_version = ?';
        const values = [...entries.map(([, value]) => value), timestamp, id];
        if (options.expectedVersion !== undefined) values.push(options.expectedVersion);
        const result = db.prepare(`
          UPDATE inquiries
          SET ${assignments}, updated_at = ?, row_version = row_version + 1
          WHERE id = ?${versionClause}
        `).run(...values);
        if (result.changes !== 1) throw staleVersion('inquiry');
        return requireInquiry(id);
      });
    },
    addItem(item, options = {}) {
      assertId(item.id, 'inquiry item id');
      assertId(item.inquiryId, 'inquiry id');
      assertIsoDateTime(item.createdAt, 'createdAt');
      return transact(options, () => {
        requireInquiry(item.inquiryId);
        db.prepare(`
          INSERT INTO inquiry_items
            (id, inquiry_id, description, quantity, notes, created_at, updated_at, row_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          item.id,
          item.inquiryId,
          item.description,
          item.quantity,
          item.notes ?? null,
          item.createdAt,
          item.updatedAt ?? item.createdAt,
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
    updateItem(inquiryId, itemId, patch, options = {}) {
      assertId(inquiryId, 'inquiry id');
      assertId(itemId, 'inquiry item id');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid inquiry item patch');
      const entries = Object.entries(patch);
      if (entries.length === 0 || entries.some(([key]) => !itemUpdateColumns[key])) throw new Error('Invalid inquiry item patch');
      const timestamp = options.updatedAt ?? new Date().toISOString();
      assertIsoDateTime(timestamp, 'updatedAt');
      return transact(options, () => {
        this.requireItemInInquiry(itemId, inquiryId);
        const assignments = entries.map(([key]) => `${itemUpdateColumns[key]} = ?`).join(', ');
        const versionClause = options.expectedVersion === undefined ? '' : ' AND row_version = ?';
        const values = [...entries.map(([, value]) => value), timestamp, itemId, inquiryId];
        if (options.expectedVersion !== undefined) values.push(options.expectedVersion);
        const result = db.prepare(`
          UPDATE inquiry_items
          SET ${assignments}, updated_at = ?, row_version = row_version + 1
          WHERE id = ? AND inquiry_id = ?${versionClause}
        `).run(...values);
        if (result.changes !== 1) throw staleVersion('inquiry item');
        return this.getItem(itemId);
      });
    },
  };
}
