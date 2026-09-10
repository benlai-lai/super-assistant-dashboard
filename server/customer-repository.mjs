import { assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

function staleVersion() {
  const error = new Error('Stale customer version');
  error.status = 409;
  error.code = 'stale_version';
  return error;
}

export function createCustomerRepository(db) {
  const updateColumns = {
    displayName: 'display_name',
    contactName: 'contact_name',
    email: 'email',
    phone: 'phone',
  };

  return {
    create(customer, options = {}) {
      assertId(customer.id, 'customer id');
      assertIsoDateTime(customer.createdAt, 'createdAt');
      const operation = () => {
        db.prepare(`
          INSERT INTO customers
            (id, display_name, contact_name, email, phone, created_at, updated_at, row_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          customer.id,
          customer.displayName,
          customer.contactName ?? null,
          customer.email ?? null,
          customer.phone ?? null,
          customer.createdAt,
          customer.updatedAt ?? customer.createdAt,
        );
        return this.get(customer.id);
      };
      return options.inTransaction ? operation() : runInTransaction(db, operation);
    },
    get(id) {
      assertId(id, 'customer id');
      return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) ?? null;
    },
    list({ limit = 50 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid customer limit');
      return db.prepare('SELECT * FROM customers ORDER BY created_at, id LIMIT ?').all(limit);
    },
    update(id, patch, options = {}) {
      assertId(id, 'customer id');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid customer patch');
      const entries = Object.entries(patch);
      if (entries.length === 0 || entries.some(([key]) => !updateColumns[key])) throw new Error('Invalid customer patch');
      const timestamp = options.updatedAt ?? new Date().toISOString();
      assertIsoDateTime(timestamp, 'updatedAt');
      const operation = () => {
        ensureFound(this.get(id), 'Unknown customer');
        const assignments = entries.map(([key]) => `${updateColumns[key]} = ?`).join(', ');
        const versionClause = options.expectedVersion === undefined ? '' : ' AND row_version = ?';
        const values = [...entries.map(([, value]) => value), timestamp, id];
        if (options.expectedVersion !== undefined) values.push(options.expectedVersion);
        const result = db.prepare(`
          UPDATE customers
          SET ${assignments}, updated_at = ?, row_version = row_version + 1
          WHERE id = ?${versionClause}
        `).run(...values);
        if (result.changes !== 1) throw staleVersion();
        return this.get(id);
      };
      return options.inTransaction ? operation() : runInTransaction(db, operation);
    },
    require(id) {
      return ensureFound(this.get(id), 'Unknown customer');
    },
  };
}
