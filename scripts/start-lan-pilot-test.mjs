import { join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLanWritePilot } from '../server/lan-write-pilot.mjs';

export async function ensurePilotEditors(accounts, passwords) {
  if (!Array.isArray(passwords) || passwords.length !== 3 || passwords.some((password) => !password)) {
    throw new Error('Exactly three pilot editor passwords are required');
  }
  for (let index = 0; index < 3; index += 1) {
    const id = `pilot-editor-${index + 1}`;
    const username = `editor${index + 1}`;
    const existing = accounts.get(id);
    if (!existing) {
      await accounts.create({ id, username, password: passwords[index], role: 'editor' });
      continue;
    }
    const authenticated = await accounts.authenticate(username, passwords[index]);
    if (
      existing.username !== username
      || existing.role !== 'editor'
      || existing.isActive !== true
      || authenticated?.actorId !== id
      || authenticated?.role !== 'editor'
    ) {
      throw new Error(`Existing pilot editor ${id} does not match the supplied identity and credentials`);
    }
  }
}

async function main() {
  const root = process.env.DASHBOARD_PHASE_A_TEST_ROOT;
  const passwords = [1, 2, 3].map((index) => process.env[`DASHBOARD_TEST_EDITOR_${index}_PASSWORD`]);
  if (!root || passwords.some((password) => !password)) {
    throw new Error('DASHBOARD_PHASE_A_TEST_ROOT and three DASHBOARD_TEST_EDITOR_*_PASSWORD values are required');
  }

  const pilot = await createLanWritePilot({
    databasePath: join(root, 'data', 'pilot.sqlite3'),
    allowedDataRoot: root,
    testMode: true,
  });

  try {
    await ensurePilotEditors(pilot.accounts, passwords);
    await pilot.start();
  } catch (error) {
    await pilot.close().catch(() => {});
    throw error;
  }
  process.stdout.write(`loopback_url=${pilot.url}/lan-pilot/\n`);

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await pilot.close();
  }
  process.once('SIGINT', () => close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => close().finally(() => process.exit(0)));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
