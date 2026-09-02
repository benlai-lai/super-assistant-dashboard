import { assertId, assertIsoDateTime, ensureFound } from './database.mjs';

export function createCustomerRepository(db) {
  const updateColumns = {
    displayName: 'display_name',
    contactName: 'contact_name',
    email: 'email',
    phone: 'phone',
  };

  return {
    create(customer) {
      assertId(customer.id, 'customer id');
      assertIsoDateTime(customer.createdAt, 'createdAt');
      db.prepare(`
        INSERT INTO customers (id, display_name, contact_name, email, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        customer.id,
        customer.displayName,
        customer.contactName ?? null,
        customer.email ?? null,
        customer.phone ?? null,
        customer.createdAt,
      );
      return this.get(customer.id);
    },
    get(id) {
      assertId(id, 'customer id');
      return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) ?? null;
    },
    list({ limit = 50 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid customer limit');
      return db.prepare('SELECT * FROM customers ORDER BY created_at, id LIMIT ?').all(limit);
    },
    update(id, patch) {
      assertId(id, 'customer id');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid customer patch');
      const entries = Object.entries(patch);
      if (entries.length === 0 || entries.some(([key]) => !updateColumns[key])) throw new Error('Invalid customer patch');
      ensureFound(this.get(id), 'Unknown customer');
      const assignments = entries.map(([key]) => `${updateColumns[key]} = ?`).join(', ');
      db.prepare(`UPDATE customers SET ${assignments} WHERE id = ?`).run(...entries.map(([, value]) => value), id);
      return this.get(id);
    },
    require(id) {
      return ensureFound(this.get(id), 'Unknown customer');
    },
  };
}
