import {
  assertCurrency,
  assertId,
  assertIsoDateTime,
  assertMinorUnits,
  ensureFound,
  runInTransaction,
} from './database.mjs';
import { createProductCategoryRepository } from './product-category-repository.mjs';

function assertOptionalString(value, fieldName) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertOptionalInteger(value, fieldName, { positive = false } = {}) {
  if (value === undefined || value === null) return;
  if (!Number.isSafeInteger(value) || (positive && value < 1)) {
    throw new Error(`${fieldName} must be ${positive ? 'a positive' : 'an'} integer`);
  }
}

export function createQuotationRepository(db) {
  const productCategories = createProductCategoryRepository(db);

  function getVersion(id) {
    assertId(id, 'quotation version id');
    return db.prepare('SELECT * FROM quotation_versions WHERE id = ?').get(id) ?? null;
  }

  function requireDraftVersion(id) {
    const version = ensureFound(getVersion(id), 'Unknown quotation version');
    if (version.status !== 'draft') throw new Error('Published quotation versions are immutable');
    return version;
  }

  function requireVersionInInquiry(versionId, inquiryId) {
    assertId(versionId, 'quotation version id');
    assertId(inquiryId, 'inquiry id');
    return ensureFound(
      db.prepare('SELECT * FROM quotation_versions WHERE id = ? AND inquiry_id = ?').get(versionId, inquiryId),
      'Quotation version does not belong to inquiry',
    );
  }

  return {
    createVersion(version) {
      assertId(version.id, 'quotation version id');
      assertId(version.inquiryId, 'inquiry id');
      if (version.ownerActorId !== undefined && version.ownerActorId !== null) assertId(version.ownerActorId, 'owner actor id');
      assertCurrency(version.currency);
      assertMinorUnits(version.customerTotalMinor ?? 0, 'customer total');
      assertIsoDateTime(version.createdAt, 'createdAt');
      if (version.validUntil !== undefined && version.validUntil !== null) assertIsoDateTime(version.validUntil, 'validUntil');
      assertOptionalString(version.shippingDisplay, 'shippingDisplay');
      assertOptionalInteger(version.lockedExchangeRateMicros, 'lockedExchangeRateMicros', { positive: true });
      assertOptionalInteger(version.marginMinor, 'marginMinor');
      assertOptionalInteger(version.marginRateBasisPoints, 'marginRateBasisPoints');
      assertOptionalString(version.internalNotes, 'internalNotes');
      return runInTransaction(db, () => {
        ensureFound(db.prepare('SELECT id FROM inquiries WHERE id = ?').get(version.inquiryId), 'Unknown inquiry');
        db.prepare(`
          INSERT INTO quotation_versions
            (id, inquiry_id, version_number, status, currency, customer_total_minor, created_at, published_at,
             owner_actor_id, valid_until, shipping_display, locked_exchange_rate_micros,
             margin_minor, margin_rate_basis_points, internal_notes)
          VALUES (?, ?, ?, 'draft', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          version.id,
          version.inquiryId,
          version.versionNumber,
          version.currency,
          version.customerTotalMinor ?? 0,
          version.createdAt,
          version.ownerActorId ?? null,
          version.validUntil ?? null,
          version.shippingDisplay ?? null,
          version.lockedExchangeRateMicros ?? null,
          version.marginMinor ?? null,
          version.marginRateBasisPoints ?? null,
          version.internalNotes ?? null,
        );
        return getVersion(version.id);
      });
    },
    addOption(option) {
      assertId(option.id, 'quotation option id');
      assertId(option.quotationVersionId, 'quotation version id');
      assertCurrency(option.currency);
      assertMinorUnits(option.customerPriceMinor, 'customer price');
      assertIsoDateTime(option.createdAt, 'createdAt');
      return runInTransaction(db, () => {
        requireDraftVersion(option.quotationVersionId);
        db.prepare(`
          INSERT INTO quotation_options
            (id, quotation_version_id, label, customer_price_minor, currency, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          option.id,
          option.quotationVersionId,
          option.label,
          option.customerPriceMinor,
          option.currency,
          option.createdAt,
        );
        return db.prepare('SELECT * FROM quotation_options WHERE id = ?').get(option.id);
      });
    },
    addItem(item) {
      assertId(item.id, 'quotation item id');
      assertId(item.quotationVersionId, 'quotation version id');
      assertId(item.inquiryItemId, 'inquiry item id');
      assertCurrency(item.currency);
      assertMinorUnits(item.customerUnitPriceMinor, 'customer unit price');
      assertIsoDateTime(item.createdAt, 'createdAt');
      const productCategoryId = item.productCategoryId ?? null;
      if (productCategoryId !== null) assertId(productCategoryId, 'product category id');
      return runInTransaction(db, () => {
        const version = requireDraftVersion(item.quotationVersionId);
        ensureFound(
          db.prepare('SELECT id FROM inquiry_items WHERE id = ? AND inquiry_id = ?').get(item.inquiryItemId, version.inquiry_id),
          'Inquiry item does not belong to quotation inquiry',
        );
        if (productCategoryId !== null) productCategories.requireActive(productCategoryId);
        db.prepare(`
          INSERT INTO quotation_items
            (id, quotation_version_id, inquiry_item_id, description, quantity, customer_unit_price_minor, currency, created_at, product_category_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.id,
          item.quotationVersionId,
          item.inquiryItemId,
          item.description,
          item.quantity,
          item.customerUnitPriceMinor,
          item.currency,
          item.createdAt,
          productCategoryId,
        );
        return db.prepare('SELECT * FROM quotation_items WHERE id = ?').get(item.id);
      });
    },
    updateDraftTotal(versionId, customerTotalMinor) {
      assertMinorUnits(customerTotalMinor, 'customer total');
      return runInTransaction(db, () => {
        requireDraftVersion(versionId);
        db.prepare('UPDATE quotation_versions SET customer_total_minor = ? WHERE id = ?').run(customerTotalMinor, versionId);
        return getVersion(versionId);
      });
    },
    publishVersion(versionId, publishedAt) {
      assertIsoDateTime(publishedAt, 'publishedAt');
      return runInTransaction(db, () => {
        requireDraftVersion(versionId);
        db.prepare("UPDATE quotation_versions SET status = 'published', published_at = ? WHERE id = ?").run(publishedAt, versionId);
        return getVersion(versionId);
      });
    },
    getVersion,
    requireVersionInInquiry,
    listVersions(inquiryId) {
      assertId(inquiryId, 'inquiry id');
      return db.prepare('SELECT * FROM quotation_versions WHERE inquiry_id = ? ORDER BY version_number').all(inquiryId);
    },
    listOptions(versionId) {
      assertId(versionId, 'quotation version id');
      return db.prepare('SELECT * FROM quotation_options WHERE quotation_version_id = ? ORDER BY created_at, id').all(versionId);
    },
    listItems(versionId) {
      assertId(versionId, 'quotation version id');
      return db.prepare('SELECT * FROM quotation_items WHERE quotation_version_id = ? ORDER BY created_at, id').all(versionId);
    },
    getProjectionSource(versionId) {
      assertId(versionId, 'quotation version id');
      const context = db.prepare(`
        SELECT
          qv.*,
          i.title AS inquiry_title,
          i.status AS inquiry_status,
          c.display_name AS customer_display_name,
          c.contact_name AS customer_contact_name
        FROM quotation_versions qv
        JOIN inquiries i ON i.id = qv.inquiry_id
        JOIN customers c ON c.id = i.customer_id
        WHERE qv.id = ?
      `).get(versionId);
      if (!context) return null;
      return {
        version: context,
        items: this.listItems(versionId),
        options: this.listOptions(versionId),
      };
    },
  };
}
