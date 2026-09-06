import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openPhase2bDatabase, getSchemaVersion } from '../server/database.mjs';

const EXPECTED_TABLES = [
  'app_meta',
  'customers',
  'inquiries',
  'inquiry_items',
  'quotation_versions',
  'quotation_options',
  'quotation_items',
  'cost_estimates',
  'cost_allocations',
  'attachments',
  'pdf_documents',
  'audit_logs',
  'backup_runs',
  'product_categories',
  'quotation_approvals',
  'schema_migrations',
];

function withTempDatabase(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-phase2b-db-'));
  const dbPath = join(dir, 'test.sqlite');
  const db = openPhase2bDatabase(dbPath);
  try {
    callback(db, dbPath, dir);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false, 'temporary database directory should be removed');
  }
}

test('empty database initialization migrates the Phase 2B schema through C0-B version 3', () => {
  withTempDatabase((db) => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);

    assert.deepEqual(tables, [...EXPECTED_TABLES].sort());
    assert.equal(getSchemaVersion(db), '3');
    assert.deepEqual(
      db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
      [
        { version: 1, name: 'phase2b-initial-schema' },
        { version: 2, name: 'product-category-foundation' },
        { version: 3, name: 'approver-projection-foundation' },
      ],
    );

    for (const table of EXPECTED_TABLES.filter((name) => !['app_meta', 'schema_migrations'].includes(name))) {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
      assert.equal(count, 0, `${table} should start empty`);
    }
  });
});

test('foreign-key enforcement is enabled and fail-closed', () => {
  withTempDatabase((db) => {
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.throws(
      () => db.prepare(`
        INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at)
        VALUES ('inquiry-one', 'missing-customer', 'Blocked', 'draft', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `).run(),
      /FOREIGN KEY|constraint/i,
    );
  });
});

test('money columns are integer minor units and reject floating values', () => {
  withTempDatabase((db) => {
    db.prepare(`INSERT INTO customers (id, display_name, created_at) VALUES (?, ?, ?)`).run('customer-one', 'Demo Customer', '2026-01-01T00:00:00.000Z');
    db.prepare(`INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('inquiry-one', 'customer-one', 'Demo', 'draft', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    assert.throws(
      () => db.prepare(`
        INSERT INTO quotation_versions (id, inquiry_id, version_number, status, currency, customer_total_minor, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('quote-one', 'inquiry-one', 1, 'draft', 'TWD', 10.5, '2026-01-01T00:00:00.000Z'),
      /datatype|constraint/i,
    );
  });
});
