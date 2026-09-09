import { join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLanWritePilot } from '../server/lan-write-pilot.mjs';

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

  for (let index = 0; index < 3; index += 1) {
    const id = `pilot-editor-${index + 1}`;
    if (!pilot.accounts.get(id)) {
      await pilot.accounts.create({ id, username: `editor${index + 1}`, password: passwords[index], role: 'editor' });
    }
  }
  await pilot.start();
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
