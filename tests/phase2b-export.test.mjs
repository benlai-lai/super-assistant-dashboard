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
  inquiries.create({ id: 'inquiry-one', customerId: 'customer-one', title: '測試詢價', status: 'active', createdAt: NOW, updatedAt: NOW });
  inquiries.addItem({ id: 'item-one', inquiryId: 'inquiry-one', description: '托特包', quantity: 100, notes: '客戶可見需求', createdAt: NOW });
  quotations.createVersion({ id: 'quote-one', inquiryId: 'inquiry-one', versionNumber: 1, currency: 'TWD', customerTotalMinor: 500000, createdAt: NOW });
  quotations.addOption({ id: 'option-one', quotationVersionId: 'quote-one', label: '標準方案', customerPriceMinor: 500000, currency: 'TWD', createdAt: NOW });
  quotations.addItem({ id: 'quote-item-one', quotationVersionId: 'quote-one', inquiryItemId: 'item-one', description: '托特包報價', quantity: 100, customerUnitPriceMinor: 5000, currency: 'TWD', createdAt: NOW });
  costs.createEstimate({ id: 'cost-one', inquiryId: 'inquiry-one', inquiryItemId: 'item-one', supplierLabel: '內部供應商摘要', estimatedCostMinor: 300000, currency: 'TWD', internalNotes: 'sensitive margin note', createdAt: NOW });
  attachments.add({ id: 'attachment-one', inquiryId: 'inquiry-one', entityType: 'inquiry', entityId: 'inquiry-one', title: '雲端規格連結', url: 'https://example.com/spec', visibility: 'internal', createdAt: NOW });

  return db;
}

test('structured JSON export contains one inquiry bundle and schemaVersion', () => {
  const db = seedExportDatabase();
  try {
    const exported = createExportService(db).exportInquiry('inquiry-one');
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

test('export is read-only and does not mutate the database', () => {
  const db = seedExportDatabase();
  try {
    const before = countRows(db);
    const exported = createExportService(db).exportInquiry('inquiry-one');
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
    const exported = createExportService(db).exportInquiry('inquiry-one');
    const serialized = JSON.stringify(exported);
    assert.equal(serialized.includes('physicalPath'), false);
    assert.equal(serialized.includes('C:\\'), false);
    assert.equal(serialized.includes('/Users/'), false);
    assert.equal(serialized.includes('sensitive margin note'), false);
    assert.equal(serialized.includes('internal_notes'), false);
    assert.equal(serialized.includes('supplier_label'), false);
  } finally {
    db.close();
  }
});

test('unknown inquiry export fails closed', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    assert.throws(() => createExportService(db).exportInquiry('missing-inquiry'), /Unknown inquiry/);
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
