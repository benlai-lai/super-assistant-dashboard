import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_MIGRATIONS_SQL = `
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
`;

const REGISTRY = Object.freeze([
  Object.freeze({
    version: 1,
    name: 'phase2b-initial-schema',
    sqlUrl: new URL('../schema.sql', import.meta.url),
  }),
  Object.freeze({
    version: 2,
    name: 'product-category-foundation',
    sqlUrl: new URL('./002-product-category-foundation.sql', import.meta.url),
  }),
  Object.freeze({
    version: 3,
    name: 'approver-projection-foundation',
    sqlUrl: new URL('./003-approver-projection-foundation.sql', import.meta.url),
  }),
]);

function checksum(sql) {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function schemaObjects(db, { includeLedger = true } = {}) {
  return db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all()
    .filter((row) => includeLedger || row.name !== 'schema_migrations')
    .map((row) => ({
      type: row.type,
      name: row.name,
      table: row.tbl_name,
      sql: normalizeSql(row.sql ?? ''),
    }));
}

function schemaFingerprint(db, options) {
  return JSON.stringify(schemaObjects(db, options));
}

function assertUtcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('Migration timestamp must be UTC ISO-8601 with millisecond precision');
  }
}

function* migrationSqlTokens(sql) {
  for (let index = 0; index < sql.length;) {
    const char = sql[index];
    if (/\s/.test(char)) {
      index += 1;
    } else if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2);
      index = end === -1 ? sql.length : end + 1;
    } else if (sql.startsWith('/*', index)) {
      const end = sql.indexOf('*/', index + 2);
      if (end === -1) throw new Error('Unterminated migration SQL comment');
      index = end + 2;
    } else if (["'", '"', '`', '['].includes(char)) {
      const closing = char === '[' ? ']' : char;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index++] !== closing) continue;
        if (char !== '[' && sql[index] === closing) {
          index += 1;
        } else {
          closed = true;
          break;
        }
      }
      if (!closed) throw new Error('Unterminated migration SQL quote');
      // Keep a token boundary without treating quoted text as SQL keywords.
      yield '<quoted>';
    } else if (/[a-zA-Z0-9_$\u0080-\uFFFF]/.test(char)) {
      const start = index++;
      while (index < sql.length && /[a-zA-Z0-9_$\u0080-\uFFFF]/.test(sql[index])) index += 1;
      yield sql.slice(start, index).toUpperCase();
    } else {
      index += 1;
      yield char;
    }
  }
}

function assertNoTransactionControl(migration) {
  const forbidden = new Set(['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE']);
  let prefix = [];
  let statementStart = true;
  let triggerHeader = false;
  let triggerBody = false;

  for (const token of migrationSqlTokens(migration.sql)) {
    if (statementStart && triggerBody && token === 'END') {
      // Trigger END follows a body statement's semicolon; CASE END does not.
      triggerBody = false;
      statementStart = false;
      continue;
    }
    if (statementStart && forbidden.has(token)) {
      throw new Error(`Migration ${migration.version} must not control transactions`);
    }
    if (token === ';') {
      statementStart = true;
      triggerHeader = false;
      prefix = [];
      continue;
    }
    if (triggerHeader && token === 'BEGIN') {
      triggerHeader = false;
      triggerBody = true;
      statementStart = true;
      continue;
    }
    if (!triggerBody && prefix.length < 3) {
      prefix.push(token);
      triggerHeader = prefix[0] === 'CREATE' && (
        prefix[1] === 'TRIGGER'
        || (['TEMP', 'TEMPORARY'].includes(prefix[1]) && prefix[2] === 'TRIGGER')
      );
    }
    statementStart = false;
  }
}

function materializeMigrations(source = REGISTRY) {
  if (!Array.isArray(source) || source.length === 0) throw new Error('Migration registry is empty');

  const migrations = source.map((entry) => {
    const sql = entry.sql ?? (entry.sqlUrl ? readFileSync(entry.sqlUrl, 'utf8') : null);
    if (typeof sql !== 'string' || sql.trim().length === 0) throw new Error('Migration SQL is missing');
    return Object.freeze({
      version: entry.version,
      name: entry.name,
      sql,
      checksum: checksum(sql),
    });
  });

  const versions = new Set();
  const names = new Set();
  migrations.forEach((migration, index) => {
    if (!Number.isInteger(migration.version) || migration.version < 1) throw new Error('Migration version must be a positive integer');
    if (migration.version !== index + 1) throw new Error('Migration registry must be strictly ascending and contiguous');
    if (typeof migration.name !== 'string' || migration.name.length === 0 || names.has(migration.name)) {
      throw new Error('Migration names must be unique non-empty strings');
    }
    if (versions.has(migration.version)) throw new Error('Migration versions must be unique');
    versions.add(migration.version);
    names.add(migration.name);
    assertNoTransactionControl(migration);
  });

  return Object.freeze(migrations);
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(tableName));
}

function getAppMetaVersion(db) {
  if (!tableExists(db, 'app_meta')) return null;
  const value = db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new Error('Invalid app_meta schema version');
  const version = Number(value);
  if (!Number.isSafeInteger(version) || String(version) !== value) throw new Error('Invalid app_meta schema version');
  return version;
}

function expectedApplicationFingerprint(migrations, version) {
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec('PRAGMA foreign_keys = ON');
    for (const migration of migrations.slice(0, version)) expected.exec(migration.sql);
    return schemaFingerprint(expected, { includeLedger: false });
  } finally {
    expected.close();
  }
}

function assertApplicationSchema(db, migrations, version) {
  if (schemaFingerprint(db, { includeLedger: false }) !== expectedApplicationFingerprint(migrations, version)) {
    throw new Error(`Schema fingerprint mismatch for version ${version}`);
  }
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) throw new Error('Existing database contains foreign-key violations');
}

function assertLedgerSchema(db) {
  const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'").get()?.sql;
  if (normalizeSql(actual ?? '') !== normalizeSql(SCHEMA_MIGRATIONS_SQL)) {
    throw new Error('schema_migrations fingerprint mismatch');
  }
}

function validateAppliedState(db, migrations) {
  assertLedgerSchema(db);
  const latest = migrations.at(-1).version;
  const rows = db.prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version').all();
  if (rows.length === 0) throw new Error('schema_migrations ledger is empty');

  rows.forEach((row, index) => {
    const expected = migrations[index];
    if (!expected || row.version > latest) throw new Error('Database schema version is newer than this application');
    if (row.version !== index + 1) throw new Error('schema_migrations ledger contains a gap');
    if (row.name !== expected.name) throw new Error(`Unknown migration name for version ${row.version}`);
    if (row.checksum !== expected.checksum) throw new Error(`Migration checksum mismatch for version ${row.version}`);
    assertUtcTimestamp(row.applied_at);
  });

  const current = rows.at(-1).version;
  const appMetaVersion = getAppMetaVersion(db);
  if (appMetaVersion > latest) throw new Error('Database schema version is newer than this application');
  if (appMetaVersion !== current) throw new Error('app_meta and schema_migrations versions disagree');
  assertApplicationSchema(db, migrations, current);
  return current;
}

function writeAppMetaVersion(db, version, appliedAt) {
  const result = db.prepare(`
    UPDATE app_meta SET value = ?, updated_at = ? WHERE key = 'schema_version'
  `).run(String(version), appliedAt);
  if (result.changes !== 1) throw new Error('app_meta schema version row is missing');
}

function runOwnedTransaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the migration failure.
    }
    throw error;
  }
}

function adoptVersionOne(db, migration, appliedAt) {
  runOwnedTransaction(db, () => {
    db.exec(SCHEMA_MIGRATIONS_SQL);
    writeAppMetaVersion(db, 1, appliedAt);
    db.prepare(`
      INSERT INTO schema_migrations (version, name, checksum, applied_at)
      VALUES (?, ?, ?, ?)
    `).run(1, migration.name, migration.checksum, appliedAt);
  });
}

function applyMigration(db, migration, appliedAt) {
  runOwnedTransaction(db, () => {
    if (migration.version === 1) db.exec(SCHEMA_MIGRATIONS_SQL);
    db.exec(migration.sql);
    writeAppMetaVersion(db, migration.version, appliedAt);
    db.prepare(`
      INSERT INTO schema_migrations (version, name, checksum, applied_at)
      VALUES (?, ?, ?, ?)
    `).run(migration.version, migration.name, migration.checksum, appliedAt);
  });
}

export function loadRegisteredMigrations() {
  return materializeMigrations(REGISTRY);
}

export function migrateDatabase(db, { migrations: suppliedMigrations, now = () => new Date().toISOString() } = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('A SQLite database is required');
  if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) throw new Error('SQLite foreign_keys must be enabled before migration');

  const migrations = materializeMigrations(suppliedMigrations ?? REGISTRY);
  const latest = migrations.at(-1).version;
  const hasLedger = tableExists(db, 'schema_migrations');
  let current = 0;

  if (hasLedger) {
    current = validateAppliedState(db, migrations);
  } else {
    const appMetaVersion = getAppMetaVersion(db);
    if (appMetaVersion !== null) {
      if (appMetaVersion > latest) throw new Error('Database schema version is newer than this application');
      if (appMetaVersion !== 1) throw new Error('Only an exact version 1 database can be adopted');
      assertApplicationSchema(db, migrations, 1);
      const appliedAt = now();
      assertUtcTimestamp(appliedAt);
      adoptVersionOne(db, migrations[0], appliedAt);
      current = 1;
    } else if (schemaObjects(db).length > 0) {
      throw new Error('Database is neither empty nor a recognized application schema');
    }
  }

  for (const migration of migrations.slice(current)) {
    const appliedAt = now();
    assertUtcTimestamp(appliedAt);
    applyMigration(db, migration, appliedAt);
  }

  const finalVersion = validateAppliedState(db, migrations);
  if (finalVersion !== latest) throw new Error('Database migration did not reach the latest version');
  return String(finalVersion);
}
