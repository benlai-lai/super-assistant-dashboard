import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLanWritePilot } from '../../server/lan-write-pilot.mjs';
import { createCustomerRepository } from '../../server/customer-repository.mjs';
import { createInquiryRepository } from '../../server/inquiry-repository.mjs';

const parent = process.env.DASHBOARD_PHASE_A_TEST_ROOT || tmpdir();
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let root;
let databasePath;
let pilot;
let passwords;

async function launchPilot() {
  pilot = await createLanWritePilot({ databasePath, allowedDataRoot: root, testMode: true });
  await pilot.start();
}

async function login(page, index) {
  await page.goto(`${pilot.url}/lan-pilot/`);
  await page.getByLabel('帳號').fill(`editor${index}`);
  await page.getByLabel('密碼').fill(passwords[index - 1]);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page.locator('#session-summary')).toContainText(`pilot-editor-${index}`);
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function fulfillPilotJson(route, payload, { pilotHeader = true } = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (pilotHeader) headers['X-Dashboard-Lan-Pilot'] = 'phase-a';
  await route.fulfill({ status: 200, headers, body: JSON.stringify(payload) });
}

test.beforeAll(async () => {
  root = mkdtempSync(join(parent, 'dashboard-lan-e2e-'));
  databasePath = join(root, 'data', 'pilot.sqlite3');
  passwords = [1, 2, 3].map(() => `Synthetic-${randomBytes(12).toString('hex')}!`);
  pilot = await createLanWritePilot({ databasePath, allowedDataRoot: root, testMode: true });
  for (let index = 1; index <= 3; index += 1) {
    await pilot.accounts.create({ id: `pilot-editor-${index}`, username: `editor${index}`, password: passwords[index - 1], role: 'editor' });
  }
  await pilot.start();
});

test.afterAll(async () => {
  await pilot?.close().catch(() => {});
  if (root) rmSync(root, { recursive: true, force: true });
  if (root) expect(existsSync(root)).toBe(false);
});

test('three isolated browser sessions share CRUD, surface stale edits, persist after restart, and fit 390px', async ({ browser }) => {
  const contexts = await Promise.all([1, 2, 3].map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const runtimeErrors = [];
  const expectedConflictPages = new Set();
  let expectedConflictConsoleErrors = 0;
  for (const page of pages) {
    page.on('console', (message) => {
      if (!['error', 'warning'].includes(message.type())) return;
      if (expectedConflictPages.has(page) && message.type() === 'error' && /status of 409 \(Conflict\)/.test(message.text())) {
        expectedConflictConsoleErrors += 1;
        return;
      }
      runtimeErrors.push(message.text());
    });
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
  }
  try {
    await login(pages[0], 1);
    await pages[0].getByLabel('名稱').fill('E2E 合成客戶');
    await pages[0].getByLabel('聯絡人').fill('E2E 聯絡人');
    await pages[0].getByRole('button', { name: '儲存客戶' }).click();
    await expect(pages[0].locator('#customer-status')).toHaveText('已儲存');

    await login(pages[1], 2);
    await pages[1].getByRole('button', { name: 'E2E 合成客戶' }).click();
    await pages[1].getByLabel('標題').fill('E2E 合成詢價');
    await pages[1].getByRole('button', { name: '儲存詢價' }).click();
    await expect(pages[1].locator('#inquiry-status')).toHaveText('已儲存');

    await login(pages[2], 3);
    await pages[2].getByRole('button', { name: 'E2E 合成客戶' }).click();
    await pages[2].getByRole('button', { name: /E2E 合成詢價/ }).click();
    await pages[2].getByLabel('說明').fill('E2E 合成品項');
    await pages[2].getByLabel('數量').fill('4');
    await pages[2].getByRole('button', { name: '儲存品項' }).click();
    await expect(pages[2].locator('#item-status')).toHaveText('已儲存');

    await pages[1].getByLabel('標題').fill('E2E 合成詢價-更新');
    await pages[1].getByLabel('狀態').selectOption('active');
    await pages[1].getByRole('button', { name: '儲存詢價' }).click();
    await expect(pages[1].locator('#inquiry-status')).toHaveText('已儲存');

    await pages[2].getByLabel('標題').fill('不應覆蓋詢價');
    expectedConflictPages.add(pages[2]);
    await pages[2].getByRole('button', { name: '儲存詢價' }).click();
    await expect(pages[2].locator('#inquiry-status')).toContainText('資料已被其他人修改');
    expectedConflictPages.delete(pages[2]);
    await expect(pages[2].getByLabel('標題')).toHaveValue('E2E 合成詢價-更新');

    await expect(pages[1].getByRole('button', { name: /E2E 合成品項/ })).toBeVisible();
    await pages[1].getByRole('button', { name: /E2E 合成品項/ }).click();
    await pages[2].getByRole('button', { name: /E2E 合成品項/ }).click();
    await pages[2].getByLabel('說明').fill('E2E 合成品項-更新');
    await pages[2].getByLabel('數量').fill('5');
    await pages[2].getByRole('button', { name: '儲存品項' }).click();
    await expect(pages[2].locator('#item-status')).toHaveText('已儲存');

    await pages[1].getByLabel('說明').fill('不應覆蓋品項');
    expectedConflictPages.add(pages[1]);
    await pages[1].getByRole('button', { name: '儲存品項' }).click();
    await expect(pages[1].locator('#item-status')).toContainText('資料已被其他人修改');
    expectedConflictPages.delete(pages[1]);
    await expect(pages[1].getByLabel('說明')).toHaveValue('E2E 合成品項-更新');

    await pages[1].getByLabel('名稱').fill('E2E 客戶由 editor2 更新');
    await pages[1].getByRole('button', { name: '儲存客戶' }).click();
    await expect(pages[1].locator('#customer-status')).toHaveText('已儲存');
    await pages[0].getByLabel('名稱').fill('不應靜默覆蓋');
    expectedConflictPages.add(pages[0]);
    await pages[0].getByRole('button', { name: '儲存客戶' }).click();
    await expect(pages[0].locator('#customer-status')).toContainText('資料已被其他人修改');
    expectedConflictPages.delete(pages[0]);
    await expect(pages[0].getByLabel('名稱')).toHaveValue('E2E 客戶由 editor2 更新');

    await pages[2].setViewportSize({ width: 390, height: 844 });
    const overflow = await pages[2].evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(expectedConflictConsoleErrors).toBe(3);
    expect(runtimeErrors).toEqual([]);

    for (const context of contexts) await context.close();
    await pilot.close();
    await launchPilot();
    const restartContext = await browser.newContext();
    const restartPage = await restartContext.newPage();
    await login(restartPage, 3);
    await expect(restartPage.getByRole('button', { name: 'E2E 客戶由 editor2 更新' })).toBeVisible();
    await restartContext.close();
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
});

test('out-of-order item and audit responses cannot replace a newer selection or a logged-out view', async ({ browser }) => {
  const timestamp = '2026-09-09T12:00:00.000Z';
  const customers = createCustomerRepository(pilot.db);
  const inquiries = createInquiryRepository(pilot.db);
  customers.create({ id: 'race-customer', displayName: '競態測試客戶', createdAt: timestamp });
  inquiries.create({
    id: 'race-inquiry-a',
    customerId: 'race-customer',
    title: '競態詢價 A',
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  inquiries.create({
    id: 'race-inquiry-b',
    customerId: 'race-customer',
    title: '競態詢價 B',
    status: 'draft',
    createdAt: '2026-09-09T12:00:01.000Z',
    updatedAt: '2026-09-09T12:00:01.000Z',
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  let itemScenario = null;
  let auditScenario = null;
  await page.route('**/api/inquiries/*/items', async (route) => {
    const inquiryId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2));
    if (!itemScenario) return route.continue();
    return itemScenario(route, inquiryId);
  });
  await page.route('**/api/audit?*', async (route) => {
    const url = new URL(route.request().url());
    if (!auditScenario) return route.continue();
    return auditScenario(route, url.searchParams.get('entityType'), url.searchParams.get('entityId'));
  });

  try {
    await login(page, 1);
    await page.getByRole('button', { name: '競態測試客戶' }).click();
    await expect(page.getByRole('button', { name: /競態詢價 A/ })).toBeVisible();

    const aToBStarted = deferred();
    const releaseAToB = deferred();
    itemScenario = async (route, inquiryId) => {
      if (inquiryId === 'race-inquiry-a') {
        aToBStarted.resolve();
        await releaseAToB.promise;
        return fulfillPilotJson(route, { items: [{ id: 'stale-a-to-b', description: '過期 A→B', quantity: 1 }] });
      }
      return fulfillPilotJson(route, { items: [{ id: 'current-b', description: '目前 B', quantity: 1 }] });
    };
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await aToBStarted.promise;
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('目前 B');
    releaseAToB.resolve();
    await page.waitForTimeout(50);
    await expect(page.locator('#item-list')).toContainText('目前 B');
    await expect(page.locator('#item-list')).not.toContainText('過期 A→B');

    const aToBToAStarted = deferred();
    const releaseAToBToA = deferred();
    let aRequestCount = 0;
    itemScenario = async (route, inquiryId) => {
      if (inquiryId === 'race-inquiry-a' && aRequestCount++ === 0) {
        aToBToAStarted.resolve();
        await releaseAToBToA.promise;
        return fulfillPilotJson(route, { items: [{ id: 'stale-a-cycle', description: '過期 A 循環', quantity: 1 }] });
      }
      const description = inquiryId === 'race-inquiry-a' ? '目前 A 循環' : '目前 B 循環';
      return fulfillPilotJson(route, { items: [{ id: `current-${inquiryId}`, description, quantity: 1 }] });
    };
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await aToBToAStarted.promise;
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('目前 B 循環');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await expect(page.locator('#item-list')).toContainText('目前 A 循環');
    releaseAToBToA.resolve();
    await page.waitForTimeout(50);
    await expect(page.locator('#item-list')).toContainText('目前 A 循環');
    await expect(page.locator('#item-list')).not.toContainText('過期 A 循環');

    const auditStarted = deferred();
    const releaseAudit = deferred();
    auditScenario = async (route, entityType, entityId) => {
      if (entityType === 'inquiry' && entityId === 'race-inquiry-a') {
        auditStarted.resolve();
        await releaseAudit.promise;
        return fulfillPilotJson(route, { entries: [{ created_at: timestamp, actor_id: 'pilot-editor-1', action: '過期稽核' }] });
      }
      return fulfillPilotJson(route, { entries: [{ created_at: timestamp, actor_id: 'pilot-editor-1', action: '目前稽核' }] });
    };
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await auditStarted.promise;
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#audit-list')).toContainText('目前稽核');
    releaseAudit.resolve();
    await page.waitForTimeout(50);
    await expect(page.locator('#audit-list')).toContainText('目前稽核');
    await expect(page.locator('#audit-list')).not.toContainText('過期稽核');

    const staleErrorStarted = deferred();
    const releaseStaleError = deferred();
    itemScenario = async (route, inquiryId) => {
      if (inquiryId === 'race-inquiry-a') {
        staleErrorStarted.resolve();
        await releaseStaleError.promise;
        return fulfillPilotJson(route, {}, { pilotHeader: false });
      }
      return fulfillPilotJson(route, { items: [{ id: 'current-after-error', description: '錯誤後仍為 B', quantity: 1 }] });
    };
    auditScenario = async (route) => fulfillPilotJson(route, { entries: [] });
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await staleErrorStarted.promise;
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('錯誤後仍為 B');
    releaseStaleError.resolve();
    await page.waitForTimeout(50);
    await expect(page.locator('#item-list')).toContainText('錯誤後仍為 B');

    const logoutItemsStarted = deferred();
    const logoutAuditStarted = deferred();
    const releaseLogoutItems = deferred();
    const releaseLogoutAudit = deferred();
    const logoutStarted = deferred();
    const releaseLogout = deferred();
    itemScenario = async (route, inquiryId) => {
      if (inquiryId === 'race-inquiry-a') {
        logoutItemsStarted.resolve();
        await releaseLogoutItems.promise;
        return fulfillPilotJson(route, { items: [{ id: 'stale-after-logout', description: '登出後過期資料', quantity: 1 }] });
      }
      return fulfillPilotJson(route, { items: [] });
    };
    auditScenario = async (route, entityType, entityId) => {
      if (entityType === 'inquiry' && entityId === 'race-inquiry-a') {
        logoutAuditStarted.resolve();
        await releaseLogoutAudit.promise;
        return fulfillPilotJson(route, {}, { pilotHeader: false });
      }
      return fulfillPilotJson(route, { entries: [] });
    };
    await page.route('**/api/session', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      logoutStarted.resolve();
      await releaseLogout.promise;
      return route.continue();
    });
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await Promise.all([logoutItemsStarted.promise, logoutAuditStarted.promise]);
    await page.getByRole('button', { name: '登出' }).click();
    await logoutStarted.promise;
    releaseLogoutItems.resolve();
    releaseLogoutAudit.resolve();
    await page.waitForTimeout(50);
    await expect(page.locator('#item-list')).not.toContainText('登出後過期資料');
    await expect(page.locator('#audit-status')).not.toHaveText('修改紀錄載入失敗');
    releaseLogout.resolve();
    await expect(page.locator('#login-panel')).toBeVisible();

    expect(runtimeErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('repository-subpath static publication keeps login inert without contacting an API', async ({ browser }) => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    const assets = new Map([
      ['/super-assistant-dashboard/lan-pilot/', ['index.html', 'text/html; charset=utf-8']],
      ['/super-assistant-dashboard/lan-pilot/lan-pilot.css', ['lan-pilot.css', 'text/css; charset=utf-8']],
      ['/super-assistant-dashboard/lan-pilot/lan-pilot.js', ['lan-pilot.js', 'text/javascript; charset=utf-8']],
    ]);
    const asset = assets.get(req.url);
    if (!asset) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }
    const body = readFileSync(join(projectRoot, 'lan-pilot', asset[0]));
    res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': body.length });
    res.end(body);
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  try {
    await page.goto(`${baseUrl}/super-assistant-dashboard/lan-pilot/`);
    await expect(page.locator('#login-button')).toBeDisabled();
    await expect(page.locator('#username')).toBeDisabled();
    await expect(page.locator('#password')).toBeDisabled();
    await expect(page.locator('#login-status')).toHaveText('本頁未連接核准的本機服務，登入已停用。');
    expect(await page.locator('#login-form').count()).toBe(0);
    expect(await page.locator('#username').getAttribute('name')).toBeNull();
    expect(await page.locator('#password').getAttribute('name')).toBeNull();
    await page.locator('#login-button').dispatchEvent('click');
    await page.waitForTimeout(50);
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(new Set(requests.map((request) => request.url))).toEqual(new Set([
      '/super-assistant-dashboard/lan-pilot/',
      '/super-assistant-dashboard/lan-pilot/lan-pilot.css',
      '/super-assistant-dashboard/lan-pilot/lan-pilot.js',
    ]));
    expect(runtimeErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  } finally {
    await context.close();
    await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
  }
});
