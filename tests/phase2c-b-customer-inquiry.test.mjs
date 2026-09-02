import assert from 'node:assert/strict';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { openPhase2bDatabase } from '../server/database.mjs';
import { createHttpServer } from '../server/http-server.mjs';

const scryptAsync = promisify(scrypt);
const NOW = '2026-01-01T00:00:00.000Z';

async function createCredentials() {
  const salt = randomBytes(16);
  const hash = await scryptAsync('editor-password', salt, 32);
  return {
    editor: { username: 'editor', passwordHash: hash.toString('hex'), salt: salt.toString('hex'), role: 'editor' },
    viewer: { username: 'viewer', passwordHash: hash.toString('hex'), salt: salt.toString('hex'), role: 'viewer' },
  };
}

async function setup() {
  const db = openPhase2bDatabase(':memory:');
  const server = createHttpServer({ port: 0, host: '127.0.0.1', credentials: await createCredentials(), db });
  await server.listen();
  return { db, server, baseUrl: `http://127.0.0.1:${server.server.address().port}` };
}

async function request(baseUrl, path, method = 'GET', body, cookie, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Host: `127.0.0.1:${new URL(baseUrl).port}`,
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: `bk_dashboard_session=${cookie}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers, cookie };
}

async function login(baseUrl, username = 'editor') {
  const response = await request(baseUrl, '/api/session', 'POST', { username, password: 'editor-password' });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').match(/bk_dashboard_session=([^;]+)/)[1];
}

function closeContext(context) {
  return Promise.all([context.server.close(), Promise.resolve(context.db.close())]);
}

test('Phase 2C-B - editor can create/read/list/update customers, inquiries, and items', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl);
    const customerCreate = await request(context.baseUrl, '/api/customers', 'POST', { displayName: '客戶一', email: 'one@example.com' }, cookie);
    assert.equal(customerCreate.status, 201);
    const customer = customerCreate.body.customer;
    assert.match(customer.id, /^[0-9a-f-]{36}$/);
    assert.match(customer.created_at, /^\d{4}-\d{2}-\d{2}T/);

    const customerRead = await request(context.baseUrl, `/api/customers/${customer.id}`, 'GET', undefined, cookie);
    assert.equal(customerRead.body.customer.display_name, '客戶一');
    const customerUpdate = await request(context.baseUrl, `/api/customers/${customer.id}`, 'PATCH', { phone: '0900000000' }, cookie);
    assert.equal(customerUpdate.body.customer.phone, '0900000000');
    const customerList = await request(context.baseUrl, '/api/customers', 'GET', undefined, cookie);
    assert.equal(customerList.body.customers.length, 1);

    const inquiryCreate = await request(context.baseUrl, '/api/inquiries', 'POST', { customerId: customer.id, title: '詢價一' }, cookie);
    assert.equal(inquiryCreate.status, 201);
    const inquiry = inquiryCreate.body.inquiry;
    assert.match(inquiry.id, /^[0-9a-f-]{36}$/);
    assert.equal(inquiry.status, 'draft');
    const inquiryUpdate = await request(context.baseUrl, `/api/inquiries/${inquiry.id}`, 'PATCH', { status: 'active' }, cookie);
    assert.equal(inquiryUpdate.body.inquiry.status, 'active');
    assert.equal((await request(context.baseUrl, '/api/inquiries', 'GET', undefined, cookie)).body.inquiries.length, 1);

    const itemCreate = await request(context.baseUrl, `/api/inquiries/${inquiry.id}/items`, 'POST', { description: '品項一', quantity: 2 }, cookie);
    assert.equal(itemCreate.status, 201);
    const item = itemCreate.body.item;
    const itemUpdate = await request(context.baseUrl, `/api/inquiries/${inquiry.id}/items/${item.id}`, 'PATCH', { quantity: 3 }, cookie);
    assert.equal(itemUpdate.body.item.quantity, 3);
    assert.equal((await request(context.baseUrl, `/api/inquiries/${inquiry.id}/items`, 'GET', undefined, cookie)).body.items.length, 1);
  } finally {
    await closeContext(context);
  }
});

test('Phase 2C-B - server owns IDs and timestamps and rejects unknown fields', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl);
    const response = await request(context.baseUrl, '/api/customers', 'POST', { id: 'caller-id', createdAt: NOW, displayName: 'bad' }, cookie);
    assert.equal(response.status, 400);
    const valid = await request(context.baseUrl, '/api/customers', 'POST', { displayName: 'good' }, cookie);
    assert.notEqual(valid.body.customer.id, 'caller-id');
    const inquiry = await request(context.baseUrl, '/api/inquiries', 'POST', { customerId: valid.body.customer.id, title: 'q', updatedAt: NOW }, cookie);
    assert.equal(inquiry.status, 400);
    const badPatch = await request(context.baseUrl, `/api/customers/${valid.body.customer.id}`, 'PATCH', { id: 'other' }, cookie);
    assert.equal(badPatch.status, 400);
  } finally {
    await closeContext(context);
  }
});

test('Phase 2C-B - viewer reads but every write is denied before repository lookup', async () => {
  const context = await setup();
  try {
    const viewerCookie = await login(context.baseUrl, 'viewer');
    const response = await request(context.baseUrl, '/api/customers/unknown', 'PATCH', { displayName: 'nope' }, viewerCookie, { role: 'editor', authorized: 'true', isAdmin: 'true' });
    assert.equal(response.status, 403);
    const create = await request(context.baseUrl, '/api/customers', 'POST', { displayName: 'nope', role: 'editor' }, viewerCookie);
    assert.equal(create.status, 403);
  } finally {
    await closeContext(context);
  }
});

test('Phase 2C-B - unknown resources use generic responses and invalid sessions return 401', async () => {
  const context = await setup();
  try {
    const editorCookie = await login(context.baseUrl);
    const unknown = await request(context.baseUrl, '/api/customers/unknown', 'GET', undefined, editorCookie);
    const forged = await request(context.baseUrl, '/api/customers/unknown', 'GET', undefined, 'forged-token');
    assert.equal(unknown.status, 404);
    assert.deepEqual(forged.body, { error: 'Unauthorized' });
    assert.equal(forged.status, 401);
    const missing = await request(context.baseUrl, '/api/customers/unknown', 'GET');
    assert.equal(missing.status, 401);
  } finally {
    await closeContext(context);
  }
});

test('Phase 2C-B - list limits and stable ordering are bounded', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl);
    for (let index = 0; index < 101; index++) {
      const response = await request(context.baseUrl, '/api/customers', 'POST', { displayName: `customer-${String(index).padStart(3, '0')}` }, cookie);
      assert.equal(response.status, 201);
    }
    const defaultList = await request(context.baseUrl, '/api/customers', 'GET', undefined, cookie);
    assert.equal(defaultList.body.customers.length, 50);
    assert.equal(defaultList.body.customers[0].display_name, 'customer-000');
    assert.equal((await request(context.baseUrl, '/api/customers?limit=100', 'GET', undefined, cookie)).body.customers.length, 100);
    assert.equal((await request(context.baseUrl, '/api/customers?limit=101', 'GET', undefined, cookie)).status, 400);
  } finally {
    await closeContext(context);
  }
});

test('Phase 2C-B - body and field validation rejects malformed business input', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl);
    const invalidQuantity = await request(context.baseUrl, '/api/inquiries/missing/items', 'POST', { description: 'x', quantity: 0 }, cookie);
    assert.equal(invalidQuantity.status, 400);
    const invalidStatus = await request(context.baseUrl, '/api/inquiries', 'POST', { customerId: 'missing', title: 'x', status: 'unknown' }, cookie);
    assert.equal(invalidStatus.status, 400);
    const invalidContentType = await request(context.baseUrl, '/api/customers', 'POST', undefined, cookie, { 'Content-Type': 'text/plain' });
    assert.equal(invalidContentType.status, 415);
    const malformed = await fetch(`${context.baseUrl}/api/customers`, { method: 'POST', headers: { Host: '127.0.0.1', 'Content-Type': 'application/json', Cookie: `bk_dashboard_session=${cookie}` }, body: '{' });
    assert.equal(malformed.status, 400);
  } finally {
    await closeContext(context);
  }
});

test('Phase 2C-B - foreign keys, duplicate IDs, and cross-inquiry items are rejected transactionally', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl);
    const unknownCustomer = await request(context.baseUrl, '/api/inquiries', 'POST', { customerId: 'missing', title: 'x' }, cookie);
    assert.equal(unknownCustomer.status, 404);
    const customer = await request(context.baseUrl, '/api/customers', 'POST', { displayName: 'c' }, cookie);
    const firstInquiry = await request(context.baseUrl, '/api/inquiries', 'POST', { customerId: customer.body.customer.id, title: 'one' }, cookie);
    const secondInquiry = await request(context.baseUrl, '/api/inquiries', 'POST', { customerId: customer.body.customer.id, title: 'two' }, cookie);
    const item = await request(context.baseUrl, `/api/inquiries/${firstInquiry.body.inquiry.id}/items`, 'POST', { description: 'item', quantity: 1 }, cookie);
    const cross = await request(context.baseUrl, `/api/inquiries/${secondInquiry.body.inquiry.id}/items/${item.body.item.id}`, 'PATCH', { quantity: 9 }, cookie);
    assert.equal(cross.status, 404);
    assert.equal((await request(context.baseUrl, `/api/inquiries/${firstInquiry.body.inquiry.id}/items`, 'GET', undefined, cookie)).body.items[0].quantity, 1);
  } finally {
    await closeContext(context);
  }
});