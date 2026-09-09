import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openPhase2bDatabase } from '../server/database.mjs';
import { createAccountRepository } from '../server/account-repository.mjs';
import { createAuditRepository } from '../server/audit-repository.mjs';
import { createCustomerRepository } from '../server/customer-repository.mjs';
import { createInquiryRepository } from '../server/inquiry-repository.mjs';
import { createIdempotencyRepository } from '../server/idempotency-repository.mjs';
import { createCustomerInquiryWriteService } from '../server/customer-inquiry-write-service.mjs';
import { createLanPilotBackup, restoreLanPilotBackup } from '../server/lan-maintenance.mjs';

const testParent = process.env.DASHBOARD_PHASE_A_TEST_ROOT || tmpdir();

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('backup and offline restore preserve WAL-committed business, account, audit, and idempotency state', { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(testParent, 'dashboard-lan-maintenance-'));
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  const backupPath = join(root, 'backups', 'snapshot.sqlite3');
  mkdirSync(join(root, 'data'), { recursive: true });
  let db = openPhase2bDatabase(databasePath);
  try {
    assert.equal(String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'wal');
    const accounts = createAccountRepository(db, { now: () => '2026-09-08T01:00:00.000Z' });
    await accounts.create({ id: 'backup-editor', username: 'backupeditor', password: 'Synthetic-backup-1!', role: 'editor' });
    const customers = createCustomerRepository(db);
    const inquiries = createInquiryRepository(db);
    const audit = createAuditRepository(db);
    const idempotency = createIdempotencyRepository(db);
    const service = createCustomerInquiryWriteService({
      db, customers, inquiries, audit, idempotency,
      now: () => '2026-09-08T01:01:00.000Z',
      createId: (() => { let value = 0; return () => `generated-id-${++value}`; })(),
    });
    const created = service.createCustomer({
      session: { actorId: 'backup-editor', role: 'editor', sessionEpoch: 1 },
      key: 'backup-customer-0001',
      input: { displayName: '備份內合成客戶', contactName: null, email: null, phone: null },
    });
    assert.equal(created.status, 201);

    const result = await createLanPilotBackup({
      db,
      backupPath,
      allowedRoot: root,
      sourceHead: 'synthetic-head',
      now: (() => { const values = ['2026-09-08T01:02:00.000Z', '2026-09-08T01:03:00.000Z']; return () => values.shift() ?? '2026-09-08T01:04:00.000Z'; })(),
    });
    assert.equal(result.manifest.schemaVersion, '4');
    assert.deepEqual(result.manifest.migrationVersions, [1, 2, 3, 4]);
    const snapshot = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assert.equal(snapshot.prepare('SELECT status FROM backup_runs').get().status, 'completed');
    } finally {
      snapshot.close();
    }
    const manifestText = readFileSync(result.manifestPath, 'utf8');
    assert.doesNotMatch(manifestText, /Synthetic-backup|password|cookie|token/i);
    assert.throws(
      () => restoreLanPilotBackup({ databasePath, backupPath: databasePath, allowedRoot: root }),
      /must differ/i,
    );

    customers.create({ id: 'after-backup', displayName: '不應存在於還原後', createdAt: '2026-09-08T01:05:00.000Z' });
    db.close(); db = null;
    const restored = restoreLanPilotBackup({
      databasePath, backupPath, allowedRoot: root, now: () => '2026-09-08T01:06:00.000Z',
    });
    assert.equal(existsSync(restored.recoveryDirectory), true);

    db = openPhase2bDatabase(databasePath);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 1);
    assert.equal(db.prepare('SELECT display_name FROM customers').get().display_name, '備份內合成客戶');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM idempotency_requests').get().count, 1);
  } finally {
    db?.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('restore rolls back every moved live file and removes temporary sidecars after a mid-move failure', async () => {
  const root = mkdtempSync(join(testParent, 'dashboard-lan-restore-failure-'));
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  const backupPath = join(root, 'backups', 'snapshot.sqlite3');
  mkdirSync(join(root, 'data'), { recursive: true });
  let db = openPhase2bDatabase(databasePath);
  try {
    createCustomerRepository(db).create({
      id: 'rollback-customer', displayName: '回滾驗證', createdAt: '2026-09-08T02:00:00.000Z',
    });
    await createLanPilotBackup({ db, backupPath, allowedRoot: root, now: () => '2026-09-08T02:01:00.000Z' });
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    db.close(); db = null;
    const originalDatabase = readFileSync(databasePath);
    const fakeWal = Buffer.from('synthetic-wal-sidecar');
    const fakeShm = Buffer.from('synthetic-shm-sidecar');
    writeFileSync(`${databasePath}-wal`, fakeWal);
    writeFileSync(`${databasePath}-shm`, fakeShm);
    let renameCalls = 0;
    assert.throws(
      () => restoreLanPilotBackup({
        databasePath,
        backupPath,
        allowedRoot: root,
        now: () => '2026-09-08T02:02:00.000Z',
        renameFile(from, to) {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error('synthetic mid-move failure');
          renameSync(from, to);
        },
      }),
      /synthetic mid-move failure/,
    );
    assert.deepEqual(readFileSync(databasePath), originalDatabase);
    assert.deepEqual(readFileSync(`${databasePath}-wal`), fakeWal);
    assert.deepEqual(readFileSync(`${databasePath}-shm`), fakeShm);
    assert.equal(readdirSync(join(root, 'data')).some((name) => name.includes('.restore-')), false);
    assert.equal(existsSync(join(root, 'data', 'recovery')), false, 'failed restore must remove its new empty recovery directories');
    assert.equal(existsSync(`${backupPath}-wal`), false);
    assert.equal(existsSync(`${backupPath}-shm`), false);
  } finally {
    db?.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('restore cleans a partial temporary copy when copy fails before validation', async () => {
  const root = mkdtempSync(join(testParent, 'dashboard-lan-restore-copy-failure-'));
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  const backupPath = join(root, 'backups', 'snapshot.sqlite3');
  mkdirSync(join(root, 'data'), { recursive: true });
  let db = openPhase2bDatabase(databasePath);
  try {
    await createLanPilotBackup({ db, backupPath, allowedRoot: root, now: () => '2026-09-08T02:10:00.000Z' });
    db.close(); db = null;
    const liveBytes = readFileSync(databasePath);
    assert.throws(
      () => restoreLanPilotBackup({
        databasePath,
        backupPath,
        allowedRoot: root,
        copyFile(from, to) {
          writeFileSync(to, 'partial synthetic copy');
          throw new Error('synthetic copy failure');
        },
      }),
      /synthetic copy failure/,
    );
    assert.deepEqual(readFileSync(databasePath), liveBytes);
    assert.equal(readdirSync(join(root, 'data')).some((name) => name.includes('.restore-')), false);
    assert.equal(existsSync(join(root, 'data', 'recovery')), false);
  } finally {
    db?.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('failed restore preserves a pre-existing empty recovery parent', async () => {
  const root = mkdtempSync(join(testParent, 'dashboard-lan-existing-recovery-parent-'));
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  const backupPath = join(root, 'backups', 'snapshot.sqlite3');
  const recoveryParent = join(root, 'data', 'recovery');
  mkdirSync(recoveryParent, { recursive: true });
  let db = openPhase2bDatabase(databasePath);
  try {
    await createLanPilotBackup({ db, backupPath, allowedRoot: root, now: () => '2026-09-08T02:20:00.000Z' });
    db.close(); db = null;
    assert.throws(
      () => restoreLanPilotBackup({
        databasePath,
        backupPath,
        allowedRoot: root,
        now: () => '2026-09-08T02:21:00.000Z',
        renameFile() { throw new Error('synthetic move failure'); },
      }),
      /synthetic move failure/,
    );
    assert.equal(existsSync(recoveryParent), true, 'a pre-existing recovery parent must be preserved');
    assert.deepEqual(readdirSync(recoveryParent), []);
  } finally {
    db?.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('failed restore preserves non-empty recovery content for manual recovery', async () => {
  const root = mkdtempSync(join(testParent, 'dashboard-lan-nonempty-recovery-'));
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  const backupPath = join(root, 'backups', 'snapshot.sqlite3');
  mkdirSync(join(root, 'data'), { recursive: true });
  let db = openPhase2bDatabase(databasePath);
  try {
    await createLanPilotBackup({ db, backupPath, allowedRoot: root, now: () => '2026-09-08T02:30:00.000Z' });
    db.close(); db = null;
    const liveBytes = readFileSync(databasePath);
    let recoveryDirectory;
    let renameCalls = 0;
    assert.throws(
      () => restoreLanPilotBackup({
        databasePath,
        backupPath,
        allowedRoot: root,
        now: () => '2026-09-08T02:31:00.000Z',
        renameFile(from, to) {
          renameCalls += 1;
          if (renameCalls === 1) {
            recoveryDirectory = dirname(to);
            renameSync(from, to);
            writeFileSync(join(recoveryDirectory, 'manual-recovery-note.txt'), 'preserve');
            return;
          }
          if (renameCalls === 2) throw new Error('synthetic install failure');
          renameSync(from, to);
        },
      }),
      /synthetic install failure/,
    );
    assert.deepEqual(readFileSync(databasePath), liveBytes);
    assert.equal(readFileSync(join(recoveryDirectory, 'manual-recovery-note.txt'), 'utf8'), 'preserve');
    assert.equal(existsSync(recoveryDirectory), true, 'non-empty recovery content must be preserved');
    assert.equal(readdirSync(join(root, 'data')).some((name) => name.includes('.restore-')), false);
  } finally {
    db?.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('restore rejects manifest drift and incompatible schema before moving live files', async () => {
  const root = mkdtempSync(join(testParent, 'dashboard-lan-restore-validation-'));
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  const backupPath = join(root, 'backups', 'snapshot.sqlite3');
  mkdirSync(join(root, 'data'), { recursive: true });
  let db = openPhase2bDatabase(databasePath);
  try {
    createCustomerRepository(db).create({
      id: 'live-customer',
      displayName: '保留的正式合成資料',
      createdAt: '2026-09-08T03:00:00.000Z',
    });
    const result = await createLanPilotBackup({
      db,
      backupPath,
      allowedRoot: root,
      now: (() => {
        const values = ['2026-09-08T03:01:00.000Z', '2026-09-08T03:02:00.000Z'];
        return () => values.shift() ?? '2026-09-08T03:03:00.000Z';
      })(),
    });
    db.close();
    db = null;
    const liveBytes = readFileSync(databasePath);
    const originalManifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));

    writeFileSync(result.manifestPath, `${JSON.stringify({ ...originalManifest, bytes: originalManifest.bytes + 1 }, null, 2)}\n`);
    assert.throws(
      () => restoreLanPilotBackup({ databasePath, backupPath, allowedRoot: root }),
      /manifest verification failed/i,
    );
    assert.deepEqual(readFileSync(databasePath), liveBytes);
    assert.equal(existsSync(join(root, 'data', 'recovery')), false);

    writeFileSync(result.manifestPath, `${JSON.stringify({ ...originalManifest, migrationVersions: [1, 2, 3] }, null, 2)}\n`);
    assert.throws(
      () => restoreLanPilotBackup({ databasePath, backupPath, allowedRoot: root }),
      /schema or migration registry does not match manifest/i,
    );
    assert.deepEqual(readFileSync(databasePath), liveBytes);
    assert.equal(existsSync(join(root, 'data', 'recovery')), false);

    const incompatible = new DatabaseSync(backupPath);
    try {
      incompatible.prepare('PRAGMA journal_mode = DELETE').get();
      incompatible.exec('CREATE TABLE incompatible_extra_table (id TEXT PRIMARY KEY)');
    } finally {
      incompatible.close();
    }
    const incompatibleManifest = {
      ...originalManifest,
      sha256: sha256(backupPath),
      bytes: statSync(backupPath).size,
    };
    writeFileSync(result.manifestPath, `${JSON.stringify(incompatibleManifest, null, 2)}\n`);
    assert.throws(
      () => restoreLanPilotBackup({ databasePath, backupPath, allowedRoot: root }),
      /schema fingerprint mismatch/i,
    );
    assert.deepEqual(readFileSync(databasePath), liveBytes);
    assert.equal(existsSync(join(root, 'data', 'recovery')), false);
  } finally {
    db?.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});
