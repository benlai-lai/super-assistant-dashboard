import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPhase2bDatabase } from '../server/database.mjs';
import { createAccountRepository } from '../server/account-repository.mjs';
import { assertPilotDataPath } from '../server/lan-write-pilot.mjs';
import { createLanPilotBackup, restoreLanPilotBackup } from '../server/lan-maintenance.mjs';
import { readInteractivePilotPassword } from '../server/local-readonly-pilot.mjs';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const allowedRoot = process.env.DASHBOARD_PILOT_DATA_ROOT;
  const databasePath = process.env.DASHBOARD_PILOT_DB;
  if (!allowedRoot || !databasePath) throw new Error('DASHBOARD_PILOT_DATA_ROOT and DASHBOARD_PILOT_DB are required');
  assertPilotDataPath(databasePath, allowedRoot);

  if (command === 'restore') {
    if (args.length !== 1) throw new Error('Usage: restore <backup-path>');
    const result = restoreLanPilotBackup({ databasePath, backupPath: resolve(args[0]), allowedRoot });
    process.stdout.write(`restored=${result.databasePath}\nrecovery=${result.recoveryDirectory}\n`);
    return;
  }

  const db = openPhase2bDatabase(databasePath);
  try {
    if (command === 'backup') {
      if (args.length !== 1) throw new Error('Usage: backup <backup-path>');
      const result = await createLanPilotBackup({ db, backupPath: resolve(args[0]), allowedRoot });
      process.stdout.write(`backup=${result.backupPath}\nmanifest=${result.manifestPath}\n`);
      return;
    }
    const accounts = createAccountRepository(db);
    if (command === 'add') {
      if (args.length !== 2) throw new Error('Usage: add <actor-id> <username>');
      const password = await readInteractivePilotPassword();
      const account = await accounts.create({ id: args[0], username: args[1], password, role: 'editor' });
      process.stdout.write(`account=${account.id}\n`);
    } else if (command === 'disable') {
      if (args.length !== 1) throw new Error('Usage: disable <actor-id>');
      const account = accounts.disable(args[0]);
      process.stdout.write(`disabled=${account.id}\n`);
    } else if (command === 'reset-password') {
      if (args.length !== 1) throw new Error('Usage: reset-password <actor-id>');
      const password = await readInteractivePilotPassword();
      const account = await accounts.resetPassword(args[0], password);
      process.stdout.write(`reset=${account.id}\n`);
    } else if (command === 'list') {
      for (const account of accounts.list()) process.stdout.write(`${account.id}\t${account.username}\t${account.role}\t${account.isActive}\n`);
    } else {
      throw new Error('Usage: <add|disable|reset-password|list|backup|restore>');
    }
  } finally {
    db.close();
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
