import { assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

const STATUS_VALUES = new Set(['ACTIVE', 'INACTIVE', 'ALL']);

function assertName(value) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < 1
    || [...value].length > 100
  ) {
    throw new Error('Product category name is invalid');
  }
}

export function createProductCategoryRepository(db) {
  function get(id) {
    assertId(id, 'product category id');
    return db.prepare('SELECT * FROM product_categories WHERE id = ?').get(id) ?? null;
  }

  return {
    create({ id, name, createdAt }) {
      assertId(id, 'product category id');
      assertName(name);
      assertIsoDateTime(createdAt, 'createdAt');
      db.prepare(`
        INSERT INTO product_categories
          (id, name, status, created_at, updated_at, deactivated_at)
        VALUES (?, ?, 'ACTIVE', ?, ?, NULL)
      `).run(id, name, createdAt, createdAt);
      return get(id);
    },
    get,
    list({ status = 'ACTIVE', limit = 50 } = {}) {
      if (!STATUS_VALUES.has(status)) throw new Error('Invalid product category status');
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid product category limit');
      if (status === 'ALL') {
        return db.prepare('SELECT * FROM product_categories ORDER BY created_at, id LIMIT ?').all(limit);
      }
      return db.prepare(`
        SELECT * FROM product_categories
        WHERE status = ?
        ORDER BY created_at, id
        LIMIT ?
      `).all(status, limit);
    },
    rename(id, { name, updatedAt }) {
      assertId(id, 'product category id');
      assertName(name);
      assertIsoDateTime(updatedAt, 'updatedAt');
      ensureFound(get(id), 'Unknown product category');
      db.prepare(`
        UPDATE product_categories SET name = ?, updated_at = ? WHERE id = ?
      `).run(name, updatedAt, id);
      return get(id);
    },
    deactivate(id, { updatedAt }) {
      assertId(id, 'product category id');
      assertIsoDateTime(updatedAt, 'updatedAt');
      return runInTransaction(db, () => {
        const category = ensureFound(get(id), 'Unknown product category');
        if (category.status === 'INACTIVE') return category;
        db.prepare(`
          UPDATE product_categories
          SET status = 'INACTIVE', updated_at = ?, deactivated_at = ?
          WHERE id = ?
        `).run(updatedAt, updatedAt, id);
        return get(id);
      });
    },
    requireActive(id) {
      const category = ensureFound(get(id), 'Unknown product category');
      if (category.status !== 'ACTIVE') throw new Error('Product category is inactive');
      return category;
    },
  };
}
