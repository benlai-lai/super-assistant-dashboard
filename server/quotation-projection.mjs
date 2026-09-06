export class QuotationProjectionNotFoundError extends Error {}
export class QuotationProjectionDeniedError extends Error {}
export class QuotationProjectionValidationError extends Error {}

function requireActor(actor) {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) {
    throw new QuotationProjectionDeniedError('Quotation projection is not available');
  }
  if (typeof actor.actorId !== 'string' || actor.actorId.length < 2) {
    throw new QuotationProjectionDeniedError('Quotation projection is not available');
  }
  if (!['editor', 'viewer', 'approver'].includes(actor.role)) {
    throw new QuotationProjectionDeniedError('Quotation projection is not available');
  }
}

function requireVisibleSource(source, visible) {
  if (!source || !visible) throw new QuotationProjectionNotFoundError('Quotation projection is not available');
  return source;
}

function itemSubtotalMinor(item) {
  const subtotal = item.quantity * item.customer_unit_price_minor;
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new Error('Quotation item subtotal is invalid');
  return subtotal;
}

function invalidCustomerProjection() {
  throw new QuotationProjectionNotFoundError('Quotation projection is not available');
}

function invalidCustomerQuotationData() {
  throw new QuotationProjectionValidationError('Quotation projection is not available');
}

function customerField(record, key, onMissing = invalidCustomerProjection) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(record))) invalidCustomerProjection();
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) onMissing();
  return descriptor.value;
}

function customerText(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') invalidCustomerProjection();
  return value;
}

function customerInteger(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) invalidCustomerProjection();
  return value;
}

function customerCurrency(value, expected = value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value) || value !== expected) invalidCustomerQuotationData();
  return value;
}

function customerValidUntil(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalidCustomerQuotationData();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) invalidCustomerQuotationData();
  return value;
}

export function createQuotationProjection({ quotations, costs, approvals }) {
  function getSource(versionId) {
    return quotations.getProjectionSource(versionId);
  }

  return {
    internal(versionId, actor) {
      requireActor(actor);
      const roleCanRead = actor.role === 'approver' || actor.role === 'editor';
      if (!roleCanRead) throw new QuotationProjectionDeniedError('Quotation projection is not available');

      const source = getSource(versionId);
      const visible = actor.role === 'approver' || source?.version.owner_actor_id === actor.actorId;
      requireVisibleSource(source, visible);

      const version = source.version;
      const costLines = costs.listEstimates(version.inquiry_id);
      const allocations = costs.listAllocationsForQuotation(version.id);
      return {
        quotationVersion: {
          id: version.id,
          inquiryId: version.inquiry_id,
          versionNumber: version.version_number,
          status: version.status,
          approvalStatus: version.approval_status,
          currency: version.currency,
          customerTotalMinor: version.customer_total_minor,
          ownerActorId: version.owner_actor_id,
          createdAt: version.created_at,
          publishedAt: version.published_at,
          validUntil: version.valid_until,
          shippingDisplay: version.shipping_display,
          lockedExchangeRateMicros: version.locked_exchange_rate_micros,
          marginMinor: version.margin_minor,
          marginRateBasisPoints: version.margin_rate_basis_points,
          internalNotes: version.internal_notes,
        },
        inquiry: {
          id: version.inquiry_id,
          title: version.inquiry_title,
          status: version.inquiry_status,
        },
        customer: {
          displayName: version.customer_display_name,
          contactName: version.customer_contact_name,
        },
        items: source.items.map((item) => ({
          id: item.id,
          inquiryItemId: item.inquiry_item_id,
          productCategoryId: item.product_category_id,
          description: item.description,
          quantity: item.quantity,
          customerUnitPriceMinor: item.customer_unit_price_minor,
          customerSubtotalMinor: itemSubtotalMinor(item),
          currency: item.currency,
        })),
        options: source.options.map((option) => ({
          id: option.id,
          label: option.label,
          customerPriceMinor: option.customer_price_minor,
          currency: option.currency,
        })),
        costSummary: costs.summarizeByInquiry(version.inquiry_id).map((row) => ({
          currency: row.currency,
          estimatedCostMinor: row.estimated_cost_minor,
        })),
        costLines: costLines.map((line) => ({
          id: line.id,
          inquiryItemId: line.inquiry_item_id,
          supplierLabel: line.supplier_label,
          estimatedCostMinor: line.estimated_cost_minor,
          currency: line.currency,
          internalNotes: line.internal_notes,
          createdAt: line.created_at,
          allocations: allocations
            .filter((allocation) => allocation.cost_estimate_id === line.id)
            .map((allocation) => ({
              id: allocation.id,
              quotationItemId: allocation.quotation_item_id,
              allocatedCostMinor: allocation.allocated_cost_minor,
              currency: allocation.currency,
              createdAt: allocation.created_at,
            })),
        })),
        approvalRecords: approvals.listForQuotation(version.id).map((record) => ({
          id: record.id,
          decision: record.decision,
          approverActorId: record.approver_actor_id,
          reason: record.reason,
          createdAt: record.created_at,
        })),
      };
    },

    customer(versionId, actor) {
      requireActor(actor);
      const source = getSource(versionId);
      const version = customerField(source, 'version');
      const status = customerText(customerField(version, 'status'));
      if (!['draft', 'published', 'void'].includes(status)) invalidCustomerProjection();
      const ownerActorId = customerText(customerField(version, 'owner_actor_id'), true);
      const visible = actor.role === 'approver'
        || (actor.role === 'editor' && ownerActorId === actor.actorId)
        || (actor.role === 'viewer' && status === 'published');
      requireVisibleSource(source, visible);

      const currency = customerCurrency(customerField(version, 'currency', invalidCustomerQuotationData));
      const validUntil = customerValidUntil(customerField(version, 'valid_until', invalidCustomerQuotationData));
      const sourceItems = customerField(source, 'items');
      const sourceOptions = customerField(source, 'options');
      if (!Array.isArray(sourceItems) || !Array.isArray(sourceOptions)) invalidCustomerProjection();
      const items = [];
      const options = [];
      let subtotalMinor = 0;
      // Build fresh arrays without invoking repository-owned map/iterator/species hooks.
      for (let index = 0; index < sourceItems.length; index += 1) {
        const item = sourceItems[index];
        customerCurrency(customerField(item, 'currency', invalidCustomerQuotationData), currency);
        const quantity = customerInteger(customerField(item, 'quantity'), 1);
        const unitPriceMinor = customerInteger(customerField(item, 'customer_unit_price_minor'));
        const itemTotal = customerInteger(quantity * unitPriceMinor);
        subtotalMinor = customerInteger(subtotalMinor + itemTotal);
        items.push({
          description: customerText(customerField(item, 'description')),
          quantity,
          unitPriceMinor,
          subtotalMinor: itemTotal,
        });
      }
      for (let index = 0; index < sourceOptions.length; index += 1) {
        const option = sourceOptions[index];
        options.push({
          label: customerText(customerField(option, 'label')),
          priceMinor: customerInteger(customerField(option, 'customer_price_minor')),
          currency: customerCurrency(customerField(option, 'currency', invalidCustomerQuotationData), currency),
        });
      }

      return {
        quotation: {
          versionNumber: customerInteger(customerField(version, 'version_number'), 1),
          status,
          currency,
          validUntil,
          shippingDisplay: customerText(customerField(version, 'shipping_display'), true),
          subtotalMinor,
          totalMinor: customerInteger(customerField(version, 'customer_total_minor')),
        },
        customer: {
          displayName: customerText(customerField(version, 'customer_display_name')),
          contactName: customerText(customerField(version, 'customer_contact_name'), true),
        },
        items,
        options,
      };
    },
  };
}
