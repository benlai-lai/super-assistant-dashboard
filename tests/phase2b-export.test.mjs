import assert from 'node:assert/strict';
import test from 'node:test';
import { openPhase2bDatabase } from '../server/database.mjs';
import { createAttachmentRepository } from '../server/attachment-repository.mjs';
import { createCostRepository } from '../server/cost-repository.mjs';
import { createCustomerRepository } from '../server/customer-repository.mjs';
import { createExportService } from '../server/export-service.mjs';
import { createInquiryRepository } from '../server/inquiry-repository.mjs';
import { createQuotationRepository } from '../server/quotation-repository.mjs';

const NOW = '2026-01-01T00:00:00.000Z';
const ACTOR = { actorId: 'actor-one', role: 'export-operator' };
const DENIED_PATTERN = /Inquiry export is not available/;

function allowOnly(allowedInquiryIds) {
  const allowed = new Set(allowedInquiryIds);
  return {
    canExportInquiry({ actorContext, inquiryId }) {
      assert.equal(actorContext.actorId, ACTOR.actorId);
      return { allow: allowed.has(inquiryId) };
    },
  };
}

function createAuthorizedExportService(db, allowedInquiryIds = ['inquiry-one']) {
  return createExportService(db, { accessPolicy: allowOnly(allowedInquiryIds) });
}

function countRows(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
}

function seedExportDatabase() {
  const db = openPhase2bDatabase(':memory:');
  const customers = createCustomerRepository(db);
  const inquiries = createInquiryRepository(db);
  const quotations = createQuotationRepository(db);
  const costs = createCostRepository(db);
  const attachments = createAttachmentRepository(db);

  customers.create({ id: 'customer-one', displayName: '客戶一', contactName: '窗口', email: 'buyer@example.com', phone: '0912345678', createdAt: NOW });
  customers.create({ id: 'customer-two', displayName: '客戶二', contactName: '第二窗口', email: 'blocked@example.com', phone: '0987654321', createdAt: NOW });
  inquiries.create({ id: 'inquiry-one', customerId: 'customer-one', title: '測試詢價', status: 'active', createdAt: NOW, updatedAt: NOW });
  inquiries.create({ id: 'inquiry-two', customerId: 'customer-two', title: '禁止匯出詢價', status: 'active', createdAt: NOW, updatedAt: NOW });
  inquiries.addItem({ id: 'item-one', inquiryId: 'inquiry-one', description: '托特包', quantity: 100, notes: '客戶可見需求', createdAt: NOW });
  inquiries.addItem({ id: 'item-two', inquiryId: 'inquiry-two', description: '不可洩漏品項', quantity: 1, notes: '不可洩漏需求', createdAt: NOW });
  quotations.createVersion({ id: 'quote-one', inquiryId: 'inquiry-one', versionNumber: 1, currency: 'TWD', customerTotalMinor: 500000, createdAt: NOW });
  quotations.createVersion({ id: 'quote-two', inquiryId: 'inquiry-two', versionNumber: 1, currency: 'TWD', customerTotalMinor: 999999, createdAt: NOW });
  quotations.addOption({ id: 'option-one', quotationVersionId: 'quote-one', label: '標準方案', customerPriceMinor: 500000, currency: 'TWD', createdAt: NOW });
  quotations.addItem({ id: 'quote-item-one', quotationVersionId: 'quote-one', inquiryItemId: 'item-one', description: '托特包報價', quantity: 100, customerUnitPriceMinor: 5000, currency: 'TWD', createdAt: NOW });
  costs.createEstimate({ id: 'cost-one', inquiryId: 'inquiry-one', inquiryItemId: 'item-one', supplierLabel: '內部供應商摘要', estimatedCostMinor: 300000, currency: 'TWD', internalNotes: 'sensitive margin note', createdAt: NOW });
  costs.createEstimate({ id: 'cost-two', inquiryId: 'inquiry-two', inquiryItemId: 'item-two', supplierLabel: '不可洩漏供應商', estimatedCostMinor: 1, currency: 'TWD', internalNotes: 'blocked sensitive note', createdAt: NOW });
  attachments.add({ id: 'attachment-one', inquiryId: 'inquiry-one', entityType: 'inquiry', entityId: 'inquiry-one', title: '雲端規格連結', url: 'https://example.com/spec', visibility: 'internal', createdAt: NOW });
  attachments.add({ id: 'attachment-two', inquiryId: 'inquiry-two', entityType: 'inquiry', entityId: 'inquiry-two', title: '不可洩漏連結', url: 'https://example.com/blocked', visibility: 'internal', createdAt: NOW });

  return db;
}

function getThrown(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new assert.AssertionError({ message: 'Expected callback to throw' });
}

function captureDenied(error) {
  assert.match(error.message, DENIED_PATTERN);
  for (const key of [
    'cause',
    'inquiry',
    'inquiryId',
    'exists',
    'customer',
    'items',
    'quotationVersions',
    'attachments',
    'costSummary',
    'metadata',
  ]) {
    assert.equal(key in error, false, `denial must not expose ${key}`);
  }
}

function assertSamePublicDenial(actual, expected) {
  assert.equal(actual.constructor, expected.constructor);
  assert.equal(actual.name, expected.name);
  assert.equal(actual.message, expected.message);
  assert.equal(Object.hasOwn(actual, 'code'), Object.hasOwn(expected, 'code'));
  if (Object.hasOwn(actual, 'code')) assert.equal(actual.code, expected.code);
  assert.deepEqual(
    Object.fromEntries(Object.keys(actual).sort().map((key) => [key, actual[key]])),
    Object.fromEntries(Object.keys(expected).sort().map((key) => [key, expected[key]])),
  );
}

function assertDeniedReadOnly(db, callback, expectedError = null) {
  const before = countRows(db);
  const error = getThrown(callback);
  captureDenied(error);
  if (expectedError) assertSamePublicDenial(error, expectedError);
  assert.deepEqual(countRows(db), before);
  return error;
}

test('authorized actor can export existing inquiry with schemaVersion', () => {
  const db = seedExportDatabase();
  try {
    const exported = createAuthorizedExportService(db).exportInquiry('inquiry-one', ACTOR);
    assert.equal(exported.schemaVersion, 'phase2b.inquiry-export.v1');
    assert.equal(exported.inquiry.id, 'inquiry-one');
    assert.equal(exported.customer.displayName, '客戶一');
    assert.equal(exported.items.length, 1);
    assert.equal(exported.quotationVersions.length, 1);
    assert.equal(exported.quotationVersions[0].items[0].customerUnitPriceMinor, 5000);
    assert.deepEqual(exported.costSummary, [{ currency: 'TWD', estimatedCostMinor: 300000 }]);
    assert.equal(exported.attachments[0].url, 'https://example.com/spec');
  } finally {
    db.close();
  }
});

test('unauthorized actor cannot export existing inquiry and receives no metadata', () => {
  const db = seedExportDatabase();
  try {
    assertDeniedReadOnly(db, () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR));
  } finally {
    db.close();
  }
});

test('unknown inquiry uses the same generic denial as unauthorized inquiry', () => {
  const db = seedExportDatabase();
  try {
    const unauthorizedError = assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR),
    );
    assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db, ['missing-inquiry']).exportInquiry('missing-inquiry', ACTOR),
      unauthorizedError,
    );
  } finally {
    db.close();
  }
});

test('missing actor context is rejected before export reads metadata', () => {
  const db = seedExportDatabase();
  try {
    const unauthorizedError = assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR),
    );
    assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-one'),
      unauthorizedError,
    );
  } finally {
    db.close();
  }
});

test('invalid actor context and forged boolean authorization are rejected', () => {
  const db = seedExportDatabase();
  try {
    const unauthorizedError = assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR),
    );
    assertDeniedReadOnly(db, () => createAuthorizedExportService(db).exportInquiry('inquiry-one', { actorId: '', role: 'export-operator' }), unauthorizedError);
    assertDeniedReadOnly(db, () => createAuthorizedExportService(db).exportInquiry('inquiry-one', { actorId: 'actor-one', authorized: true }), unauthorizedError);
    assertDeniedReadOnly(db, () => createAuthorizedExportService(db).exportInquiry('inquiry-one', { actorId: 'actor-one', isAdmin: true }), unauthorizedError);
  } finally {
    db.close();
  }
});

test('missing access policy is rejected', () => {
  const db = seedExportDatabase();
  try {
    const unauthorizedError = assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR),
    );
    assertDeniedReadOnly(db, () => createExportService(db).exportInquiry('inquiry-one', ACTOR), unauthorizedError);
  } finally {
    db.close();
  }
});

test('policy exception fails closed', () => {
  const db = seedExportDatabase();
  try {
    const unauthorizedError = assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR),
    );
    const service = createExportService(db, {
      accessPolicy: {
        canExportInquiry() {
          throw new Error('policy backend unavailable');
        },
      },
    });
    assertDeniedReadOnly(db, () => service.exportInquiry('inquiry-one', ACTOR), unauthorizedError);
  } finally {
    db.close();
  }
});

test('invalid policy result fails closed', () => {
  const db = seedExportDatabase();
  try {
    const unauthorizedError = assertDeniedReadOnly(
      db,
      () => createAuthorizedExportService(db).exportInquiry('inquiry-two', ACTOR),
    );
    for (const result of [true, { allow: false }, { allowed: true }, null, undefined]) {
      const service = createExportService(db, {
        accessPolicy: {
          canExportInquiry() {
            return result;
          },
        },
      });
      assertDeniedReadOnly(db, () => service.exportInquiry('inquiry-one', ACTOR), unauthorizedError);
    }
  } finally {
    db.close();
  }
});

test('policy must explicitly allow before any database read', () => {
  let databaseReads = 0;
  const db = {
    prepare() {
      databaseReads += 1;
      throw new Error('database must not be read before policy allow');
    },
  };
  const service = createExportService(db, {
    accessPolicy: {
      canExportInquiry() {
        return { allow: false };
      },
    },
  });

  captureDenied(getThrown(() => service.exportInquiry('inquiry-one', ACTOR)));
  assert.equal(databaseReads, 0);
});

test('authorized export is read-only and does not mutate the database', () => {
  const db = seedExportDatabase();
  try {
    const before = countRows(db);
    const exported = createAuthorizedExportService(db).exportInquiry('inquiry-one', ACTOR);
    const after = countRows(db);
    assert.deepEqual(after, before);
    assert.equal(exported.schemaVersion, 'phase2b.inquiry-export.v1');
  } finally {
    db.close();
  }
});

test('export excludes physical paths and internal sensitive fields', () => {
  const db = seedExportDatabase();
  try {
    const exported = createAuthorizedExportService(db).exportInquiry('inquiry-one', ACTOR);
    const serialized = JSON.stringify(exported);
    assert.equal(serialized.includes('physicalPath'), false);
    assert.equal(serialized.includes('C:\\'), false);
    assert.equal(serialized.includes('/Users/'), false);
    assert.equal(serialized.includes('sensitive margin note'), false);
    assert.equal(serialized.includes('internal_notes'), false);
    assert.equal(serialized.includes('supplier_label'), false);
    assert.equal(serialized.includes('blocked sensitive note'), false);
    assert.equal(serialized.includes('不可洩漏'), false);
  } finally {
    db.close();
  }
});

test('server-side foundation does not reference V1 or V2 localStorage keys', async () => {
  const modules = [
    '../server/config.mjs',
    '../server/database.mjs',
    '../server/customer-repository.mjs',
    '../server/inquiry-repository.mjs',
    '../server/quotation-repository.mjs',
    '../server/cost-repository.mjs',
    '../server/attachment-repository.mjs',
    '../server/audit-repository.mjs',
    '../server/export-service.mjs',
  ];
  for (const modulePath of modules) {
    const text = await import('node:fs/promises').then((fs) => fs.readFile(new URL(modulePath, import.meta.url), 'utf8'));
    assert.equal(text.includes('superAssistantDashboardData'), false);
    assert.equal(text.includes('superAssistantDashboardV2State'), false);
    assert.equal(text.includes('localStorage'), false);
  }
});


