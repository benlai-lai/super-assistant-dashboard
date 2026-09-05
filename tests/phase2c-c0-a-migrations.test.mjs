import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { getSchemaVersion, openPhase2bDatabase } from '../server/database.mjs';
import { loadRegisteredMigrations, migrateDatabase } from '../server/migrations/index.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(TEST_DIR, '..', 'server', 'schema.sql'), 'utf8');
const NOW = '2026-01-01T00:00:00.000Z';

function withTempDir(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-c0-a-migration-'));
  try {
    return callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false, 'migration test temp directory should be removed');
  }
}

async function withTempDirAsync(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-c0-a-migration-'));
  try {
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false, 'migration test temp directory should be removed');
  }
}

function createVersionOneDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

test('C0-A migration - fresh database applies versions 1 and 2 and repeat open is a true no-op', () => {
  withTempDir((dir) => {
    const path = join(dir, 'fresh.sqlite');
    let db;
    try {
      db = openPhase2bDatabase(path);
      assert.equal(getSchemaVersion(db), '2');
      assert.deepEqual(
        db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
        [
          { version: 1, name: 'phase2b-initial-schema' },
          { version: 2, name: 'product-category-foundation' },
        ],
      );
      const firstLedger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
      const firstMeta = db.prepare("SELECT * FROM app_meta WHERE key = 'schema_version'").get();
      db.close();
      db = null;

      db = openPhase2bDatabase(path);
      assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), firstLedger);
      assert.deepEqual(db.prepare("SELECT * FROM app_meta WHERE key = 'schema_version'").get(), firstMeta);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'product_categories'").get().count, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('quotation_items') WHERE name = 'product_category_id'").get().count, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'index' AND name = 'quotation_items_product_category_id_idx'").get().count, 1);
    } finally {
      db?.close();
    }
  });
});

test('C0-A migration - exact version 1 database is adopted without changing business values', () => {
  withTempDir((dir) => {
    const path = join(dir, 'version-one.sqlite');
    let db;
    try {
      db = createVersionOneDatabase(path);
      db.prepare('INSERT INTO customers (id, display_name, created_at) VALUES (?, ?, ?)').run('customer-one', '客戶一', NOW);
      db.prepare(`
      INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('inquiry-one', 'customer-one', '詢價一', 'draft', NOW, NOW);
      db.prepare(`
      INSERT INTO inquiry_items (id, inquiry_id, description, quantity, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('item-one', 'inquiry-one', '帆布袋', 7, '保留原值', NOW);
      db.prepare(`
      INSERT INTO quotation_versions (id, inquiry_id, version_number, status, currency, customer_total_minor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('quote-one', 'inquiry-one', 1, 'draft', 'TWD', 12345, NOW);
      db.prepare(`
      INSERT INTO quotation_items
        (id, quotation_version_id, inquiry_item_id, description, quantity, customer_unit_price_minor, currency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('quote-item-one', 'quote-one', 'item-one', '帆布袋', 7, 1763, 'TWD', NOW);
      const before = {
        customers: db.prepare('SELECT * FROM customers').all(),
        inquiries: db.prepare('SELECT * FROM inquiries').all(),
        inquiryItems: db.prepare('SELECT * FROM inquiry_items').all(),
        quotationVersions: db.prepare('SELECT * FROM quotation_versions').all(),
        quotationItems: db.prepare('SELECT * FROM quotation_items').all(),
      };
      db.close();
      db = null;

      db = openPhase2bDatabase(path);
      assert.equal(getSchemaVersion(db), '2');
      assert.deepEqual(db.prepare('SELECT * FROM customers').all(), before.customers);
      assert.deepEqual(db.prepare('SELECT * FROM inquiries').all(), before.inquiries);
      assert.deepEqual(db.prepare('SELECT * FROM inquiry_items').all(), before.inquiryItems);
      assert.deepEqual(db.prepare('SELECT * FROM quotation_versions').all(), before.quotationVersions);
      assert.deepEqual(
        db.prepare(`
        SELECT id, quotation_version_id, inquiry_item_id, description, quantity,
               customer_unit_price_minor, currency, created_at
        FROM quotation_items
      `).all(),
        before.quotationItems,
      );
      assert.equal(db.prepare('SELECT product_category_id FROM quotation_items').get().product_category_id, null);
    } finally {
      db?.close();
    }
  });
});

test('C0-A migration - injected failing migration rolls back DDL, data, meta, and ledger together', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const migrations = [
      ...loadRegisteredMigrations(),
      {
        version: 3,
        name: 'injected-failure',
        sql: `
          CREATE TABLE should_rollback (id TEXT PRIMARY KEY);
          INSERT INTO should_rollback (id) VALUES ('partial-row');
          INSERT INTO missing_table (id) VALUES ('force-failure');
        `,
      },
    ];
    assert.throws(() => migrateDatabase(db, { migrations, now: () => NOW }), /missing_table|no such table/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'should_rollback'").get().count, 0);
    assert.equal(getSchemaVersion(db), '2');
    assert.deepEqual(
      db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
      [{ version: 1 }, { version: 2 }],
    );
  } finally {
    db.close();
  }
});

test('C0-A migration - future versions, checksum drift, ledger gaps, and v1 fingerprint drift fail closed', () => {
  withTempDir((dir) => {
    const futurePath = join(dir, 'future.sqlite');
    let db = createVersionOneDatabase(futurePath);
    db.prepare("UPDATE app_meta SET value = '99' WHERE key = 'schema_version'").run();
    db.close();
    assert.throws(() => openPhase2bDatabase(futurePath), /newer than this application/i);
    db = new DatabaseSync(futurePath);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'schema_migrations'").get().count, 0);
    db.close();

    const driftPath = join(dir, 'fingerprint.sqlite');
    db = createVersionOneDatabase(driftPath);
    db.exec('ALTER TABLE customers ADD COLUMN unrecognized TEXT');
    db.close();
    assert.throws(() => openPhase2bDatabase(driftPath), /fingerprint mismatch/i);
    db = new DatabaseSync(driftPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'schema_migrations'").get().count, 0);
    db.close();

    const checksumPath = join(dir, 'checksum.sqlite');
    db = openPhase2bDatabase(checksumPath);
    db.prepare("UPDATE schema_migrations SET checksum = 'drift' WHERE version = 2").run();
    db.close();
    assert.throws(() => openPhase2bDatabase(checksumPath), /checksum mismatch/i);

    const gapPath = join(dir, 'gap.sqlite');
    db = openPhase2bDatabase(gapPath);
    db.prepare('DELETE FROM schema_migrations WHERE version = 1').run();
    db.close();
    assert.throws(() => openPhase2bDatabase(gapPath), /ledger contains a gap/i);
  });
});

test('C0-A migration - non-canonical app_meta version strings fail closed before ledger writes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    db.prepare("UPDATE app_meta SET value = '01' WHERE key = 'schema_version'").run();
    assert.throws(
      () => migrateDatabase(db, { now: () => NOW }),
      /Invalid app_meta schema version/i,
    );
    assert.equal(db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get().value, '01');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'schema_migrations'").get().count, 0);
  } finally {
    db.close();
  }
});

test('C0-A migration - migration modules have no import-time filesystem side effects', async () => {
  await withTempDirAsync(async (dir) => {
    const before = readdirSync(dir);
    await import('../server/migrations/index.mjs?side-effect-check=fresh-migrations');
    await import('../server/database.mjs?side-effect-check=fresh-database');
    assert.deepEqual(readdirSync(dir), before);
  });
});

test('C0-A migration - registry rejects transaction-owning migration SQL before writes', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const migrations = [
      ...loadRegisteredMigrations(),
      { version: 3, name: 'bad-transaction-owner', sql: 'BEGIN; CREATE TABLE forbidden (id TEXT); COMMIT;' },
    ];
    assert.throws(() => migrateDatabase(db, { migrations }), /must not control transactions/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'forbidden'").get().count, 0);
    assert.equal(getSchemaVersion(db), '2');
  } finally {
    db.close();
  }
});

test('C0-A migration - SQLite END transaction alias is rejected before partial DDL can commit', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const migrations = [
      ...loadRegisteredMigrations(),
      {
        version: 3,
        name: 'end-alias-escape',
        sql: `
          CREATE TABLE end_alias_partial (id TEXT PRIMARY KEY);
          END;
          INSERT INTO definitely_missing_table (id) VALUES ('force-failure');
        `,
      },
    ];
    assert.throws(() => migrateDatabase(db, { migrations, now: () => NOW }), /must not control transactions/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'end_alias_partial'").get().count, 0);
    assert.equal(getSchemaVersion(db), '2');
    assert.equal(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 2);
  } finally {
    db.close();
  }
});
