import assert from 'node:assert/strict';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { openPhase2bDatabase } from '../server/database.mjs';
import { createHttpServer } from '../server/http-server.mjs';
import { createInquiryRepository } from '../server/inquiry-repository.mjs';
import { createCustomerRepository } from '../server/customer-repository.mjs';
import { createProductCategoryApi } from '../server/product-category-api.mjs';
import { createProductCategoryRepository } from '../server/product-category-repository.mjs';
import { createQuotationRepository } from '../server/quotation-repository.mjs';

const scryptAsync = promisify(scrypt);
const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';

async function createCredentials() {
  const salt = randomBytes(16);
  const hash = await scryptAsync('category-password', salt, 32);
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
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

async function login(baseUrl, username) {
  const response = await request(baseUrl, '/api/session', 'POST', { username, password: 'category-password' });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').match(/bk_dashboard_session=([^;]+)/)[1];
}

async function closeContext(context) {
  await context.server.close();
  context.db.close();
}

test('C0-A product categories - editor can create, list, rename, and deactivate with server-owned fields', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl, 'editor');
    const created = await request(context.baseUrl, '/api/product-categories', 'POST', { name: '帆布袋' }, cookie);
    assert.equal(created.status, 201);
    assert.match(created.body.productCategory.id, /^[0-9a-f-]{36}$/);
    assert.equal(created.body.productCategory.status, 'ACTIVE');
    assert.equal(created.body.productCategory.deactivated_at, null);
    assert.match(created.body.productCategory.created_at, /^\d{4}-\d{2}-\d{2}T/);

    const id = created.body.productCategory.id;
    const listed = await request(context.baseUrl, '/api/product-categories', 'GET', undefined, cookie);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.productCategories.map((category) => category.id), [id]);

    const renamed = await request(context.baseUrl, `/api/product-categories/${id}`, 'PATCH', { name: '棉帆布袋' }, cookie);
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.productCategory.id, id);
    assert.equal(renamed.body.productCategory.name, '棉帆布袋');

    const deactivated = await request(context.baseUrl, `/api/product-categories/${id}/deactivate`, 'POST', {}, cookie);
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.productCategory.status, 'INACTIVE');
    assert.match(deactivated.body.productCategory.deactivated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'GET', undefined, cookie)).body.productCategories.length, 0);
    assert.equal((await request(context.baseUrl, '/api/product-categories?status=INACTIVE&limit=1', 'GET', undefined, cookie)).body.productCategories.length, 1);
    assert.equal((await request(context.baseUrl, '/api/product-categories?status=ALL', 'GET', undefined, cookie)).body.productCategories.length, 1);
  } finally {
    await closeContext(context);
  }
});

test('C0-A product categories - viewer and anonymous are denied and body authorization spoofing is inert', async () => {
  const context = await setup();
  try {
    const viewer = await login(context.baseUrl, 'viewer');
    const attempts = [
      request(context.baseUrl, '/api/product-categories', 'GET', undefined, viewer),
      request(context.baseUrl, '/api/product-categories', 'POST', { name: 'nope', role: 'editor', authorized: true, actorId: 'editor' }, viewer),
      request(context.baseUrl, '/api/product-categories/missing', 'PATCH', { name: 'nope' }, viewer),
      request(context.baseUrl, '/api/product-categories/missing/deactivate', 'POST', {}, viewer),
    ];
    for (const response of await Promise.all(attempts)) {
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { error: 'Forbidden' });
    }
    assert.equal((await request(context.baseUrl, '/api/product-categories')).status, 401);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { name: 'nope' })).status, 401);
    assert.equal(context.db.prepare('SELECT COUNT(*) AS count FROM product_categories').get().count, 0);
  } finally {
    await closeContext(context);
  }
});

test('C0-A product categories - denial occurs before body parsing and repository invocation', async () => {
  let parses = 0;
  let repositoryCalls = 0;
  const categories = new Proxy({}, {
    get() {
      return () => { repositoryCalls += 1; throw new Error('repository must not be called'); };
    },
  });
  const api = createProductCategoryApi({
    categories,
    getSession: () => ({ actorId: 'viewer-one', role: 'viewer', expiresAt: Date.now() + 1000 }),
    parseJsonBody: async () => { parses += 1; return { name: 'forbidden' }; },
  });
  const response = {
    writeHead(status) { this.status = status; },
    end(body) { this.body = JSON.parse(body); },
  };
  await api.handle({ method: 'POST', url: '/api/product-categories' }, response);
  assert.equal(response.status, 403);
  assert.equal(parses, 0);
  assert.equal(repositoryCalls, 0);
});

test('C0-A product categories - strict input, uniqueness, unknown IDs, limits, and no DELETE fail safely', async () => {
  const context = await setup();
  try {
    const cookie = await login(context.baseUrl, 'editor');
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { id: 'caller-id', name: 'bad' }, cookie)).status, 400);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { name: ' valid? ' }, cookie)).status, 400);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { name: '分類' }, cookie)).status, 201);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { name: '分類' }, cookie)).status, 409);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { name: 'Canvas' }, cookie)).status, 201);
    assert.equal((await request(context.baseUrl, '/api/product-categories', 'POST', { name: 'canvas' }, cookie)).status, 409);
    assert.equal((await request(context.baseUrl, '/api/product-categories/missing', 'PATCH', { name: 'x' }, cookie)).status, 404);
    assert.equal((await request(context.baseUrl, '/api/product-categories/missing/deactivate', 'POST', {}, cookie)).status, 404);
    assert.equal((await request(context.baseUrl, '/api/product-categories?limit=101', 'GET', undefined, cookie)).status, 400);
    assert.equal((await request(context.baseUrl, '/api/product-categories?status=UNKNOWN', 'GET', undefined, cookie)).status, 400);
    assert.equal((await request(context.baseUrl, '/api/product-categories?extra=1', 'GET', undefined, cookie)).status, 400);
    assert.equal((await request(context.baseUrl, '/api/product-categories/missing', 'DELETE', undefined, cookie)).status, 404);
  } finally {
    await closeContext(context);
  }
});

test('C0-A product categories - deactivate is idempotent and historical quotation links are protected', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const customers = createCustomerRepository(db);
    const inquiries = createInquiryRepository(db);
    const categories = createProductCategoryRepository(db);
    const quotations = createQuotationRepository(db);
    customers.create({ id: 'customer-one', displayName: '客戶', createdAt: NOW });
    inquiries.create({ id: 'inquiry-one', customerId: 'customer-one', title: '詢價', createdAt: NOW, updatedAt: NOW });
    inquiries.addItem({ id: 'item-one', inquiryId: 'inquiry-one', description: '帆布袋', quantity: 1, createdAt: NOW });
    quotations.createVersion({ id: 'quote-one', inquiryId: 'inquiry-one', versionNumber: 1, currency: 'TWD', createdAt: NOW });
    categories.create({ id: 'category-one', name: '帆布袋', createdAt: NOW });

    const categorized = quotations.addItem({
      id: 'quote-item-one', quotationVersionId: 'quote-one', inquiryItemId: 'item-one',
      productCategoryId: 'category-one', description: '歷史品項', quantity: 1,
      customerUnitPriceMinor: 100, currency: 'TWD', createdAt: NOW,
    });
    assert.equal(categorized.product_category_id, 'category-one');
    const firstInactive = categories.deactivate('category-one', { updatedAt: LATER });
    const secondInactive = categories.deactivate('category-one', { updatedAt: '2026-01-03T00:00:00.000Z' });
    assert.equal(secondInactive.deactivated_at, firstInactive.deactivated_at);
    assert.throws(() => quotations.addItem({
      id: 'quote-item-two', quotationVersionId: 'quote-one', inquiryItemId: 'item-one',
      productCategoryId: 'category-one', description: 'new', quantity: 1,
      customerUnitPriceMinor: 100, currency: 'TWD', createdAt: NOW,
    }), /inactive/i);
    assert.throws(() => db.prepare('DELETE FROM product_categories WHERE id = ?').run('category-one'), /FOREIGN KEY|constraint/i);
    assert.equal(quotations.listItems('quote-one')[0].product_category_id, 'category-one');
    assert.equal(categories.delete, undefined);
  } finally {
    db.close();
  }
});

test('C0-A product categories - NULL is the only default signal and description never triggers category lookup', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const customers = createCustomerRepository(db);
    const inquiries = createInquiryRepository(db);
    const categories = createProductCategoryRepository(db);
    const quotations = createQuotationRepository(db);
    customers.create({ id: 'customer-one', displayName: '客戶', createdAt: NOW });
    inquiries.create({ id: 'inquiry-one', customerId: 'customer-one', title: '詢價', createdAt: NOW, updatedAt: NOW });
    inquiries.addItem({ id: 'item-one', inquiryId: 'inquiry-one', description: '預設分類名稱', quantity: 1, createdAt: NOW });
    quotations.createVersion({ id: 'quote-one', inquiryId: 'inquiry-one', versionNumber: 1, currency: 'TWD', createdAt: NOW });
    categories.create({ id: 'category-one', name: '預設分類名稱', createdAt: NOW });
    const item = quotations.addItem({
      id: 'quote-item-one', quotationVersionId: 'quote-one', inquiryItemId: 'item-one',
      description: '預設分類名稱', quantity: 1, customerUnitPriceMinor: 100, currency: 'TWD', createdAt: NOW,
    });
    assert.equal(item.product_category_id, null);
    assert.throws(() => quotations.addItem({
      id: 'quote-item-two', quotationVersionId: 'quote-one', inquiryItemId: 'item-one',
      productCategoryId: 'missing-category', description: 'x', quantity: 1,
      customerUnitPriceMinor: 100, currency: 'TWD', createdAt: NOW,
    }), /Unknown product category/i);
  } finally {
    db.close();
  }
});
