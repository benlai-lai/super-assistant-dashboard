import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createCustomerRepository } from '../server/customer-repository.mjs';
import { createInquiryRepository } from '../server/inquiry-repository.mjs';
import { assertPilotDataPath, createLanWritePilot } from '../server/lan-write-pilot.mjs';
import { ensurePilotEditors } from '../scripts/start-lan-pilot-test.mjs';

const testParent = process.env.DASHBOARD_PHASE_A_TEST_ROOT || tmpdir();
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function temporaryRoot() {
  return mkdtempSync(join(testParent, 'dashboard-lan-write-'));
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.match(cookie, /^bk_dashboard_session=[a-f0-9]{64}$/);
  return cookie;
}

async function api(baseUrl, cookie, path, { method = 'GET', body, key, version } = {}) {
  const headers = { Origin: baseUrl, Cookie: cookie, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  if (version) headers['If-Match'] = `"${version}"`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})), headers: response.headers };
}

test('LAN write pilot provides three-account shared CRUD, deterministic retry, conflict, audit, and session invalidation', { timeout: 30_000 }, async () => {
  const root = temporaryRoot();
  const databasePath = join(root, 'data', 'pilot.sqlite3');
  let pilot = await createLanWritePilot({ databasePath, allowedDataRoot: root, testMode: true });
  const passwords = ['PhaseA-editor-one!', 'PhaseA-editor-two!', 'PhaseA-editor-three!'];
  try {
    for (let index = 0; index < 3; index += 1) {
      await pilot.accounts.create({ id: `pilot-editor-${index + 1}`, username: `editor${index + 1}`, password: passwords[index], role: 'editor' });
    }
    await pilot.start();
    const cookies = await Promise.all(passwords.map((password, index) => login(pilot.url, `editor${index + 1}`, password)));

    const html = await fetch(`${pilot.url}/lan-pilot/`, { headers: { Origin: pilot.url } });
    assert.equal(html.status, 200);
    const htmlText = await html.text();
    assert.match(htmlText, /客戶與詢價協作試用/);
    assert.match(htmlText, /data-pilot-runtime="phase-a"/);
    assert.doesNotMatch(htmlText, /<button[^>]*>[^<]*(?:刪除|報價|核准|LINE)/i);
    assert.match(htmlText, /href="\.\/lan-pilot\.css"/);
    assert.match(htmlText, /src="\.\/lan-pilot\.js"/);
    assert.doesNotMatch(htmlText, /<form[^>]+id="login-form"/i);
    assert.doesNotMatch(htmlText, /name="(?:username|password)"/i);
    assert.match(htmlText, /id="login-button"[^>]+disabled/);
    const staticHtml = readFileSync(join(projectRoot, 'lan-pilot', 'index.html'), 'utf8');
    assert.match(staticHtml, /data-pilot-runtime="static"/);
    assert.doesNotMatch(staticHtml, /data-pilot-runtime="phase-a"/);
    const health = await fetch(`${pilot.url}/api/health`, { headers: { Origin: pilot.url } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-dashboard-lan-pilot'), 'phase-a');
    for (const path of ['/api/product-categories', '/api/quotations/synthetic/internal']) {
      assert.equal((await api(pilot.url, cookies[0], path)).status, 404);
    }

    const customerBody = { displayName: '合成客戶 A', contactName: '測試聯絡人', email: 'synthetic@example.invalid', phone: null };
    const first = await api(pilot.url, cookies[0], '/api/customers', { method: 'POST', key: 'customer-create-0001', body: customerBody });
    assert.equal(first.status, 201);
    assert.equal(first.body.customer.row_version, 1);
    const replay = await api(pilot.url, cookies[0], '/api/customers', { method: 'POST', key: 'customer-create-0001', body: customerBody });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.customer.id, first.body.customer.id);
    assert.equal(pilot.db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 1);
    const reused = await api(pilot.url, cookies[0], '/api/customers', { method: 'POST', key: 'customer-create-0001', body: { ...customerBody, displayName: '不同內容' } });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error, 'idempotency_key_reused');
    const crossOperationReuse = await api(pilot.url, cookies[0], '/api/inquiries', {
      method: 'POST',
      key: 'customer-create-0001',
      body: { customerId: first.body.customer.id, title: '不應建立', status: 'draft' },
    });
    assert.equal(crossOperationReuse.status, 409);
    assert.equal(crossOperationReuse.body.error, 'idempotency_key_reused');
    assert.equal(pilot.db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 0);
    assert.equal((await api(pilot.url, cookies[0], `/api/customers/${first.body.customer.id}`, { method: 'DELETE' })).status, 404);

    const inquiry = await api(pilot.url, cookies[1], '/api/inquiries', {
      method: 'POST', key: 'inquiry-create-0001', body: { customerId: first.body.customer.id, title: '合成詢價', status: 'draft' },
    });
    assert.equal(inquiry.status, 201);
    const item = await api(pilot.url, cookies[2], `/api/inquiries/${inquiry.body.inquiry.id}/items`, {
      method: 'POST', key: 'item-create-0001', body: { description: '合成品項', quantity: 3, notes: '僅測試' },
    });
    assert.equal(item.status, 201);
    const inquiryUpdated = await api(pilot.url, cookies[1], `/api/inquiries/${inquiry.body.inquiry.id}`, {
      method: 'PATCH', key: 'inquiry-update-0001', version: 1, body: { title: '合成詢價-更新', status: 'active' },
    });
    assert.equal(inquiryUpdated.status, 200);
    assert.equal(inquiryUpdated.body.inquiry.row_version, 2);
    const itemUpdated = await api(pilot.url, cookies[2], `/api/inquiries/${inquiry.body.inquiry.id}/items/${item.body.item.id}`, {
      method: 'PATCH', key: 'item-update-0001', version: 1, body: { description: '合成品項-更新', quantity: 4, notes: '更新測試' },
    });
    assert.equal(itemUpdated.status, 200);
    assert.equal(itemUpdated.body.item.row_version, 2);

    for (const cookie of cookies) {
      const visible = await api(pilot.url, cookie, '/api/customers');
      assert.equal(visible.status, 200);
      assert.equal(visible.body.customers[0].display_name, '合成客戶 A');
    }

    const updated = await api(pilot.url, cookies[0], `/api/customers/${first.body.customer.id}`, {
      method: 'PATCH', key: 'customer-update-0001', version: 1, body: { displayName: '合成客戶 A-更新' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.customer.row_version, 2);
    const updateReplay = await api(pilot.url, cookies[0], `/api/customers/${first.body.customer.id}`, {
      method: 'PATCH', key: 'customer-update-0001', version: 1, body: { displayName: '合成客戶 A-更新' },
    });
    assert.equal(updateReplay.status, 200, 'idempotency replay must precede current If-Match evaluation');
    assert.equal(updateReplay.body.customer.row_version, 2);
    const stale = await api(pilot.url, cookies[1], `/api/customers/${first.body.customer.id}`, {
      method: 'PATCH', key: 'customer-update-0002', version: 1, body: { displayName: '不應覆蓋' },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'stale_version');
    const overlongPatch = await api(pilot.url, cookies[0], `/api/customers/${first.body.customer.id}`, {
      method: 'PATCH',
      key: 'customer-update-overlong-0001',
      version: 2,
      body: { displayName: 'x'.repeat(121) },
    });
    assert.equal(overlongPatch.status, 400);
    assert.equal(pilot.db.prepare('SELECT display_name FROM customers WHERE id = ?').get(first.body.customer.id).display_name, '合成客戶 A-更新');

    const audit = await api(pilot.url, cookies[2], `/api/audit?entityType=customer&entityId=${first.body.customer.id}`);
    assert.equal(audit.status, 200);
    assert.deepEqual(audit.body.entries.map((entry) => entry.action), ['created', 'updated']);
    assert.deepEqual(audit.body.entries.map((entry) => entry.actor_id), ['pilot-editor-1', 'pilot-editor-1']);
    const firstAudit = audit.body.entries[0];
    assert.throws(() => pilot.db.prepare('UPDATE audit_logs SET action = ? WHERE id = ?').run('tampered', firstAudit.id), /immutable/i);
    assert.throws(() => pilot.db.prepare('DELETE FROM audit_logs WHERE id = ?').run(firstAudit.id), /immutable/i);
    assert.throws(() => pilot.db.prepare(`
      INSERT OR REPLACE INTO audit_logs
        (id, entity_type, entity_id, action, payload_json, created_at, actor_id, request_id, before_json, after_json)
      VALUES (?, 'customer', ?, 'replaced', '{}', ?, ?, ?, NULL, NULL)
    `).run(firstAudit.id, first.body.customer.id, firstAudit.created_at, 'pilot-editor-1', 'replace-attempt'), /immutable/i);
    assert.equal(pilot.db.prepare('SELECT action FROM audit_logs WHERE id = ?').get(firstAudit.id).action, 'created');

    pilot.accounts.disable('pilot-editor-1');
    assert.equal((await api(pilot.url, cookies[0], '/api/customers')).status, 401);
    await pilot.accounts.resetPassword('pilot-editor-2', 'PhaseA-editor-two-new!');
    assert.equal((await api(pilot.url, cookies[1], '/api/customers')).status, 401);
    const newCookie = await login(pilot.url, 'editor2', 'PhaseA-editor-two-new!');
    assert.equal((await api(pilot.url, newCookie, '/api/customers')).status, 200);

    await pilot.close();
    pilot = await createLanWritePilot({ databasePath, allowedDataRoot: root, testMode: true });
    await pilot.start();
    const afterRestart = await login(pilot.url, 'editor3', passwords[2]);
    const persisted = await api(pilot.url, afterRestart, '/api/customers');
    assert.equal(persisted.body.customers[0].display_name, '合成客戶 A-更新');
    assert.equal(pilot.db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 1);
    assert.equal(pilot.db.prepare('SELECT COUNT(*) AS count FROM inquiry_items').get().count, 1);
    assert.equal(pilot.db.prepare('SELECT title FROM inquiries').get().title, '合成詢價-更新');
    assert.equal(pilot.db.prepare('SELECT description FROM inquiry_items').get().description, '合成品項-更新');
  } finally {
    await pilot.close().catch(() => {});
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('maximum-length legacy inquiry and item IDs remain writable through idempotency', async () => {
  const root = temporaryRoot();
  const pilot = await createLanWritePilot({
    databasePath: join(root, 'data', 'pilot.sqlite3'),
    allowedDataRoot: root,
    testMode: true,
  });
  const inquiryId = `i${'n'.repeat(80)}`;
  const itemId = `t${'m'.repeat(80)}`;
  const timestamp = '2026-09-09T09:00:00.000Z';
  try {
    await pilot.accounts.create({
      id: 'legacy-boundary-editor',
      username: 'legacy-editor',
      password: 'PhaseA-legacy-editor!',
      role: 'editor',
    });
    const customers = createCustomerRepository(pilot.db);
    const inquiries = createInquiryRepository(pilot.db);
    customers.create({ id: 'legacy-boundary-customer', displayName: '合成舊資料客戶', createdAt: timestamp });
    inquiries.create({
      id: inquiryId,
      customerId: 'legacy-boundary-customer',
      title: '合成舊資料詢價',
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    inquiries.addItem({
      id: itemId,
      inquiryId,
      description: '合成舊資料品項',
      quantity: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await pilot.start();
    const cookie = await login(pilot.url, 'legacy-editor', 'PhaseA-legacy-editor!');
    const response = await api(pilot.url, cookie, `/api/inquiries/${inquiryId}/items/${itemId}`, {
      method: 'PATCH',
      key: 'legacy-boundary-item-update-0001',
      version: 1,
      body: { description: '合成舊資料品項-更新' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.item.description, '合成舊資料品項-更新');
    assert.equal(response.body.item.row_version, 2);
  } finally {
    await pilot.close().catch(() => {});
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('bounded ZAP plan is anonymous passive-only and contains exactly the fixed loopback request set', () => {
  const source = readFileSync(join(projectRoot, 'security', 'zap', 'lan-write-pilot.yaml'), 'utf8');
  const wrapper = readFileSync(join(projectRoot, 'scripts', 'run-lan-pilot-zap.ps1'), 'utf8');
  assert.match(source, /type:\s*requestor/i);
  assert.match(source, /type:\s*passiveScan-wait/i);
  assert.match(source, /type:\s*report/i);
  assert.match(source, /template:\s*traditional-json/i);
  assert.match(source, /reportDir:\s*\$\{DASHBOARD_ZAP_REPORT_DIR\}/);
  assert.match(source, /type:\s*exitStatus/i);
  assert.match(source, /errorLevel:\s*Medium/i);
  assert.doesNotMatch(source, /type:\s*(?:spider|spiderAjax|activeScan)\b/i);
  assert.doesNotMatch(source, /\b(?:POST|PATCH|DELETE|Authorization|Cookie)\b/);
  assert.equal((source.match(/^\s*- url:/gm) ?? []).length, 8);
  assert.match(wrapper, /-cmd\s+-silent\s+-autorun/);
  assert.match(wrapper, /\$LASTEXITCODE\s+-ne\s+0/);
  assert.match(wrapper, /\.UserInfo/);
  assert.match(wrapper, /\.Query/);
  assert.match(wrapper, /\.Fragment/);
  assert.match(wrapper, /zap-home/);
  assert.match(wrapper, /lan-write-pilot-passive\.json/);
});

test('pilot data paths reject broad roots, Git worktrees, OneDrive variants, and symbolic components', () => {
  const root = temporaryRoot();
  try {
    const dedicated = join(root, 'dedicated');
    mkdirSync(dedicated);
    assert.equal(
      assertPilotDataPath(join(dedicated, 'data', 'pilot.sqlite3'), dedicated),
      resolve(dedicated, 'data', 'pilot.sqlite3'),
    );

    const gitContainer = join(root, 'other-worktree');
    const gitDataRoot = join(gitContainer, 'pilot-data');
    mkdirSync(gitDataRoot, { recursive: true });
    writeFileSync(join(gitContainer, '.git'), 'gitdir: synthetic\n');
    assert.throws(
      () => assertPilotDataPath(join(gitDataRoot, 'pilot.sqlite3'), gitDataRoot),
      /outside Git and OneDrive/i,
    );

    const oneDriveRoot = join(root, 'OneDrive - Synthetic Company', 'pilot-data');
    mkdirSync(oneDriveRoot, { recursive: true });
    assert.throws(
      () => assertPilotDataPath(join(oneDriveRoot, 'pilot.sqlite3'), oneDriveRoot),
      /outside Git and OneDrive/i,
    );

    const volumeRoot = parse(root).root;
    assert.throws(
      () => assertPilotDataPath(join(volumeRoot, 'synthetic-pilot.sqlite3'), volumeRoot),
      /must not be a volume root/i,
    );

    const realRoot = join(root, 'real-root');
    const linkedRoot = join(root, 'linked-root');
    mkdirSync(realRoot);
    symlinkSync(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => assertPilotDataPath(join(linkedRoot, 'pilot.sqlite3'), linkedRoot),
      /symlink, junction, or reparse/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('existing pilot editor accounts must match supplied identity, active role, and password', async () => {
  const root = temporaryRoot();
  const pilot = await createLanWritePilot({
    databasePath: join(root, 'data', 'pilot.sqlite3'),
    allowedDataRoot: root,
    testMode: true,
  });
  const passwords = ['PhaseA-editor-one!', 'PhaseA-editor-two!', 'PhaseA-editor-three!'];
  try {
    await ensurePilotEditors(pilot.accounts, passwords);
    await ensurePilotEditors(pilot.accounts, passwords);
    await assert.rejects(
      ensurePilotEditors(pilot.accounts, ['Wrong-editor-one!', passwords[1], passwords[2]]),
      /does not match the supplied identity and credentials/i,
    );
    pilot.accounts.disable('pilot-editor-1');
    await assert.rejects(
      ensurePilotEditors(pilot.accounts, passwords),
      /does not match the supplied identity and credentials/i,
    );
  } finally {
    await pilot.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('pilot startup rejects a pre-existing editor ID with a mismatched role', async () => {
  const root = temporaryRoot();
  const pilot = await createLanWritePilot({
    databasePath: join(root, 'data', 'pilot.sqlite3'),
    allowedDataRoot: root,
    testMode: true,
  });
  try {
    await pilot.accounts.create({
      id: 'pilot-editor-1',
      username: 'editor1',
      password: 'PhaseA-editor-one!',
      role: 'viewer',
    });
    await assert.rejects(
      ensurePilotEditors(pilot.accounts, ['PhaseA-editor-one!', 'PhaseA-editor-two!', 'PhaseA-editor-three!']),
      /does not match the supplied identity and credentials/i,
    );
    assert.equal(pilot.accounts.list().length, 1);
  } finally {
    await pilot.close();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});

test('insecure startup is fail-closed outside explicit loopback test mode', async () => {
  const root = temporaryRoot();
  try {
    await assert.rejects(
      createLanWritePilot({ host: '0.0.0.0', databasePath: join(root, 'pilot.sqlite3'), allowedDataRoot: root, testMode: true }),
      /Insecure pilot startup is limited/i,
    );
    await assert.rejects(
      createLanWritePilot({ host: '127.0.0.1', databasePath: join(root, 'pilot.sqlite3'), allowedDataRoot: root, testMode: false }),
      /Insecure pilot startup is limited/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
