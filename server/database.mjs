import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

export function openPhase2bDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schemaSql);
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get();
  if (foreignKeys.foreign_keys !== 1) {
    db.close();
    throw new Error('SQLite foreign_keys could not be enabled');
  }
  return db;
}

export function getSchemaVersion(db) {
  return db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value ?? null;
}

export function runInTransaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

export function ensureFound(value, message = 'Record not found') {
  if (!value) throw new Error(message);
  return value;
}

export function assertIsoDateTime(value, fieldName = 'date time') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${fieldName} must be UTC ISO-8601 with millisecond precision`);
  }
}

export function assertId(value, fieldName = 'id') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new Error(`${fieldName} is invalid`);
  }
}

export function assertMinorUnits(value, fieldName = 'amount') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer minor-unit amount`);
  }
}

export function assertCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new Error('currency must be an ISO-like three-letter code');
  }
}

export function assertHttpUrl(value) {
  if (typeof value !== 'string' || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('file://') || value.includes('\\')) {
    throw new Error('attachment URL must not be a local file path');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('attachment URL is invalid');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('attachment URL must be an external HTTP(S) URL');
  }
}

