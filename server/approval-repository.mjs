import { randomUUID } from 'node:crypto';
import { assertId, assertIsoDateTime, ensureFound, runInTransaction } from './database.mjs';

const DECISIONS = new Set(['APPROVED', 'RETURNED']);

export class ApprovalNotFoundError extends Error {}
export class ApprovalDeniedError extends Error {}
export class ApprovalConflictError extends Error {}

function assertDecision(value) {
  if (!DECISIONS.has(value)) throw new Error('Invalid approval decision');
}

function assertReason(value) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || [...value].length > 1000) {
    throw new Error('Invalid approval reason');
  }
}

export function createApprovalRepository(db, {
  now = () => new Date().toISOString(),
  createId = randomUUID,
} = {}) {
  function getQuotation(versionId) {
    assertId(versionId, 'quotation version id');
    return db.prepare('SELECT * FROM quotation_versions WHERE id = ?').get(versionId) ?? null;
  }

  function listForQuotation(versionId) {
    assertId(versionId, 'quotation version id');
    return db.prepare(`
      SELECT id, quotation_version_id, decision, approver_actor_id, reason, created_at
      FROM quotation_approvals
      WHERE quotation_version_id = ?
      ORDER BY created_at, id
    `).all(versionId);
  }

  return {
    decide({ quotationVersionId, actorId, decision, reason = null }) {
      assertId(quotationVersionId, 'quotation version id');
      assertId(actorId, 'approver actor id');
      assertDecision(decision);
      assertReason(reason);

      const approvalId = createId();
      const createdAt = now();
      assertId(approvalId, 'approval id');
      assertIsoDateTime(createdAt, 'approval createdAt');

      return runInTransaction(db, () => {
        const quotation = getQuotation(quotationVersionId);
        if (!quotation) throw new ApprovalNotFoundError('Quotation approval is not available');
        if (!quotation.owner_actor_id || quotation.owner_actor_id === actorId) {
          throw new ApprovalDeniedError('Quotation approval is not available');
        }
        if (quotation.status !== 'draft') {
          throw new ApprovalConflictError('Quotation approval is not available');
        }

        db.prepare(`
          INSERT INTO quotation_approvals
            (id, quotation_version_id, decision, approver_actor_id, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(approvalId, quotationVersionId, decision, actorId, reason, createdAt);

        const nextStatus = decision === 'APPROVED' ? 'published' : 'draft';
        const publishedAt = decision === 'APPROVED' ? createdAt : null;
        const update = db.prepare(`
          UPDATE quotation_versions
          SET approval_status = ?, status = ?, published_at = ?
          WHERE id = ? AND status = 'draft'
        `).run(decision, nextStatus, publishedAt, quotationVersionId);
        if (update.changes !== 1) throw new ApprovalConflictError('Quotation approval is not available');

        return {
          approval: ensureFound(
            db.prepare(`
              SELECT id, quotation_version_id, decision, approver_actor_id, reason, created_at
              FROM quotation_approvals
              WHERE id = ?
            `).get(approvalId),
            'Approval record was not created',
          ),
          quotation: getQuotation(quotationVersionId),
        };
      });
    },
    listForQuotation,
  };
}
