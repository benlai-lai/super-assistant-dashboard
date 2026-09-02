import { assertId, assertIsoDateTime, ensureFound } from './database.mjs';

export function createCustomerRepository(db) {
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
    require(id) {
      return ensureFound(this.get(id), 'Unknown customer');
    },
  };
}
