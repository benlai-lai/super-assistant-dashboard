import { createHash, randomUUID } from 'node:crypto';
import { backup, DatabaseSync } from 'node:sqlite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { assertPilotDataPath } from './lan-write-pilot.mjs';
import { validateRegisteredDatabase } from './migrations/index.mjs';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function cleanupTemporaryDatabaseFiles(path) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

function cleanupDatabaseSidecars(path) {
  for (const suffix of ['-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

function validateSnapshot(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => Object.values(row)[0]);
    if (integrity.length !== 1 || integrity[0] !== 'ok') throw new Error('Backup integrity check failed');
    return validateRegisteredDatabase(db);
  } finally {
    db.close();
  }
}

function markBackupCompleted(path, runId, completedAt) {
  const snapshot = new DatabaseSync(path);
  try {
    const result = snapshot.prepare(`
      UPDATE backup_runs SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(completedAt, runId);
    if (result.changes !== 1) throw new Error('Backup run record is missing from snapshot');
    const checkpoint = snapshot.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (checkpoint.busy !== 0) throw new Error('Backup snapshot checkpoint did not complete');
  } finally {
    snapshot.close();
  }
  cleanupDatabaseSidecars(path);
}

export async function createLanPilotBackup({ db, backupPath, allowedRoot, sourceHead = 'UNKNOWN', now = () => new Date().toISOString() }) {
  const target = assertPilotDataPath(backupPath, allowedRoot);
  const manifestPath = assertPilotDataPath(`${backupPath}.manifest.json`, allowedRoot);
  if (existsSync(target) || existsSync(manifestPath)) throw new Error('Backup target already exists');
  mkdirSync(dirname(target), { recursive: true });
  const runId = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO backup_runs (id, status, target_label, created_at)
    VALUES (?, 'planned', ?, ?)
  `).run(runId, basename(target), createdAt);
  try {
    db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
    await backup(db, target);
    const completedAt = now();
    markBackupCompleted(target, runId, completedAt);
    let validation;
    try {
      validation = validateSnapshot(target);
    } finally {
      cleanupDatabaseSidecars(target);
    }
    const manifest = {
      format: 'super-assistant-dashboard.sqlite-backup.v1',
      createdAt,
      sourceHead,
      schemaVersion: validation.schemaVersion,
      migrationVersions: validation.migrations.map((entry) => entry.version),
      sha256: sha256(target),
      bytes: statSync(target).size,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    db.prepare(`UPDATE backup_runs SET status = 'completed', completed_at = ? WHERE id = ?`).run(completedAt, runId);
    return { backupPath: target, manifestPath, manifest };
  } catch (error) {
    db.prepare(`UPDATE backup_runs SET status = 'failed', completed_at = ? WHERE id = ?`).run(now(), runId);
    throw error;
  }
}

export function restoreLanPilotBackup({
  databasePath,
  backupPath,
  manifestPath = `${backupPath}.manifest.json`,
  allowedRoot,
  now = () => new Date().toISOString(),
  renameFile = renameSync,
}) {
  const target = assertPilotDataPath(databasePath, allowedRoot);
  const source = assertPilotDataPath(backupPath, allowedRoot);
  const manifestFile = assertPilotDataPath(manifestPath, allowedRoot);
  if (source === target || manifestFile === target) throw new Error('Backup source must differ from the live database');
  if (!existsSync(source) || !existsSync(manifestFile)) throw new Error('Backup or manifest is missing');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  if (
    manifest.format !== 'super-assistant-dashboard.sqlite-backup.v1'
    || manifest.sha256 !== sha256(source)
    || !Number.isSafeInteger(manifest.bytes)
    || manifest.bytes !== statSync(source).size
  ) {
    throw new Error('Backup manifest verification failed');
  }
  const sourceWal = `${source}-wal`;
  if (existsSync(sourceWal) && statSync(sourceWal).size > 0) {
    throw new Error('Backup has an uncheckpointed WAL and is not a standalone snapshot');
  }
  cleanupDatabaseSidecars(source);
  let validation;
  try {
    validation = validateSnapshot(source);
  } finally {
    cleanupDatabaseSidecars(source);
  }
  const expectedMigrationVersions = validation.migrations.map((entry) => entry.version);
  if (
    validation.schemaVersion !== manifest.schemaVersion
    || !Array.isArray(manifest.migrationVersions)
    || manifest.migrationVersions.length !== expectedMigrationVersions.length
    || manifest.migrationVersions.some((version, index) => version !== expectedMigrationVersions[index])
  ) {
    throw new Error('Backup schema or migration registry does not match manifest');
  }

  mkdirSync(dirname(target), { recursive: true });
  const temporary = assertPilotDataPath(`${target}.restore-${randomUUID()}.tmp`, allowedRoot);
  copyFileSync(source, temporary);
  try {
    if (sha256(temporary) !== manifest.sha256) throw new Error('Restored copy checksum mismatch');
    const restoredValidation = validateSnapshot(temporary);
    if (
      restoredValidation.schemaVersion !== validation.schemaVersion
      || restoredValidation.migrations.some((entry, index) => (
        entry.version !== validation.migrations[index]?.version
        || entry.name !== validation.migrations[index]?.name
        || entry.checksum !== validation.migrations[index]?.checksum
      ))
    ) {
      throw new Error('Restored copy schema validation mismatch');
    }

    const recoveryDirectory = assertPilotDataPath(
      resolve(dirname(target), 'recovery', now().replace(/[:.]/g, '-')),
      allowedRoot,
    );
    mkdirSync(dirname(recoveryDirectory), { recursive: true });
    if (existsSync(recoveryDirectory)) throw new Error('Recovery directory already exists');
    mkdirSync(recoveryDirectory, { recursive: false });
    const moves = ['', '-wal', '-shm']
      .map((suffix) => ({
        current: `${target}${suffix}`,
        recovered: resolve(recoveryDirectory, `${basename(target)}${suffix}`),
      }))
      .filter(({ current }) => existsSync(current));
    if (moves.some(({ recovered }) => existsSync(recovered))) throw new Error('Recovery destination already exists');
    const moved = [];
    try {
      for (const move of moves) {
        renameFile(move.current, move.recovered);
        moved.push(move);
      }
      renameFile(temporary, target);
    } catch (error) {
      const rollbackErrors = [];
      for (const move of moved.reverse()) {
        try {
          if (existsSync(move.current) || !existsSync(move.recovered)) throw new Error(`Cannot restore ${basename(move.current)}`);
          renameFile(move.recovered, move.current);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], 'Restore failed and live-file rollback was incomplete');
      throw error;
    }
    return { databasePath: target, recoveryDirectory, manifest };
  } finally {
    cleanupTemporaryDatabaseFiles(temporary);
  }
}
