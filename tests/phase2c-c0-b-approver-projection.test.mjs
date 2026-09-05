import assert from 'node:assert/strict';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { checkPermission, getPolicyMatrix, validateRoleFromSession } from '../server/access-policy.mjs';
import {
  ApprovalDeniedError,
  createApprovalRepository,
} from '../server/approval-repository.mjs';
import { createCostRepository } from '../server/cost-repository.mjs';
import { getSchemaVersion, openPhase2bDatabase } from '../server/database.mjs';
import { createCustomerRepository } from '../server/customer-repository.mjs';
import { createHttpServer } from '../server/http-server.mjs';
import { createInquiryRepository } from '../server/inquiry-repository.mjs';
import { migrateDatabase } from '../server/migrations/index.mjs';
import { createQuotationApi } from '../server/quotation-api.mjs';
import {
  createQuotationProjection,
  QuotationProjectionDeniedError,
  QuotationProjectionNotFoundError,
} from '../server/quotation-projection.mjs';
import { createQuotationRepository } from '../server/quotation-repository.mjs';

const scryptAsync = promisify(scrypt);
const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';
const VALID_UNTIL = '2026-02-01T00:00:00.000Z';

function createRepos(db, approvalOptions) {
  const quotations = createQuotationRepository(db);
  const costs = createCostRepository(db);
  const approvals = createApprovalRepository(db, approvalOptions);
  return {
    customers: createCustomerRepository(db),
    inquiries: createInquiryRepository(db),
    quotations,
    costs,
    approvals,
    projections: createQuotationProjection({ quotations, costs, approvals }),
  };
}

function seedFoundation(repos) {
  repos.customers.create({ id: 'customer-one', displayName: '客戶一', contactName: '王小姐', createdAt: NOW });
  repos.inquiries.create({
    id: 'inquiry-one', customerId: 'customer-one', title: '帆布袋詢價', status: 'active', createdAt: NOW, updatedAt: NOW,
  });
  repos.inquiries.addItem({ id: 'inquiry-item-one', inquiryId: 'inquiry-one', description: '帆布袋', quantity: 2, createdAt: NOW });
}

function seedQuotation(repos, {
  id = 'quotation-one',
  versionNumber = 1,
  ownerActorId = 'editor-one',
  withDetails = false,
} = {}) {
  const quotation = repos.quotations.createVersion({
    id,
    inquiryId: 'inquiry-one',
    versionNumber,
    ownerActorId,
    currency: 'TWD',
    customerTotalMinor: 24000,
    validUntil: VALID_UNTIL,
    shippingDisplay: '運費另計',
    lockedExchangeRateMicros: 31000000,
    marginMinor: 8000,
    marginRateBasisPoints: 3333,
    internalNotes: 'INTERNAL-NOTES-CANARY',
    createdAt: NOW,
  });
  if (withDetails) {
    repos.quotations.addItem({
      id: 'quotation-item-one', quotationVersionId: id, inquiryItemId: 'inquiry-item-one',
      description: '帆布袋', quantity: 2, customerUnitPriceMinor: 12000, currency: 'TWD', createdAt: NOW,
    });
    repos.quotations.addOption({
      id: 'quotation-option-one', quotationVersionId: id, label: '標準包裝',
      customerPriceMinor: 24000, currency: 'TWD', createdAt: NOW,
    });
    const estimate = repos.costs.createEstimate({
      id: 'cost-estimate-one', inquiryId: 'inquiry-one', inquiryItemId: 'inquiry-item-one',
      supplierLabel: 'SUPPLIER-CANARY', estimatedCostMinor: 16000, currency: 'TWD',
      internalNotes: 'COST-LINE-CANARY', createdAt: NOW,
    });
    repos.costs.allocate({
      id: 'cost-allocation-one', costEstimateId: estimate.id, quotationItemId: 'quotation-item-one',
      allocatedCostMinor: 16000, currency: 'TWD', createdAt: NOW,
    });
  }
  return quotation;
}

async function createCredentials() {
  const salt = randomBytes(16);
  const hash = await scryptAsync('c0-b-password', salt, 32);
  const credential = (username, role) => ({
    username, passwordHash: hash.toString('hex'), salt: salt.toString('hex'), role,
  });
  return {
    'editor-one': credential('editor-one', 'editor'),
    'editor-two': credential('editor-two', 'editor'),
    'viewer-one': credential('viewer-one', 'viewer'),
    'approver-one': credential('approver-one', 'approver'),
    'unknown-one': credential('unknown-one', 'unknown-role'),
  };
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
  const response = await request(baseUrl, '/api/session', 'POST', { username, password: 'c0-b-password' });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').match(/bk_dashboard_session=([^;]+)/)[1];
}

test('C0-B migration - version 3 is contiguous, repeat migration is a no-op, and approval records are immutable', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    assert.equal(getSchemaVersion(db), '3');
    assert.deepEqual(
      db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
      [
        { version: 1, name: 'phase2b-initial-schema' },
        { version: 2, name: 'product-category-foundation' },
        { version: 3, name: 'approver-projection-foundation' },
      ],
    );
    const firstLedger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    let clockCalls = 0;
    assert.equal(migrateDatabase(db, { now: () => { clockCalls += 1; return LATER; } }), '3');
    assert.equal(clockCalls, 0);
    assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), firstLedger);

    const columns = db.prepare("SELECT name FROM pragma_table_info('quotation_versions') ORDER BY cid").all().map((row) => row.name);
    for (const column of [
      'owner_actor_id', 'approval_status', 'valid_until', 'shipping_display',
      'locked_exchange_rate_micros', 'margin_minor', 'margin_rate_basis_points', 'internal_notes',
    ]) assert.equal(columns.includes(column), true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'quotation_approvals'").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'quotation_approvals_immutable_%'").get().count, 3);
  } finally {
    db.close();
  }
});

test('C0-B approval immutability - first inserts work and every replacement path fails with recursive triggers off', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    db.exec('PRAGMA recursive_triggers = OFF');
    assert.equal(db.prepare('PRAGMA recursive_triggers').get().recursive_triggers, 0);
    assert.equal(db.prepare("SELECT wr FROM pragma_table_list WHERE name = 'quotation_approvals'").get().wr, 1);
    const repos = createRepos(db, { now: () => LATER, createId: () => 'approval-original' });
    seedFoundation(repos);
    seedQuotation(repos);
    const result = repos.approvals.decide({
      quotationVersionId: 'quotation-one', actorId: 'approver-one', decision: 'APPROVED', reason: 'original 核准',
    });
    assert.equal(result.approval.id, 'approval-original');
    assert.equal(result.approval.decision, 'APPROVED');

    const columns = 'id, quotation_version_id, decision, approver_actor_id, reason, created_at';
    const placeholders = '?, ?, ?, ?, ?, ?';
    const second = ['approval-second', 'quotation-one', 'APPROVED', 'approver-two', 'second record', NOW];
    assert.equal(db.prepare(`INSERT INTO quotation_approvals (${columns}) VALUES (${placeholders})`).run(...second).changes, 1);
    const readRows = () => db.prepare('SELECT * FROM quotation_approvals ORDER BY id').all();
    const originalRows = readRows();
    assert.equal(originalRows.length, 2);
    const originalBytes = Buffer.from(JSON.stringify(originalRows), 'utf8');
    const originalQuotation = repos.quotations.getVersion('quotation-one');
    const originalLedger = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const replacement = ['approval-original', 'quotation-one', 'RETURNED', 'approver-forged', 'rewritten', NOW];
    const attemptedNewRow = ['approval-partial', 'quotation-one', 'RETURNED', 'approver-forged', 'must roll back', NOW];
    const attempts = [
      ['UPDATE', 'UPDATE quotation_approvals SET decision = ?, approver_actor_id = ?, reason = ?, created_at = ? WHERE id = ?',
        ['RETURNED', 'approver-forged', 'rewritten', NOW, 'approval-original']],
      ['DELETE', 'DELETE FROM quotation_approvals WHERE id = ?', ['approval-original']],
      ['REPLACE', `REPLACE INTO quotation_approvals (${columns}) VALUES (${placeholders})`, replacement],
      ['INSERT OR REPLACE', `INSERT OR REPLACE INTO quotation_approvals (${columns}) VALUES (${placeholders})`, replacement],
      ['INSERT OR REPLACE SELECT', `INSERT OR REPLACE INTO quotation_approvals (${columns}) SELECT ${placeholders}`, replacement],
      ['UPSERT', `INSERT INTO quotation_approvals (${columns}) VALUES (${placeholders})
        ON CONFLICT(id) DO UPDATE SET decision = excluded.decision, approver_actor_id = excluded.approver_actor_id,
          reason = excluded.reason, created_at = excluded.created_at`, replacement],
      ['UPDATE OR REPLACE', 'UPDATE OR REPLACE quotation_approvals SET id = ? WHERE id = ?',
        ['approval-original', 'approval-second']],
      ['multi-row REPLACE', `REPLACE INTO quotation_approvals (${columns}) VALUES (${placeholders}), (${placeholders})`,
        [...attemptedNewRow, ...replacement]],
      ['multi-row INSERT OR REPLACE', `INSERT OR REPLACE INTO quotation_approvals (${columns}) VALUES (${placeholders}), (${placeholders})`,
        [...attemptedNewRow, ...replacement]],
    ];
    function assertPreserved(label) {
      assert.deepEqual(readRows(), originalRows, label);
      assert.deepEqual(Buffer.from(JSON.stringify(readRows()), 'utf8'), originalBytes, label);
      assert.deepEqual(repos.quotations.getVersion('quotation-one'), originalQuotation, label);
      assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), originalLedger, label);
      assert.equal(db.prepare('PRAGMA recursive_triggers').get().recursive_triggers, 0, label);
      assert.equal(db.isTransaction, false, label);
    }
    for (const [label, sql, values] of attempts) {
      assert.throws(() => db.prepare(sql).run(...values), /immutable/i, label);
      assertPreserved(label);
    }
    for (const alias of ['rowid', '_rowid_', 'oid']) {
      for (const command of ['REPLACE', 'INSERT OR REPLACE']) {
        const label = `${command} via ${alias}`;
        assert.throws(() => db.prepare(`
          ${command} INTO quotation_approvals (${alias}, ${columns}) VALUES (?, ${placeholders})
        `).run(1, ...attemptedNewRow), /no column named/i, label);
        assertPreserved(label);
      }
    }
    assert.equal(migrateDatabase(db, { now: () => { throw new Error('rerun must not write'); } }), '3');
    assertPreserved('rerun');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('C0-B access policy - approver is read-only outside approval and category listing while legacy viewer read stays allowed', () => {
  const matrix = getPolicyMatrix();
  assert.deepEqual(Object.keys(matrix).sort(), ['approver', 'editor', 'viewer']);
  assert.doesNotThrow(() => validateRoleFromSession('approver'));
  assert.equal(checkPermission('viewer', 'read'), true);
  assert.equal(checkPermission('approver', 'read'), true);
  assert.equal(checkPermission('approver', 'create'), false);
  assert.equal(checkPermission('approver', 'update'), false);
  assert.equal(checkPermission('approver', 'category:list'), true);
  assert.equal(checkPermission('approver', 'category:create'), false);
  assert.equal(checkPermission('approver', 'category:rename'), false);
  assert.equal(checkPermission('approver', 'category:deactivate'), false);
  assert.equal(checkPermission('approver', 'quotation:internal:read'), true);
  assert.equal(checkPermission('approver', 'quotation:customer:read'), true);
  assert.equal(checkPermission('approver', 'quotation:approval:decide'), true);
  assert.equal(checkPermission('editor', 'quotation:approval:decide'), false);
  assert.equal(checkPermission('viewer', 'quotation:approval:decide'), false);
  assert.throws(() => checkPermission('approver', 'unknown-action'), /Unknown action/);
});

test('C0-B approval repository - server-owned immutable decisions update status atomically and reject self-approval', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const repos = createRepos(db, { now: () => LATER, createId: () => 'approval-one' });
    seedFoundation(repos);
    seedQuotation(repos, { withDetails: true });
    seedQuotation(repos, { id: 'quotation-self', versionNumber: 2, ownerActorId: 'approver-one' });

    assert.throws(() => repos.approvals.decide({
      quotationVersionId: 'quotation-one', actorId: 'approver-one', decision: 'approved', reason: 'bad',
    }), /Invalid approval decision/);
    assert.throws(() => repos.approvals.decide({
      quotationVersionId: 'quotation-self', actorId: 'approver-one', decision: 'APPROVED', reason: 'self',
    }), ApprovalDeniedError);
    assert.throws(() => repos.approvals.decide({
      quotationVersionId: 'quotation-one', actorId: 'editor-one', decision: 'RETURNED', reason: 'self',
    }), ApprovalDeniedError);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM quotation_approvals').get().count, 0);
    assert.equal(repos.quotations.getVersion('quotation-self').approval_status, 'PENDING');

    const reason = "Needs review'); DROP TABLE quotation_versions;--";
    const result = repos.approvals.decide({
      quotationVersionId: 'quotation-one', actorId: 'approver-one', decision: 'APPROVED', reason,
      id: 'caller-id', createdAt: NOW,
    });
    assert.equal(result.approval.id, 'approval-one');
    assert.equal(result.approval.created_at, LATER);
    assert.equal(result.approval.approver_actor_id, 'approver-one');
    assert.equal(result.approval.reason, reason);
    assert.equal(result.quotation.status, 'published');
    assert.equal(result.quotation.approval_status, 'APPROVED');
    assert.equal(result.quotation.published_at, LATER);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'quotation_versions'").get().count, 1);
    assert.throws(() => db.prepare('UPDATE quotation_approvals SET reason = ? WHERE id = ?').run('changed', 'approval-one'), /immutable/i);
    assert.throws(() => db.prepare('DELETE FROM quotation_approvals WHERE id = ?').run('approval-one'), /immutable/i);

    seedQuotation(repos, { id: 'quotation-returned', versionNumber: 3, ownerActorId: 'editor-one' });
    const returnedApprovals = createApprovalRepository(db, {
      now: () => '2026-01-03T00:00:00.000Z', createId: () => 'approval-returned',
    });
    const returned = returnedApprovals.decide({
      quotationVersionId: 'quotation-returned', actorId: 'approver-one', decision: 'RETURNED', reason: '請調整',
    });
    assert.equal(returned.approval.decision, 'RETURNED');
    assert.equal(returned.quotation.status, 'draft');
    assert.equal(returned.quotation.approval_status, 'RETURNED');
    assert.equal(returned.quotation.published_at, null);

    seedQuotation(repos, { id: 'quotation-rollback', versionNumber: 4, ownerActorId: 'editor-one' });
    db.exec(`
      CREATE TRIGGER force_approval_status_failure
      BEFORE UPDATE ON quotation_versions
      WHEN OLD.id = 'quotation-rollback'
      BEGIN
        SELECT RAISE(ABORT, 'forced status failure');
      END;
    `);
    const rollbackApprovals = createApprovalRepository(db, {
      now: () => '2026-01-03T00:00:00.000Z', createId: () => 'approval-rollback',
    });
    assert.throws(() => rollbackApprovals.decide({
      quotationVersionId: 'quotation-rollback', actorId: 'approver-one', decision: 'RETURNED', reason: 'retry',
    }), /forced status failure/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM quotation_approvals WHERE id = ?').get('approval-rollback').count, 0);
    assert.equal(repos.quotations.getVersion('quotation-rollback').approval_status, 'PENDING');
    assert.equal(repos.quotations.getVersion('quotation-rollback').status, 'draft');
  } finally {
    db.close();
  }
});

test('C0-B projections - internal access is ownership-scoped and customer output is an explicit leak-free allowlist', () => {
  const db = openPhase2bDatabase(':memory:');
  try {
    const repos = createRepos(db, { now: () => LATER, createId: () => 'approval-projection' });
    seedFoundation(repos);
    seedQuotation(repos, { withDetails: true });

    const editor = { actorId: 'editor-one', role: 'editor' };
    const otherEditor = { actorId: 'editor-two', role: 'editor' };
    const approver = { actorId: 'approver-one', role: 'approver' };
    const viewer = { actorId: 'viewer-one', role: 'viewer' };
    const internal = repos.projections.internal('quotation-one', editor);
    assert.equal(internal.quotationVersion.lockedExchangeRateMicros, 31000000);
    assert.equal(internal.quotationVersion.marginMinor, 8000);
    assert.equal(internal.quotationVersion.internalNotes, 'INTERNAL-NOTES-CANARY');
    assert.equal(internal.costSummary[0].estimatedCostMinor, 16000);
    assert.equal(internal.costLines[0].supplierLabel, 'SUPPLIER-CANARY');
    assert.equal(internal.costLines[0].allocations[0].allocatedCostMinor, 16000);
    assert.deepEqual(repos.projections.internal('quotation-one', approver), internal);
    assert.throws(() => repos.projections.internal('quotation-one', otherEditor), QuotationProjectionNotFoundError);
    assert.throws(() => repos.projections.internal('missing-quotation', otherEditor), QuotationProjectionNotFoundError);
    assert.throws(() => repos.projections.internal('quotation-one', viewer), QuotationProjectionDeniedError);

    const customer = repos.projections.customer('quotation-one', editor);
    assert.deepEqual(Object.keys(customer).sort(), ['customer', 'items', 'options', 'quotation']);
    assert.deepEqual(Object.keys(customer.quotation).sort(), [
      'currency', 'shippingDisplay', 'status', 'subtotalMinor', 'totalMinor', 'validUntil', 'versionNumber',
    ]);
    assert.deepEqual(Object.keys(customer.items[0]).sort(), ['description', 'quantity', 'subtotalMinor', 'unitPriceMinor']);
    assert.equal(customer.quotation.subtotalMinor, 24000);
    assert.equal(customer.quotation.totalMinor, 24000);
    assert.throws(() => repos.projections.customer('quotation-one', otherEditor), QuotationProjectionNotFoundError);
    assert.throws(() => repos.projections.customer('quotation-one', viewer), QuotationProjectionNotFoundError);
    assert.deepEqual(repos.projections.customer('quotation-one', approver), customer);

    const serialized = JSON.stringify(customer);
    for (const secret of [
      'costSummary', 'costLines', 'allocations', 'SUPPLIER-CANARY', 'COST-LINE-CANARY',
      'INTERNAL-NOTES-CANARY', 'lockedExchangeRate', 'margin', 'approval', 'audit', 'ownerActorId',
    ]) assert.equal(serialized.toLowerCase().includes(secret.toLowerCase()), false, `${secret} must not leak`);

    repos.approvals.decide({
      quotationVersionId: 'quotation-one', actorId: 'approver-one', decision: 'APPROVED', reason: 'APPROVAL-REASON-CANARY',
    });
    const published = repos.projections.customer('quotation-one', viewer);
    assert.equal(published.quotation.status, 'published');
    assert.equal(JSON.stringify(published).includes('APPROVAL-REASON-CANARY'), false);
  } finally {
    db.close();
  }
});

test('C0-B quotation API - denied roles fail before body parsing or repository and unknown roles fail closed', async () => {
  let parses = 0;
  let projectionCalls = 0;
  let approvalCalls = 0;
  const projections = new Proxy({}, {
    get() { return () => { projectionCalls += 1; throw new Error('projection must not be called'); }; },
  });
  const approvals = new Proxy({}, {
    get() { return () => { approvalCalls += 1; throw new Error('approval repository must not be called'); }; },
  });
  const response = () => ({
    writeHead(status) { this.status = status; },
    end(body) { this.body = JSON.parse(body); },
  });

  const viewerApi = createQuotationApi({
    projections,
    approvals,
    getSession: () => ({ actorId: 'viewer-one', role: 'viewer' }),
    parseJsonBody: async () => { parses += 1; return { decision: 'APPROVED' }; },
  });
  const internalResponse = response();
  await viewerApi.handle({ method: 'GET', url: '/api/quotations/quotation-one/internal' }, internalResponse);
  assert.equal(internalResponse.status, 403);
  const decisionResponse = response();
  await viewerApi.handle({ method: 'POST', url: '/api/quotations/quotation-one/approval-decisions' }, decisionResponse);
  assert.equal(decisionResponse.status, 403);
  assert.equal(parses, 0);
  assert.equal(projectionCalls, 0);
  assert.equal(approvalCalls, 0);

  const unknownApi = createQuotationApi({
    projections,
    approvals,
    getSession: () => ({ actorId: 'unknown-one', role: 'unknown-role' }),
    parseJsonBody: async () => { parses += 1; return {}; },
  });
  const unknownResponse = response();
  await unknownApi.handle({ method: 'GET', url: '/api/quotations/quotation-one/customer' }, unknownResponse);
  assert.equal(unknownResponse.status, 401);
  assert.equal(projectionCalls, 0);
});

test('C0-B HTTP integration - role scopes, self-approval, spoofing, existence hiding, and published customer access hold', async () => {
  const db = openPhase2bDatabase(':memory:');
  const repos = createRepos(db);
  seedFoundation(repos);
  seedQuotation(repos, { withDetails: true });
  seedQuotation(repos, { id: 'quotation-self', versionNumber: 2, ownerActorId: 'approver-one' });
  const server = createHttpServer({
    port: 0,
    host: '127.0.0.1',
    credentials: await createCredentials(),
    db,
    approvalOptions: { now: () => LATER, createId: () => 'approval-http' },
  });
  await server.listen();
  const baseUrl = `http://127.0.0.1:${server.server.address().port}`;
  try {
    const editor = await login(baseUrl, 'editor-one');
    const otherEditor = await login(baseUrl, 'editor-two');
    const viewer = await login(baseUrl, 'viewer-one');
    const approver = await login(baseUrl, 'approver-one');
    const unknown = await login(baseUrl, 'unknown-one');

    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/internal', 'GET', undefined, editor)).status, 200);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/customer', 'GET', undefined, editor)).status, 200);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/internal', 'GET', undefined, approver)).status, 200);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/customer', 'GET', undefined, approver)).status, 200);

    const hiddenExisting = await request(baseUrl, '/api/quotations/quotation-one/internal', 'GET', undefined, otherEditor);
    const hiddenMissing = await request(baseUrl, '/api/quotations/missing-quotation/internal', 'GET', undefined, otherEditor);
    assert.equal(hiddenExisting.status, 404);
    assert.deepEqual(hiddenExisting.body, { error: 'Not found' });
    assert.equal(hiddenMissing.status, 404);
    assert.deepEqual(hiddenMissing.body, hiddenExisting.body);

    const viewerInternalExisting = await request(baseUrl, '/api/quotations/quotation-one/internal', 'GET', undefined, viewer);
    const viewerInternalMissing = await request(baseUrl, '/api/quotations/missing-quotation/internal', 'GET', undefined, viewer);
    assert.equal(viewerInternalExisting.status, 403);
    assert.equal(viewerInternalMissing.status, 403);
    assert.deepEqual(viewerInternalExisting.body, viewerInternalMissing.body);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/customer', 'GET', undefined, viewer)).status, 404);

    const anonymousExisting = await request(baseUrl, '/api/quotations/quotation-one/customer');
    const anonymousMissing = await request(baseUrl, '/api/quotations/missing-quotation/customer');
    assert.equal(anonymousExisting.status, 401);
    assert.equal(anonymousMissing.status, 401);
    assert.deepEqual(anonymousExisting.body, anonymousMissing.body);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/customer', 'GET', undefined, unknown)).status, 401);

    for (const cookie of [editor, viewer]) {
      const denied = await request(baseUrl, '/api/quotations/quotation-one/approval-decisions', 'POST', {
        decision: 'APPROVED', role: 'approver', authorized: true, isAdmin: true, actorId: 'approver-one',
      }, cookie);
      assert.equal(denied.status, 403);
      assert.deepEqual(denied.body, { error: 'Forbidden' });
    }
    const selfDenied = await request(baseUrl, '/api/quotations/quotation-self/approval-decisions', 'POST', {
      decision: 'APPROVED', reason: '不可自行核價',
    }, approver);
    assert.equal(selfDenied.status, 403);
    const spoofedSelf = await request(baseUrl, '/api/quotations/quotation-self/approval-decisions', 'POST', {
      decision: 'APPROVED', actorId: 'different-actor', role: 'admin', authorized: true,
    }, approver);
    assert.equal(spoofedSelf.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM quotation_approvals').get().count, 0);

    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/approval-decisions', 'POST', { decision: 'approved' }, approver)).status, 400);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/approval-decisions?actorId=editor-one', 'POST', { decision: 'APPROVED' }, approver)).status, 400);
    const approved = await request(baseUrl, '/api/quotations/quotation-one/approval-decisions', 'POST', {
      decision: 'APPROVED', reason: '核准',
    }, approver);
    assert.equal(approved.status, 201);
    assert.equal(approved.body.approval.id, 'approval-http');
    assert.equal(approved.body.approval.approverActorId, 'approver-one');
    assert.equal(approved.body.quotation.status, 'published');
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/customer', 'GET', undefined, viewer)).status, 200);
    assert.equal((await request(baseUrl, '/api/quotations/quotation-one/approval-decisions', 'POST', { decision: 'RETURNED' }, approver)).status, 409);

    assert.equal((await request(baseUrl, '/api/product-categories', 'GET', undefined, approver)).status, 200);
    assert.equal((await request(baseUrl, '/api/product-categories', 'POST', { name: 'nope' }, approver)).status, 403);
  } finally {
    await server.close();
    db.close();
  }
});
