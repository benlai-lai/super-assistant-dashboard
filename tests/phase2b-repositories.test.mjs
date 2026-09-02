import assert from 'node:assert/strict';
import test from 'node:test';
import { openPhase2bDatabase, runInTransaction } from '../server/database.mjs';
import { createAttachmentRepository } from '../server/attachment-repository.mjs';
import { createAuditRepository } from '../server/audit-repository.mjs';
import { createCostRepository } from '../server/cost-repository.mjs';
import { createCustomerRepository } from '../server/customer-repository.mjs';
import { createInquiryRepository } from '../server/inquiry-repository.mjs';
import { createQuotationRepository } from '../server/quotation-repository.mjs';

const NOW = '2026-01-01T00:00:00.000Z';

function createRepos() {
  const db = openPhase2bDatabase(':memory:');
  return {
    db,
    customers: createCustomerRepository(db),
    inquiries: createInquiryRepository(db),
    quotations: createQuotationRepository(db),
    costs: createCostRepository(db),
    attachments: createAttachmentRepository(db),
    audit: createAuditRepository(db),
  };
}

function seed(repos) {
  repos.customers.create({ id: 'customer-one', displayName: '客戶一', createdAt: NOW });
  repos.customers.create({ id: 'customer-two', displayName: '客戶二', createdAt: NOW });
  repos.inquiries.create({ id: 'inquiry-one', customerId: 'customer-one', title: '詢價一', status: 'draft', createdAt: NOW, updatedAt: NOW });
  repos.inquiries.create({ id: 'inquiry-two', customerId: 'customer-two', title: '詢價二', status: 'draft', createdAt: NOW, updatedAt: NOW });
  repos.inquiries.addItem({ id: 'item-one', inquiryId: 'inquiry-one', description: '品項一', quantity: 1, createdAt: NOW });
  repos.inquiries.addItem({ id: 'item-two', inquiryId: 'inquiry-two', description: '品項二', quantity: 1, createdAt: NOW });
  repos.quotations.createVersion({ id: 'quote-one', inquiryId: 'inquiry-one', versionNumber: 1, currency: 'TWD', customerTotalMinor: 10000, createdAt: NOW });
  repos.quotations.createVersion({ id: 'quote-two', inquiryId: 'inquiry-two', versionNumber: 1, currency: 'TWD', customerTotalMinor: 20000, createdAt: NOW });
  repos.quotations.addItem({ id: 'quote-item-one', quotationVersionId: 'quote-one', inquiryItemId: 'item-one', description: '客戶報價品項', quantity: 1, customerUnitPriceMinor: 10000, currency: 'TWD', createdAt: NOW });
}

test('repositories create customer, inquiry, quotation, cost, attachment metadata, and audit records', () => {
  const repos = createRepos();
  try {
    seed(repos);
    const cost = repos.costs.createEstimate({ id: 'cost-one', inquiryId: 'inquiry-one', inquiryItemId: 'item-one', supplierLabel: '供應商摘要', estimatedCostMinor: 7000, currency: 'TWD', internalNotes: 'internal only', createdAt: NOW });
    repos.costs.allocate({ id: 'allocation-one', costEstimateId: cost.id, quotationItemId: 'quote-item-one', allocatedCostMinor: 7000, currency: 'TWD', createdAt: NOW });
    const attachment = repos.attachments.add({ id: 'attachment-one', inquiryId: 'inquiry-one', entityType: 'inquiry', entityId: 'inquiry-one', title: '外部連結', url: 'https://example.com/spec', visibility: 'internal', createdAt: NOW });
    const audit = repos.audit.log({ id: 'audit-one', entityType: 'inquiry', entityId: 'inquiry-one', action: 'created', payload: { ok: true }, createdAt: NOW });

    assert.equal(cost.estimated_cost_minor, 7000);
    assert.equal(attachment.url, 'https://example.com/spec');
    assert.equal(audit.action, 'created');
  } finally {
    repos.db.close();
  }
});

test('transaction rollback leaves state unchanged after failure', () => {
  const repos = createRepos();
  try {
    repos.customers.create({ id: 'customer-one', displayName: '客戶一', createdAt: NOW });
    assert.throws(() => {
      runInTransaction(repos.db, () => {
        repos.db.prepare(`INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('inquiry-one', 'customer-one', '詢價一', 'draft', NOW, NOW);
        repos.db.prepare(`INSERT INTO inquiries (id, customer_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('inquiry-two', 'missing-customer', '詢價二', 'draft', NOW, NOW);
      });
    }, /FOREIGN KEY|constraint/i);
    assert.equal(repos.db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 0);
  } finally {
    repos.db.close();
  }
});

test('published quotation versions are immutable', () => {
  const repos = createRepos();
  try {
    seed(repos);
    repos.quotations.publishVersion('quote-one', NOW);
    assert.throws(() => repos.quotations.updateDraftTotal('quote-one', 12000), /immutable/i);
    assert.throws(() => repos.quotations.addItem({ id: 'quote-item-two', quotationVersionId: 'quote-one', inquiryItemId: 'item-one', description: 'new', quantity: 1, customerUnitPriceMinor: 12000, currency: 'TWD', createdAt: NOW }), /immutable/i);
  } finally {
    repos.db.close();
  }
});

test('invalid and cross-inquiry relationships are rejected', () => {
  const repos = createRepos();
  try {
    seed(repos);
    assert.throws(() => repos.quotations.addItem({ id: 'bad-quote-item', quotationVersionId: 'quote-one', inquiryItemId: 'item-two', description: 'cross', quantity: 1, customerUnitPriceMinor: 100, currency: 'TWD', createdAt: NOW }), /does not belong/i);
    const crossCost = repos.costs.createEstimate({ id: 'cost-two', inquiryId: 'inquiry-two', inquiryItemId: 'item-two', estimatedCostMinor: 50, currency: 'TWD', createdAt: NOW });
    assert.throws(() => repos.costs.allocate({ id: 'bad-allocation', costEstimateId: crossCost.id, quotationItemId: 'quote-item-one', allocatedCostMinor: 50, currency: 'TWD', createdAt: NOW }), /cross inquiry/i);
    assert.throws(() => repos.attachments.add({ id: 'bad-attachment', inquiryId: 'inquiry-one', entityType: 'inquiry_item', entityId: 'item-two', title: 'bad', url: 'https://example.com', visibility: 'internal', createdAt: NOW }), /does not belong/i);
  } finally {
    repos.db.close();
  }
});

test('SQL injection text is parameter-bound and cannot alter schema', () => {
  const repos = createRepos();
  try {
    const hostileName = "Robert'); DROP TABLE customers;--";
    repos.customers.create({ id: 'customer-one', displayName: hostileName, createdAt: NOW });
    assert.equal(repos.customers.get('customer-one').display_name, hostileName);
    assert.equal(repos.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'customers'").get().count, 1);
    assert.throws(() => repos.customers.get("bad'; DROP TABLE customers;--"), /invalid/);
  } finally {
    repos.db.close();
  }
});

test('attachment metadata rejects local physical paths', () => {
  const repos = createRepos();
  try {
    seed(repos);
    assert.throws(() => repos.attachments.add({ id: 'local-path', inquiryId: 'inquiry-one', entityType: 'inquiry', entityId: 'inquiry-one', title: 'local', url: 'file:///C:/Users/customer/spec.pdf', visibility: 'internal', createdAt: NOW }), /local file path/i);
    assert.throws(() => repos.attachments.add({ id: 'windows-path', inquiryId: 'inquiry-one', entityType: 'inquiry', entityId: 'inquiry-one', title: 'local', url: 'C:\\Users\\customer\\spec.pdf', visibility: 'internal', createdAt: NOW }), /invalid|local file path/i);
  } finally {
    repos.db.close();
  }
});

