import {
  assertCurrency,
  assertId,
  assertIsoDateTime,
  assertMinorUnits,
  ensureFound,
  runInTransaction,
} from './database.mjs';

export function createCostRepository(db) {
  return {
    createEstimate(estimate) {
      assertId(estimate.id, 'cost estimate id');
      assertId(estimate.inquiryId, 'inquiry id');
      if (estimate.inquiryItemId !== undefined && estimate.inquiryItemId !== null) assertId(estimate.inquiryItemId, 'inquiry item id');
      assertCurrency(estimate.currency);
      assertMinorUnits(estimate.estimatedCostMinor, 'estimated cost');
      assertIsoDateTime(estimate.createdAt, 'createdAt');
      return runInTransaction(db, () => {
        ensureFound(db.prepare('SELECT id FROM inquiries WHERE id = ?').get(estimate.inquiryId), 'Unknown inquiry');
        if (estimate.inquiryItemId) {
          ensureFound(
            db.prepare('SELECT id FROM inquiry_items WHERE id = ? AND inquiry_id = ?').get(estimate.inquiryItemId, estimate.inquiryId),
            'Cost estimate inquiry item must belong to inquiry',
          );
        }
        db.prepare(`
          INSERT INTO cost_estimates
            (id, inquiry_id, inquiry_item_id, supplier_label, estimated_cost_minor, currency, internal_notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          estimate.id,
          estimate.inquiryId,
          estimate.inquiryItemId ?? null,
          estimate.supplierLabel ?? null,
          estimate.estimatedCostMinor,
          estimate.currency,
          estimate.internalNotes ?? null,
          estimate.createdAt,
        );
        return db.prepare('SELECT * FROM cost_estimates WHERE id = ?').get(estimate.id);
      });
    },
    allocate(allocation) {
      assertId(allocation.id, 'cost allocation id');
      assertId(allocation.costEstimateId, 'cost estimate id');
      assertId(allocation.quotationItemId, 'quotation item id');
      assertCurrency(allocation.currency);
      assertMinorUnits(allocation.allocatedCostMinor, 'allocated cost');
      assertIsoDateTime(allocation.createdAt, 'createdAt');
      return runInTransaction(db, () => {
        const estimate = ensureFound(
          db.prepare('SELECT * FROM cost_estimates WHERE id = ?').get(allocation.costEstimateId),
          'Unknown cost estimate',
        );
        const quotationItem = ensureFound(
          db.prepare(`
            SELECT qi.*, qv.inquiry_id
            FROM quotation_items qi
            JOIN quotation_versions qv ON qv.id = qi.quotation_version_id
            WHERE qi.id = ?
          `).get(allocation.quotationItemId),
          'Unknown quotation item',
        );
        if (quotationItem.inquiry_id !== estimate.inquiry_id) {
          throw new Error('Cost allocation cannot cross inquiry boundaries');
        }
        db.prepare(`
          INSERT INTO cost_allocations
            (id, cost_estimate_id, quotation_item_id, allocated_cost_minor, currency, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          allocation.id,
          allocation.costEstimateId,
          allocation.quotationItemId,
          allocation.allocatedCostMinor,
          allocation.currency,
          allocation.createdAt,
        );
        return db.prepare('SELECT * FROM cost_allocations WHERE id = ?').get(allocation.id);
      });
    },
    listEstimates(inquiryId) {
      assertId(inquiryId, 'inquiry id');
      return db.prepare('SELECT * FROM cost_estimates WHERE inquiry_id = ? ORDER BY created_at, id').all(inquiryId);
    },
    listAllocationsForQuotation(quotationVersionId) {
      assertId(quotationVersionId, 'quotation version id');
      return db.prepare(`
        SELECT ca.*
        FROM cost_allocations ca
        JOIN quotation_items qi ON qi.id = ca.quotation_item_id
        WHERE qi.quotation_version_id = ?
        ORDER BY ca.created_at, ca.id
      `).all(quotationVersionId);
    },
    summarizeByInquiry(inquiryId) {
      assertId(inquiryId, 'inquiry id');
      return db.prepare(`
        SELECT currency, COALESCE(SUM(estimated_cost_minor), 0) AS estimated_cost_minor
        FROM cost_estimates
        WHERE inquiry_id = ?
        GROUP BY currency
        ORDER BY currency
      `).all(inquiryId);
    },
  };
}
