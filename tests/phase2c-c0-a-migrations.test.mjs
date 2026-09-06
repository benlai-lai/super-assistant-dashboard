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

test('C0-A migration - fresh database applies registered versions 1, 2, and 3 and repeat open is a true no-op', () => {
  withTempDir((dir) => {
    const path = join(dir, 'fresh.sqlite');
    let db;
    try {
      db = openPhase2bDatabase(path);
      assert.equal(getSchemaVersion(db), '3');
      assert.deepEqual(
        db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
        [
          { version: 1, name: 'phase2b-initial-schema' },
          { version: 2, name: 'product-category-foundation' },
          { version: 3, name: 'approver-projection-foundation' },
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
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'quotation_approvals'").get().count, 1);
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
      assert.equal(getSchemaVersion(db), '3');
      assert.deepEqual(db.prepare('SELECT * FROM customers').all(), before.customers);
      assert.deepEqual(db.prepare('SELECT * FROM inquiries').all(), before.inquiries);
      assert.deepEqual(db.prepare('SELECT * FROM inquiry_items').all(), before.inquiryItems);
      assert.deepEqual(
        db.prepare(`
          SELECT id, inquiry_id, version_number, status, currency,
                 customer_total_minor, created_at, published_at
          FROM quotation_versions
        `).all(),
        before.quotationVersions,
      );
      assert.deepEqual(
        { ...db.prepare(`
          SELECT owner_actor_id, approval_status, valid_until, shipping_display,
                 locked_exchange_rate_micros, margin_minor, margin_rate_basis_points, internal_notes
          FROM quotation_versions
        `).get() },
        {
          owner_actor_id: null,
          approval_status: 'PENDING',
          valid_until: null,
          shipping_display: null,
          locked_exchange_rate_micros: null,
          margin_minor: null,
          margin_rate_basis_points: null,
          internal_notes: null,
        },
      );
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
        version: 4,
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
    assert.equal(getSchemaVersion(db), '3');
    assert.deepEqual(
      db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
      [{ version: 1 }, { version: 2 }, { version: 3 }],
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
      { version: 4, name: 'bad-transaction-owner', sql: 'BEGIN; CREATE TABLE forbidden (id TEXT); COMMIT;' },
    ];
    assert.throws(() => migrateDatabase(db, { migrations }), /must not control transactions/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'forbidden'").get().count, 0);
    assert.equal(getSchemaVersion(db), '3');
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
        version: 4,
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
    assert.equal(getSchemaVersion(db), '3');
    assert.equal(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 3);
  } finally {
    db.close();
  }
});

const TRIGGER_MIGRATION_SQL = `
  CREATE TABLE trigger_guard (id INTEGER PRIMARY KEY, value TEXT);
  CREATE /* header comment */ TRIGGER "guard; END;" BEFORE UPDATE ON trigger_guard
  BEGIN
    -- END; COMMIT; is a comment, not a statement.
    SELECT CASE WHEN OLD.value = 'it''s /* quoted */; END; -- BEGIN'
      THEN CASE WHEN NEW.value = 'COMMIT' THEN 1 ELSE 0 END ELSE 0 END;
    SELECT 'ROLLBACK' AS "COMMIT", 1 AS [END], 2 AS \`BEGIN\`;
    SELECT RAISE(ABORT, 'immutable; END; COMMIT;');
  END;
  CREATE TRIGGER guard_delete BEFORE DELETE ON trigger_guard
  BEGIN
    SELECT RAISE(ABORT, 'immutable delete');
  END;
`;

test('C0-A migration - trigger BEGIN and END preserve immutability, CASE expressions, quoting, and rerun', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const migrations = [
      ...loadRegisteredMigrations(),
      { version: 4, name: 'trigger-grammar', sql: TRIGGER_MIGRATION_SQL },
    ];
    assert.equal(migrateDatabase(db, { migrations, now: () => NOW }), '4');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'trigger_guard'").get().count, 2);
    db.prepare('INSERT INTO trigger_guard (id, value) VALUES (?, ?)').run(1, 'original');
    assert.throws(() => db.prepare('UPDATE trigger_guard SET value = ? WHERE id = ?').run('changed', 1), /immutable/);
    assert.throws(() => db.prepare('DELETE FROM trigger_guard WHERE id = ?').run(1), /immutable delete/);
    assert.equal(db.prepare('SELECT value FROM trigger_guard WHERE id = ?').get(1).value, 'original');
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    assert.equal(migrateDatabase(db, { migrations, now: () => { throw new Error('rerun must not write'); } }), '4');
    assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), ledger);
    assert.equal(db.isTransaction, false);
  } finally {
    db.close();
  }
});

test('C0-A migration - every top-level transaction command is rejected before writes even after triggers', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const meta = db.prepare("SELECT * FROM app_meta WHERE key = 'schema_version'").get();
    const commands = [
      'BEGIN;', 'BEGIN TRANSACTION;', 'BEGIN IMMEDIATE;', 'BEGIN EXCLUSIVE TRANSACTION;',
      'COMMIT;', 'COMMIT TRANSACTION;', 'END;', 'END TRANSACTION;',
      'ROLLBACK;', 'ROLLBACK TRANSACTION;', 'ROLLBACK TO SAVEPOINT owned;',
      'SAVEPOINT owned;', 'RELEASE SAVEPOINT owned;',
      '/* leading comment */ cOmMiT /* trailing comment */;',
    ];
    for (const command of commands) {
      for (const prefix of ['', TRIGGER_MIGRATION_SQL]) {
        const migrations = [
          ...loadRegisteredMigrations(),
          {
            version: 4,
            name: 'blocked-transaction',
            sql: `${prefix}
              CREATE TABLE forbidden (id TEXT);
              SELECT 'CREATE TRIGGER fake BEGIN; END; --', 'quoted '' ; COMMIT';
              ${command}
            `,
          },
        ];
        assert.throws(() => migrateDatabase(db, { migrations, now: () => NOW }), /must not control transactions/i, command);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name IN ('forbidden', 'trigger_guard')").get().count, 0);
        assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), ledger);
        assert.deepEqual(db.prepare("SELECT * FROM app_meta WHERE key = 'schema_version'").get(), meta);
        assert.equal(db.isTransaction, false);
      }
    }
  } finally {
    db.close();
  }
});

test('C0-A migration - trigger DDL and following data roll back together on migration failure', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const ledger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const migrations = [
      ...loadRegisteredMigrations(),
      {
        version: 4,
        name: 'trigger-rollback',
        sql: `${TRIGGER_MIGRATION_SQL}
          INSERT INTO trigger_guard (id, value) VALUES (1, 'partial');
          INSERT INTO missing_table (id) VALUES (1);
        `,
      },
    ];
    assert.throws(() => migrateDatabase(db, { migrations, now: () => NOW }), /missing_table|no such table/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'trigger_guard' OR tbl_name = 'trigger_guard'").get().count, 0);
    assert.equal(getSchemaVersion(db), '3');
    assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), ledger);
    assert.equal(db.isTransaction, false);
  } finally {
    db.close();
  }
});
