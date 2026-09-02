import { EXPORT_SCHEMA_VERSION } from './config.mjs';
import { assertId, ensureFound } from './database.mjs';

const GENERIC_EXPORT_DENIED_MESSAGE = 'Inquiry export is not available';

export class InquiryExportDeniedError extends Error {
  constructor() {
    super(GENERIC_EXPORT_DENIED_MESSAGE);
    this.name = 'InquiryExportDeniedError';
  }
}

function denyExport() {
  throw new InquiryExportDeniedError();
}

function assertActorContext(actorContext) {
  if (!actorContext || typeof actorContext !== 'object' || Array.isArray(actorContext)) denyExport();
  if (actorContext.authorized === true || actorContext.isAdmin === true) denyExport();
  if (typeof actorContext.actorId !== 'string' || actorContext.actorId.length === 0) denyExport();
}

function assertAccessPolicy(accessPolicy) {
  if (!accessPolicy || typeof accessPolicy !== 'object') denyExport();
  if (typeof accessPolicy.canExportInquiry !== 'function') denyExport();
}

function assertPolicyAllows(result) {
  if (!result || typeof result !== 'object' || result.allow !== true) denyExport();
}

export function createExportService(db, { accessPolicy } = {}) {
  return {
    exportInquiry(inquiryId, actorContext) {
      try {
        assertId(inquiryId, 'inquiry id');
        assertActorContext(actorContext);
        assertAccessPolicy(accessPolicy);
        const policyResult = accessPolicy.canExportInquiry({ actorContext, inquiryId });
        assertPolicyAllows(policyResult);
      } catch (error) {
        if (error instanceof InquiryExportDeniedError) throw error;
        denyExport();
      }

      const inquiry = ensureFound(
        db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inquiryId),
        GENERIC_EXPORT_DENIED_MESSAGE,
      );
      const customer = ensureFound(db.prepare('SELECT * FROM customers WHERE id = ?').get(inquiry.customer_id), 'Unknown customer');
      const items = db.prepare('SELECT * FROM inquiry_items WHERE inquiry_id = ? ORDER BY created_at, id').all(inquiryId);
      const versions = db.prepare('SELECT * FROM quotation_versions WHERE inquiry_id = ? ORDER BY version_number').all(inquiryId);
      const quotationVersions = versions.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        status: version.status,
        currency: version.currency,
        customerTotalMinor: version.customer_total_minor,
        createdAt: version.created_at,
        publishedAt: version.published_at,
        options: db.prepare(`
          SELECT id, label, customer_price_minor, currency
          FROM quotation_options
          WHERE quotation_version_id = ?
          ORDER BY created_at, id
        `).all(version.id).map((option) => ({
          id: option.id,
          label: option.label,
          customerPriceMinor: option.customer_price_minor,
          currency: option.currency,
        })),
        items: db.prepare(`
          SELECT id, inquiry_item_id, description, quantity, customer_unit_price_minor, currency
          FROM quotation_items
          WHERE quotation_version_id = ?
          ORDER BY created_at, id
        `).all(version.id).map((item) => ({
          id: item.id,
          inquiryItemId: item.inquiry_item_id,
          description: item.description,
          quantity: item.quantity,
          customerUnitPriceMinor: item.customer_unit_price_minor,
          currency: item.currency,
        })),
      }));

      const costSummary = db.prepare(`
        SELECT currency, COALESCE(SUM(estimated_cost_minor), 0) AS estimated_cost_minor
        FROM cost_estimates
        WHERE inquiry_id = ?
        GROUP BY currency
        ORDER BY currency
      `).all(inquiryId).map((row) => ({
        currency: row.currency,
        estimatedCostMinor: row.estimated_cost_minor,
      }));

      const attachments = db.prepare(`
        SELECT id, entity_type, entity_id, title, url, visibility, created_at
        FROM attachments
        WHERE inquiry_id = ?
        ORDER BY created_at, id
      `).all(inquiryId).map((attachment) => ({
        id: attachment.id,
        entityType: attachment.entity_type,
        entityId: attachment.entity_id,
        title: attachment.title,
        url: attachment.url,
        visibility: attachment.visibility,
        createdAt: attachment.created_at,
      }));

      return {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: new Date(0).toISOString(),
        inquiry: {
          id: inquiry.id,
          title: inquiry.title,
          status: inquiry.status,
          createdAt: inquiry.created_at,
          updatedAt: inquiry.updated_at,
        },
        customer: {
          id: customer.id,
          displayName: customer.display_name,
          contactName: customer.contact_name,
          email: customer.email,
          phone: customer.phone,
        },
        items: items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          notes: item.notes,
        })),
        quotationVersions,
        costSummary,
        attachments,
      };
    },
  };
}
