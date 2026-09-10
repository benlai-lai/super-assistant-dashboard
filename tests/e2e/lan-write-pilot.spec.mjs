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

async function installOperationCompletionSignals(context) {
  await context.route('**/lan-pilot/', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const scriptTag = '<script src="./lan-pilot.js"></script>';
    if (!html.includes(scriptTag)) throw new Error('LAN pilot operation-observer script tag is missing');
    await route.fulfill({
      response,
      body: html.replace(
        scriptTag,
        '<script src="./lan-pilot.js" data-operation-observer="phase-a-e2e"></script>',
      ),
    });
  });
  await context.addInitScript(() => {
    window.__dashboardTestOperationEvents = { started: [], settled: [] };
    window.__dashboardPilotTestObserver = Object.freeze({
      started(event) {
        window.__dashboardTestOperationEvents.started.push({ id: event.id, name: event.name });
      },
      settled(event) {
        window.__dashboardTestOperationEvents.settled.push({ id: event.id, name: event.name });
      },
    });
  });
}

function operationStartedCount(page, name) {
  return page.evaluate((expectedName) => window.__dashboardTestOperationEvents.started
    .filter((entry) => entry.name === expectedName).length, name);
}

async function waitForOperationStarted(page, { name, after }) {
  await page.waitForFunction(({ expectedName, previousCount }) => window.__dashboardTestOperationEvents.started
    .filter((entry) => entry.name === expectedName).length > previousCount,
  { expectedName: name, previousCount: after });
  return page.evaluate((expectedName) => window.__dashboardTestOperationEvents.started
    .filter((entry) => entry.name === expectedName).at(-1).id, name);
}

async function waitForOperationSettled(page, operationId) {
  await page.waitForFunction((expectedId) => window.__dashboardTestOperationEvents.settled
    .some((entry) => entry.id === expectedId), operationId);
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

test('logical mutation operations own independent idempotency keys and preserve ambiguous retries', async ({ browser }) => {
  const context = await browser.newContext();
  await installOperationCompletionSignals(context);
  const page = await context.newPage();
  const requests = [];
  let customerScenario = null;
  await page.route('**/api/customers', async (route) => {
    if (route.request().method() !== 'POST' || !customerScenario) return route.continue();
    const request = {
      body: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    };
    requests.push(request);
    return customerScenario(route, request, requests.length - 1);
  });

  try {
    await login(page, 1);

    customerScenario = (route, request, index) => fulfillPilotJson(
      route,
      { error: `synthetic_retry_${index + 1}` },
      { status: 500 },
    );
    for (const [index, name] of ['A 相同內容', 'B 不同內容', 'A 相同內容'].entries()) {
      await page.getByLabel('名稱').fill(name);
      await page.getByRole('button', { name: '儲存客戶' }).click();
      await expect(page.locator('#customer-status')).toContainText(`synthetic_retry_${index + 1}`);
    }
    expect(requests[2].key).toBe(requests[0].key);
    expect(requests[1].key).not.toBe(requests[0].key);

    await page.locator('#new-customer').click();
    await page.getByLabel('名稱').fill('相同 fingerprint 的獨立操作');
    const firstStarted = deferred();
    const secondStarted = deferred();
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    const independent = [];
    customerScenario = async (route, request) => {
      independent.push(request);
      if (independent.length === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
        return fulfillPilotJson(route, {
          customer: {
            id: 'synthetic-older-operation',
            display_name: request.body.displayName,
            row_version: 1,
          },
        }, { status: 201 });
      }
      if (independent.length === 2) {
        secondStarted.resolve();
        await releaseSecond.promise;
      }
      return fulfillPilotJson(route, { error: 'synthetic_newer_retry' }, { status: 500 });
    };

    const firstOperationBaseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    await firstStarted.promise;
    const firstOperationId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: firstOperationBaseline,
    });

    await page.locator('#new-customer').click();
    await page.getByLabel('名稱').fill('相同 fingerprint 的獨立操作');
    const secondOperationBaseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    await secondStarted.promise;
    const secondOperationId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: secondOperationBaseline,
    });
    expect(independent[1].key).not.toBe(independent[0].key);

    releaseFirst.resolve();
    await waitForOperationSettled(page, firstOperationId);
    await expect(page.locator('#customer-status')).toHaveText('儲存中…');

    releaseSecond.resolve();
    await waitForOperationSettled(page, secondOperationId);
    await expect(page.locator('#customer-status')).toContainText('synthetic_newer_retry');
    const retryBaseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    const retryOperationId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: retryBaseline,
    });
    await waitForOperationSettled(page, retryOperationId);
    expect(independent[2].key).toBe(independent[1].key);

    await page.locator('#new-customer').click();
    await page.getByLabel('名稱').fill('伺服器已提交但回應中斷');
    const committedKeys = [];
    let committedRequestCount = 0;
    customerScenario = async (route, request) => {
      committedKeys.push(request.key);
      committedRequestCount += 1;
      if (committedRequestCount === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        return fulfillPilotJson(route, { error: 'synthetic_response_interrupted' }, { status: 500 });
      }
      return route.continue();
    };

    const interruptedBaseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    const interruptedId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: interruptedBaseline,
    });
    await waitForOperationSettled(page, interruptedId);
    await expect(page.locator('#customer-status')).toContainText('synthetic_response_interrupted');

    const replayBaseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    const replayId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: replayBaseline,
    });
    await waitForOperationSettled(page, replayId);
    await expect(page.locator('#customer-status')).toHaveText('已儲存');
    expect(committedKeys[1]).toBe(committedKeys[0]);
    expect(pilot.db.prepare('SELECT COUNT(*) AS count FROM customers WHERE display_name = ?')
      .get('伺服器已提交但回應中斷').count).toBe(1);

    await page.locator('#new-customer').click();
    await page.getByLabel('名稱').fill('伺服器已提交但回應中斷');
    const independentCreateBaseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    const independentCreateId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: independentCreateBaseline,
    });
    await waitForOperationSettled(page, independentCreateId);
    expect(committedKeys[2]).not.toBe(committedKeys[1]);
    expect(pilot.db.prepare('SELECT COUNT(*) AS count FROM customers WHERE display_name = ?')
      .get('伺服器已提交但回應中斷').count).toBe(2);

    for (const responseCase of [
      { label: '格式錯誤的成功回應', body: '{' },
      { label: '缺少 entity 的成功回應', body: '{}' },
    ]) {
      await page.locator('#new-customer').click();
      await page.getByLabel('名稱').fill(responseCase.label);
      const ambiguousKeys = [];
      let ambiguousRequestCount = 0;
      customerScenario = async (route, request) => {
        ambiguousKeys.push(request.key);
        ambiguousRequestCount += 1;
        if (ambiguousRequestCount === 1) {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          return route.fulfill({
            status: 201,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'X-Dashboard-Lan-Pilot': 'phase-a',
            },
            body: responseCase.body,
          });
        }
        return route.continue();
      };

      const ambiguousBaseline = await operationStartedCount(page, 'mutate-customer');
      await page.getByRole('button', { name: '儲存客戶' }).click();
      const ambiguousId = await waitForOperationStarted(page, {
        name: 'mutate-customer',
        after: ambiguousBaseline,
      });
      await waitForOperationSettled(page, ambiguousId);
      await expect(page.locator('#customer-status')).toContainText('invalid_response');
      await expect(page.locator('#customer-id')).toHaveValue('');
      expect(pilot.db.prepare('SELECT COUNT(*) AS count FROM customers WHERE display_name = ?')
        .get(responseCase.label).count).toBe(1);

      const replayBaselineForInvalidResponse = await operationStartedCount(page, 'mutate-customer');
      await page.getByRole('button', { name: '儲存客戶' }).click();
      const replayIdForInvalidResponse = await waitForOperationStarted(page, {
        name: 'mutate-customer',
        after: replayBaselineForInvalidResponse,
      });
      await waitForOperationSettled(page, replayIdForInvalidResponse);
      await expect(page.locator('#customer-status')).toHaveText('已儲存');
      await expect(page.locator('#selected-customer')).toContainText(responseCase.label);
      expect(ambiguousKeys[1]).toBe(ambiguousKeys[0]);
      expect(pilot.db.prepare('SELECT COUNT(*) AS count FROM customers WHERE display_name = ?')
        .get(responseCase.label).count).toBe(1);
    }
  } finally {
    await context.close();
  }
});

test('selection resets and session transitions clear every mutation status', async ({ browser }) => {
  const customerName = `狀態清理客戶-${randomBytes(4).toString('hex')}`;
  createCustomerRepository(pilot.db).create({
    id: `status-customer-${randomBytes(8).toString('hex')}`,
    displayName: customerName,
    createdAt: new Date().toISOString(),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, 1);
    for (const buttonId of ['new-customer', 'new-inquiry', 'new-item']) {
      await page.evaluate(() => {
        document.querySelector('#customer-status').textContent = '舊客戶狀態';
        document.querySelector('#inquiry-status').textContent = '舊詢價狀態';
        document.querySelector('#item-status').textContent = '舊品項狀態';
      });
      await page.locator(`#${buttonId}`).click();
      await expect(page.locator('#customer-status')).toHaveText('');
      await expect(page.locator('#inquiry-status')).toHaveText('');
      await expect(page.locator('#item-status')).toHaveText('');
    }

    await page.evaluate(() => {
      document.querySelector('#customer-status').textContent = '舊客戶狀態';
      document.querySelector('#inquiry-status').textContent = '舊詢價狀態';
      document.querySelector('#item-status').textContent = '舊品項狀態';
    });
    await page.getByRole('button', { name: customerName }).click();
    await expect(page.locator('#customer-status')).toHaveText('');
    await expect(page.locator('#inquiry-status')).toHaveText('');
    await expect(page.locator('#item-status')).toHaveText('');

    await page.evaluate(() => {
      document.querySelector('#customer-status').textContent = '舊客戶狀態';
      document.querySelector('#inquiry-status').textContent = '舊詢價狀態';
      document.querySelector('#item-status').textContent = '舊品項狀態';
    });
    const logoutStarted = deferred();
    const releaseLogout = deferred();
    await page.route('**/api/session', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      logoutStarted.resolve();
      await releaseLogout.promise;
      return route.continue();
    });
    const reloaded = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '登出' }).dispatchEvent('click');
    await logoutStarted.promise;
    await expect(page.locator('#customer-status')).toHaveText('');
    await expect(page.locator('#inquiry-status')).toHaveText('');
    await expect(page.locator('#item-status')).toHaveText('');
    releaseLogout.resolve();
    await reloaded;
    await expect(page.locator('#login-panel')).toBeVisible();
    await login(page, 1);
    await expect(page.locator('#customer-status')).toHaveText('');
    await expect(page.locator('#inquiry-status')).toHaveText('');
    await expect(page.locator('#item-status')).toHaveText('');
  } finally {
    await context.close();
  }
});

test('successful and stale parent continuations preserve only their own mutation status', async ({ browser }) => {
  const suffix = randomBytes(4).toString('hex');
  const customerId = `status-parent-customer-${suffix}`;
  const inquiryId = `status-parent-inquiry-${suffix}`;
  const itemId = `status-parent-item-${suffix}`;
  const customerName = `父層狀態客戶-${suffix}`;
  const inquiryTitle = `父層狀態詢價-${suffix}`;
  const itemDescription = `父層狀態品項-${suffix}`;
  const createdAt = new Date().toISOString();
  const customers = createCustomerRepository(pilot.db);
  const inquiries = createInquiryRepository(pilot.db);
  customers.create({ id: customerId, displayName: customerName, createdAt });
  inquiries.create({
    id: inquiryId,
    customerId,
    title: inquiryTitle,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  });
  inquiries.addItem({
    id: itemId,
    inquiryId,
    description: itemDescription,
    quantity: 1,
    createdAt,
    updatedAt: createdAt,
  });

  const context = await browser.newContext();
  await installOperationCompletionSignals(context);
  const page = await context.newPage();
  const statusIds = ['customer-status', 'inquiry-status', 'item-status'];
  async function seedStatuses() {
    await page.evaluate((ids) => {
      for (const id of ids) document.querySelector(`#${id}`).textContent = `舊-${id}`;
    }, statusIds);
  }
  async function expectOnlyStatus(statusId, expected) {
    for (const candidate of statusIds) {
      const locator = page.locator(`#${candidate}`);
      if (candidate === statusId) await expect(locator).toContainText(expected);
      else await expect(locator).toHaveText('');
    }
  }
  async function submitAndSettle(buttonName, operationName) {
    const baseline = await operationStartedCount(page, operationName);
    await page.getByRole('button', { name: buttonName }).click();
    const operationId = await waitForOperationStarted(page, { name: operationName, after: baseline });
    await waitForOperationSettled(page, operationId);
  }

  try {
    await login(page, 1);
    await page.getByRole('button', { name: customerName }).click();
    await page.getByRole('button', { name: new RegExp(inquiryTitle) }).click();
    await page.getByRole('button', { name: new RegExp(itemDescription) }).click();

    await seedStatuses();
    await page.locator('#item-description').fill(`${itemDescription}-成功`);
    await submitAndSettle('儲存品項', 'mutate-item');
    await expectOnlyStatus('item-status', '已儲存');

    const itemBeforeStale = inquiries.getItem(itemId);
    inquiries.updateItem(inquiryId, itemId, { description: `${itemDescription}-外部更新` }, {
      expectedVersion: itemBeforeStale.row_version,
      updatedAt: new Date().toISOString(),
    });
    await seedStatuses();
    await page.locator('#item-description').fill(`${itemDescription}-過期嘗試`);
    await submitAndSettle('儲存品項', 'mutate-item');
    await expectOnlyStatus('item-status', '資料已被其他人修改');
    await expect(page.locator('#item-description')).toHaveValue(`${itemDescription}-外部更新`);

    await seedStatuses();
    await page.locator('#inquiry-title').fill(`${inquiryTitle}-成功`);
    await submitAndSettle('儲存詢價', 'mutate-inquiry');
    await expectOnlyStatus('inquiry-status', '已儲存');

    const inquiryBeforeStale = inquiries.get(inquiryId);
    inquiries.update(inquiryId, { title: `${inquiryTitle}-外部更新` }, {
      expectedVersion: inquiryBeforeStale.row_version,
      updatedAt: new Date().toISOString(),
    });
    await seedStatuses();
    await page.locator('#inquiry-title').fill(`${inquiryTitle}-過期嘗試`);
    await submitAndSettle('儲存詢價', 'mutate-inquiry');
    await expectOnlyStatus('inquiry-status', '資料已被其他人修改');
    await expect(page.locator('#inquiry-title')).toHaveValue(`${inquiryTitle}-外部更新`);

    await seedStatuses();
    await page.locator('#customer-name').fill(`${customerName}-成功`);
    await submitAndSettle('儲存客戶', 'mutate-customer');
    await expectOnlyStatus('customer-status', '已儲存');

    const customerBeforeStale = customers.get(customerId);
    customers.update(customerId, { displayName: `${customerName}-外部更新` }, {
      expectedVersion: customerBeforeStale.row_version,
      updatedAt: new Date().toISOString(),
    });
    await seedStatuses();
    await page.locator('#customer-name').fill(`${customerName}-過期嘗試`);
    await submitAndSettle('儲存客戶', 'mutate-customer');
    await expectOnlyStatus('customer-status', '資料已被其他人修改');
    await expect(page.locator('#customer-name')).toHaveValue(`${customerName}-外部更新`);
  } finally {
    await context.close();
  }
});

test('operation completion barrier observes the full async application continuation', async ({ browser }) => {
  const context = await browser.newContext();
  await installOperationCompletionSignals(context);
  const page = await context.newPage();
  try {
    await login(page, 1);
    const followupStarted = deferred();
    const releaseFollowup = deferred();
    await page.route('**/api/customers*', async (route) => {
      if (route.request().method() === 'POST') return route.continue();
      followupStarted.resolve();
      await releaseFollowup.promise;
      return route.continue();
    });
    await page.locator('#new-customer').click();
    await page.getByLabel('名稱').fill(`完成屏障測試-${randomBytes(4).toString('hex')}`);
    const baseline = await operationStartedCount(page, 'mutate-customer');
    await page.getByRole('button', { name: '儲存客戶' }).click();
    const operationId = await waitForOperationStarted(page, {
      name: 'mutate-customer',
      after: baseline,
    });
    await followupStarted.promise;
    expect(await page.evaluate((expectedId) => window.__dashboardTestOperationEvents.settled
      .some((entry) => entry.id === expectedId), operationId)).toBe(false);
    releaseFollowup.resolve();
    await waitForOperationSettled(page, operationId);
    await expect(page.locator('#customer-status')).toHaveText('已儲存');
    await expect(page.locator('#customer-id')).not.toHaveValue('');
    await expect(page.locator('#customer-version')).toHaveValue('1');
    await expect(page.getByLabel('名稱')).toHaveValue(/完成屏障測試-/);
    await expect(page.locator('#selected-customer')).toContainText('完成屏障測試-');
    await expect(page.locator('#customer-form').getByRole('button', { name: '儲存客戶' })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test('ordinary pilot execution never invokes a mutable global test observer', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__dashboardUnexpectedObserverCalls = 0;
    window.__dashboardPilotTestObserver = {
      started(event) {
        window.__dashboardUnexpectedObserverCalls += 1;
        if (event.name === 'mutate-customer') document.querySelector('#new-customer')?.click();
      },
      settled() {
        window.__dashboardUnexpectedObserverCalls += 1;
        throw new Error('ordinary execution must not invoke a global test observer');
      },
    };
  });
  const page = await context.newPage();
  try {
    await login(page, 1);
    const name = `一般模式觀察邊界-${randomBytes(4).toString('hex')}`;
    await page.locator('#new-customer').click();
    await page.getByLabel('名稱').fill(name);
    await page.getByRole('button', { name: '儲存客戶' }).click();
    await expect(page.locator('#customer-status')).toHaveText('已儲存');
    await expect(page.getByLabel('名稱')).toHaveValue(name);
    await expect(page.locator('#selected-customer')).toContainText(name);
    expect(await page.evaluate(() => window.__dashboardUnexpectedObserverCalls)).toBe(0);
  } finally {
    await context.close();
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
  await installOperationCompletionSignals(context);
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
    const aToBOperationBaseline = await operationStartedCount(page, 'load-items');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await aToBStarted.promise;
    const aToBOperationId = await waitForOperationStarted(page, {
      name: 'load-items',
      after: aToBOperationBaseline,
    });
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('目前 B');
    releaseAToB.resolve();
    await waitForOperationSettled(page, aToBOperationId);
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
    const aToBToAOperationBaseline = await operationStartedCount(page, 'load-items');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await aToBToAStarted.promise;
    const aToBToAOperationId = await waitForOperationStarted(page, {
      name: 'load-items',
      after: aToBToAOperationBaseline,
    });
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('目前 B 循環');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await expect(page.locator('#item-list')).toContainText('目前 A 循環');
    releaseAToBToA.resolve();
    await waitForOperationSettled(page, aToBToAOperationId);
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
    const auditOperationBaseline = await operationStartedCount(page, 'load-audit');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await auditStarted.promise;
    const auditOperationId = await waitForOperationStarted(page, {
      name: 'load-audit',
      after: auditOperationBaseline,
    });
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#audit-list')).toContainText('目前稽核');
    releaseAudit.resolve();
    await waitForOperationSettled(page, auditOperationId);
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
    const staleErrorOperationBaseline = await operationStartedCount(page, 'load-items');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await staleErrorStarted.promise;
    const staleErrorOperationId = await waitForOperationStarted(page, {
      name: 'load-items',
      after: staleErrorOperationBaseline,
    });
    await page.getByRole('button', { name: /競態詢價 B/ }).click();
    await expect(page.locator('#item-list')).toContainText('錯誤後仍為 B');
    releaseStaleError.resolve();
    await waitForOperationSettled(page, staleErrorOperationId);
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
    const logoutItemsOperationBaseline = await operationStartedCount(page, 'load-items');
    const logoutAuditOperationBaseline = await operationStartedCount(page, 'load-audit');
    await page.getByRole('button', { name: /競態詢價 A/ }).click();
    await Promise.all([logoutItemsStarted.promise, logoutAuditStarted.promise]);
    const logoutItemsOperationId = await waitForOperationStarted(page, {
      name: 'load-items',
      after: logoutItemsOperationBaseline,
    });
    const logoutAuditOperationId = await waitForOperationStarted(page, {
      name: 'load-audit',
      after: logoutAuditOperationBaseline,
    });
    const reloaded = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '登出' }).dispatchEvent('click');
    await logoutStarted.promise;
    releaseLogoutItems.resolve();
    releaseLogoutAudit.resolve();
    await Promise.all([
      waitForOperationSettled(page, logoutItemsOperationId),
      waitForOperationSettled(page, logoutAuditOperationId),
    ]);
    await expect(page.locator('#item-list')).not.toContainText('登出後過期資料');
    await expect(page.locator('#audit-status')).not.toHaveText('修改紀錄載入失敗');
    releaseLogout.resolve();
    await reloaded;
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
  await installOperationCompletionSignals(context);
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
    const inquiryLoadOperationBaseline = await operationStartedCount(page, 'load-inquiries');
    await page.getByRole('button', { name: '後續處理測試客戶' }).click();
    await inquiryLoadStarted.promise;
    const inquiryLoadOperationId = await waitForOperationStarted(page, {
      name: 'load-inquiries',
      after: inquiryLoadOperationBaseline,
    });
    await page.locator('#new-customer').click();
    releaseInquiryLoad.resolve();
    await waitForOperationSettled(page, inquiryLoadOperationId);
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
    const itemLoadOperationBaseline = await operationStartedCount(page, 'load-items');
    await page.getByRole('button', { name: /後續詢價 A/ }).click();
    await itemLoadStarted.promise;
    const itemLoadOperationId = await waitForOperationStarted(page, {
      name: 'load-items',
      after: itemLoadOperationBaseline,
    });
    await page.locator('#new-item').click();
    await expect(page.locator('#item-status')).toHaveText('');
    releaseItemLoad.resolve();
    await waitForOperationSettled(page, itemLoadOperationId);
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
    const mutationOperationBaseline = await operationStartedCount(page, 'mutate-inquiry');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await mutationReachedServer.promise;
    const mutationOperationId = await waitForOperationStarted(page, {
      name: 'mutate-inquiry',
      after: mutationOperationBaseline,
    });
    await page.getByRole('button', { name: /後續詢價 B/ }).click();
    await expect(page.locator('#inquiry-status')).toHaveText('');
    releaseMutation.resolve();
    await waitForOperationSettled(page, mutationOperationId);
    await expect(page.locator('#inquiry-status')).toHaveText('');
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
    const olderMutationOperationBaseline = await operationStartedCount(page, 'mutate-inquiry');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await olderMutationReachedServer.promise;
    const olderMutationOperationId = await waitForOperationStarted(page, {
      name: 'mutate-inquiry',
      after: olderMutationOperationBaseline,
    });
    await page.getByRole('button', { name: /後續詢價 B/ }).click();

    const retryKeys = [];
    await page.route('**/api/inquiries/continuation-inquiry-b', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      retryKeys.push(route.request().headers()['idempotency-key']);
      return fulfillPilotJson(route, { error: 'synthetic_retry' }, { status: 500 });
    });
    await page.getByLabel('標題').fill('B 冪等重送');
    const firstRetryOperationBaseline = await operationStartedCount(page, 'mutate-inquiry');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    const firstRetryOperationId = await waitForOperationStarted(page, {
      name: 'mutate-inquiry',
      after: firstRetryOperationBaseline,
    });
    await waitForOperationSettled(page, firstRetryOperationId);
    await expect(page.locator('#inquiry-status')).toContainText('synthetic_retry');

    releaseOlderMutation.resolve();
    await waitForOperationSettled(page, olderMutationOperationId);
    await expect(page.locator('#inquiry-status')).toContainText('synthetic_retry');
    const secondRetryOperationBaseline = await operationStartedCount(page, 'mutate-inquiry');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    const secondRetryOperationId = await waitForOperationStarted(page, {
      name: 'mutate-inquiry',
      after: secondRetryOperationBaseline,
    });
    await waitForOperationSettled(page, secondRetryOperationId);
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
    const logoutMutationOperationBaseline = await operationStartedCount(page, 'mutate-inquiry');
    await page.getByRole('button', { name: '儲存詢價' }).click();
    await logoutMutationReachedServer.promise;
    const logoutMutationOperationId = await waitForOperationStarted(page, {
      name: 'mutate-inquiry',
      after: logoutMutationOperationBaseline,
    });
    const reloaded = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '登出' }).dispatchEvent('click');
    await logoutStarted.promise;
    await expect(page.locator('#customer-status')).toHaveText('');
    await expect(page.locator('#inquiry-status')).toHaveText('');
    await expect(page.locator('#item-status')).toHaveText('');
    await expect(page.getByLabel('標題')).toHaveValue('');
    releaseLogoutMutation.resolve();
    await waitForOperationSettled(page, logoutMutationOperationId);
    await expect(page.locator('#customer-status')).toHaveText('');
    await expect(page.locator('#inquiry-status')).toHaveText('');
    await expect(page.locator('#item-status')).toHaveText('');
    await expect(page.getByLabel('標題')).toHaveValue('');
    await expect(page.locator('#customer-list')).toBeEmpty();
    await expect(page.locator('#inquiry-list')).toBeEmpty();
    await expect(page.locator('#item-list')).toBeEmpty();
    releaseLogout.resolve();
    await reloaded;
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
