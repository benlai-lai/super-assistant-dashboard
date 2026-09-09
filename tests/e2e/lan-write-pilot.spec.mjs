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

async function fulfillPilotJson(route, payload, { pilotHeader = true, status = 200 } = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (pilotHeader) headers['X-Dashboard-Lan-Pilot'] = 'phase-a';
  await route.fulfill({ status, headers, body: JSON.stringify(payload) });
}

async function installFetchCompletionSignals(context) {
  await context.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__dashboardTestFetchCompletions = [];
    window.fetch = async (input, options = {}) => {
      const response = await nativeFetch(input, options);
      const url = typeof input === 'string' ? input : input.url;
      const method = options.method ?? (typeof input === 'string' ? 'GET' : input.method) ?? 'GET';
      const nativeJson = response.json.bind(response);
      response.json = async () => {
        try {
          return await nativeJson();
        } finally {
          window.__dashboardTestFetchCompletions.push({ url, method, status: response.status });
        }
      };
      return response;
    };
  });
}

function fetchCompletionCount(page, { urlIncludes, method = 'GET' }) {
  return page.evaluate(({ expectedUrl, expectedMethod }) => window.__dashboardTestFetchCompletions
    .filter((entry) => entry.url.includes(expectedUrl) && entry.method === expectedMethod).length,
  { expectedUrl: urlIncludes, expectedMethod: method });
}

async function waitForFetchCompletion(page, { urlIncludes, method = 'GET', after }) {
  await page.waitForFunction(({ expectedUrl, expectedMethod, previousCount }) => window.__dashboardTestFetchCompletions
    .filter((entry) => entry.url.includes(expectedUrl) && entry.method === expectedMethod).length > previousCount,
  { expectedUrl: urlIncludes, expectedMethod: method, previousCount: after });
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
  await installFetchCompletionSignals(context);
  const page = await context.newPage();
  const runtimeErrors = [];
  let expectedHttpErrors = 0;
  page.on('console', (message) => {
    if (message.type() === 'error' && /status of 500 \(Internal Server Error\)/.test(message.text())) {
      expectedHttpErrors += 1;
      return;
    }
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
    const aToBBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items' });
    releaseAToB.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items', after: aToBBaseline });
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
    const aToBToABaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items' });
    releaseAToBToA.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items', after: aToBToABaseline });
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
    const auditBaseline = await fetchCompletionCount(page, { urlIncludes: 'entityId=race-inquiry-a' });
    releaseAudit.resolve();
    await waitForFetchCompletion(page, { urlIncludes: 'entityId=race-inquiry-a', after: auditBaseline });
    await expect(page.locator('#audit-list')).toContainText('目前稽核');
    await expect(page.locator('#audit-list')).not.toContainText('過期稽核');

    const staleErrorStarted = deferred();
    const releaseStaleError = deferred();
    itemScenario = async (route, inquiryId) => {
      if (inquiryId === 'race-inquiry-a') {
        staleErrorStarted.resolve();
        await releaseStaleError.promise;
        return fulfillPilotJson(route, { error: 'synthetic_stale_error' }, { status: 500 });
      }
      return fulfillPilotJson(route, { items: [{ id: 'current-after-error', description: '錯誤後仍為 B', quantity: 1 }] });
    };
    auditScenario = async (route) => fulfillPilotJson(route, { entries: [] });
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await staleErrorStarted.promise;
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('錯誤後仍為 B');
    const staleErrorBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items' });
    releaseStaleError.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items', after: staleErrorBaseline });
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
        return fulfillPilotJson(route, { error: 'synthetic_stale_error' }, { status: 500 });
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
    const [logoutItemsBaseline, logoutAuditBaseline] = await Promise.all([
      fetchCompletionCount(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items' }),
      fetchCompletionCount(page, { urlIncludes: 'entityId=race-inquiry-a' }),
    ]);
    releaseLogoutItems.resolve();
    releaseLogoutAudit.resolve();
    await Promise.all([
      waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/race-inquiry-a/items', after: logoutItemsBaseline }),
      waitForFetchCompletion(page, { urlIncludes: 'entityId=race-inquiry-a', after: logoutAuditBaseline }),
    ]);
    await expect(page.locator('#item-list')).not.toContainText('登出後過期資料');
    await expect(page.locator('#audit-status')).not.toHaveText('修改紀錄載入失敗');
    releaseLogout.resolve();
    await expect(page.locator('#login-panel')).toBeVisible();

    expect(expectedHttpErrors).toBe(2);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('selection resets and delayed mutation continuations cannot restore stale UI state', async ({ browser }) => {
  const timestamp = '2026-09-09T13:00:00.000Z';
  const customers = createCustomerRepository(pilot.db);
  const inquiries = createInquiryRepository(pilot.db);
  customers.create({ id: 'continuation-customer', displayName: '後續處理測試客戶', createdAt: timestamp });
  inquiries.create({
    id: 'continuation-inquiry-a',
    customerId: 'continuation-customer',
    title: '後續詢價 A',
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  inquiries.create({
    id: 'continuation-inquiry-b',
    customerId: 'continuation-customer',
    title: '後續詢價 B',
    status: 'draft',
    createdAt: '2026-09-09T13:00:01.000Z',
    updatedAt: '2026-09-09T13:00:01.000Z',
  });

  const context = await browser.newContext();
  await installFetchCompletionSignals(context);
  const page = await context.newPage();
  const runtimeErrors = [];
  let expectedHttpErrors = 0;
  page.on('console', (message) => {
    if (message.type() === 'error' && /status of 500 \(Internal Server Error\)/.test(message.text())) {
      expectedHttpErrors += 1;
      return;
    }
    if (['error', 'warning'].includes(message.type())) runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  try {
    await login(page, 1);

    const inquiryLoadStarted = deferred();
    const releaseInquiryLoad = deferred();
    await page.route('**/api/inquiries?limit=100', async (route) => {
      inquiryLoadStarted.resolve();
      await releaseInquiryLoad.promise;
      return route.continue();
    });
    await page.getByRole('button', { name: '後續處理測試客戶' }).click();
    await inquiryLoadStarted.promise;
    await page.locator('#new-customer').click();
    const inquiryLoadBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries?limit=100' });
    releaseInquiryLoad.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries?limit=100', after: inquiryLoadBaseline });
    await expect(page.locator('#inquiry-list')).toBeEmpty();
    expect(runtimeErrors).toEqual([]);
    await page.unroute('**/api/inquiries?limit=100');

    await page.getByRole('button', { name: '後續處理測試客戶' }).click();
    await expect(page.getByRole('button', { name: /後續詢價 A/ })).toBeVisible();
    const itemLoadStarted = deferred();
    const releaseItemLoad = deferred();
    await page.route('**/api/inquiries/continuation-inquiry-a/items', async (route) => {
      itemLoadStarted.resolve();
      await releaseItemLoad.promise;
      return fulfillPilotJson(route, { items: [{ id: 'stale-reset-item', description: '不應恢復的品項', quantity: 1 }] });
    });
    await page.getByRole('button', { name: /後續詢價 A/ }).click();
    await itemLoadStarted.promise;
    await page.locator('#new-item').click();
    const itemLoadBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a/items' });
    releaseItemLoad.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a/items', after: itemLoadBaseline });
    await expect(page.locator('#item-list')).not.toContainText('不應恢復的品項');
    await expect(page.locator('#item-description')).toHaveValue('');
    await page.unroute('**/api/inquiries/continuation-inquiry-a/items');

    await page.getByRole('button', { name: /後續詢價 A/ }).click();
    const mutationReachedServer = deferred();
    const releaseMutation = deferred();
    await page.route('**/api/inquiries/continuation-inquiry-a', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      mutationReachedServer.resolve();
      await releaseMutation.promise;
      return route.fulfill({ response });
    });
    await page.getByLabel('標題').fill('伺服器已寫入但畫面不得跳回 A');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await mutationReachedServer.promise;
    await page.getByRole('button', { name: /後續詢價 B/ }).click();
    const mutationBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a', method: 'PATCH' });
    releaseMutation.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a', method: 'PATCH', after: mutationBaseline });
    await expect(page.locator('#selected-inquiry')).toContainText('後續詢價 B');
    await expect(page.getByLabel('標題')).toHaveValue('後續詢價 B');
    expect(inquiries.get('continuation-inquiry-a').title).toBe('伺服器已寫入但畫面不得跳回 A');

    await page.unroute('**/api/inquiries/continuation-inquiry-a');
    await page.getByRole('button', { name: '後續處理測試客戶' }).click();
    await expect(page.getByRole('button', { name: /伺服器已寫入但畫面不得跳回 A/ })).toBeVisible();
    await page.getByRole('button', { name: /伺服器已寫入但畫面不得跳回 A/ }).click();
    const olderMutationReachedServer = deferred();
    const releaseOlderMutation = deferred();
    await page.route('**/api/inquiries/continuation-inquiry-a', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      olderMutationReachedServer.resolve();
      await releaseOlderMutation.promise;
      return route.fulfill({ response });
    });
    await page.getByLabel('標題').fill('較早 A 寫入');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await olderMutationReachedServer.promise;
    await page.getByRole('button', { name: /後續詢價 B/ }).click();

    const retryKeys = [];
    await page.route('**/api/inquiries/continuation-inquiry-b', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      retryKeys.push(route.request().headers()['idempotency-key']);
      return fulfillPilotJson(route, { error: 'synthetic_retry' }, { status: 500 });
    });
    await page.getByLabel('標題').fill('B 冪等重送');
    const firstRetryBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/continuation-inquiry-b', method: 'PATCH' });
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/continuation-inquiry-b', method: 'PATCH', after: firstRetryBaseline });
    await expect(page.locator('#inquiry-status')).toContainText('synthetic_retry');

    const olderMutationBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a', method: 'PATCH' });
    releaseOlderMutation.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a', method: 'PATCH', after: olderMutationBaseline });
    const secondRetryBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/continuation-inquiry-b', method: 'PATCH' });
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/continuation-inquiry-b', method: 'PATCH', after: secondRetryBaseline });
    expect(retryKeys).toHaveLength(2);
    expect(retryKeys[1]).toBe(retryKeys[0]);
    await page.unroute('**/api/inquiries/continuation-inquiry-a');
    await page.unroute('**/api/inquiries/continuation-inquiry-b');

    await page.getByRole('button', { name: '後續處理測試客戶' }).click();
    await expect(page.getByRole('button', { name: /較早 A 寫入/ })).toBeVisible();
    await page.getByRole('button', { name: /較早 A 寫入/ }).click();
    await page.getByLabel('標題').fill('登出期間伺服器寫入');
    const logoutMutationReachedServer = deferred();
    const releaseLogoutMutation = deferred();
    const logoutStarted = deferred();
    const releaseLogout = deferred();
    await page.unroute('**/api/inquiries/continuation-inquiry-a');
    await page.route('**/api/inquiries/continuation-inquiry-a', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      logoutMutationReachedServer.resolve();
      await releaseLogoutMutation.promise;
      return route.fulfill({ response });
    });
    await page.route('**/api/session', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      logoutStarted.resolve();
      await releaseLogout.promise;
      return route.continue();
    });
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await logoutMutationReachedServer.promise;
    await page.getByRole('button', { name: '登出' }).click();
    await logoutStarted.promise;
    await expect(page.getByLabel('標題')).toHaveValue('');
    const logoutMutationBaseline = await fetchCompletionCount(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a', method: 'PATCH' });
    releaseLogoutMutation.resolve();
    await waitForFetchCompletion(page, { urlIncludes: '/api/inquiries/continuation-inquiry-a', method: 'PATCH', after: logoutMutationBaseline });
    await expect(page.getByLabel('標題')).toHaveValue('');
    await expect(page.locator('#customer-list')).toBeEmpty();
    await expect(page.locator('#inquiry-list')).toBeEmpty();
    await expect(page.locator('#item-list')).toBeEmpty();
    releaseLogout.resolve();
    await expect(page.locator('#login-panel')).toBeVisible();

    expect(expectedHttpErrors).toBe(2);
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
