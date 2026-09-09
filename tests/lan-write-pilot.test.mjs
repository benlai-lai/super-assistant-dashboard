import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createLanWritePilot } from '../server/lan-write-pilot.mjs';

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
    assert.doesNotMatch(htmlText, /<button[^>]*>[^<]*(?:刪除|報價|核准|LINE)/i);
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

test('bounded ZAP plan is anonymous passive-only and contains exactly the fixed loopback request set', () => {
  const source = readFileSync(join(projectRoot, 'security', 'zap', 'lan-write-pilot.yaml'), 'utf8');
  assert.match(source, /type:\s*requestor/i);
  assert.match(source, /type:\s*passiveScan-wait/i);
  assert.doesNotMatch(source, /type:\s*(?:spider|spiderAjax|activeScan)\b/i);
  assert.doesNotMatch(source, /\b(?:POST|PATCH|DELETE|Authorization|Cookie)\b/);
  assert.equal((source.match(/^\s*- url:/gm) ?? []).length, 8);
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
