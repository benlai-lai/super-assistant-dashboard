import {
  assertCurrency,
  assertId,
  assertIsoDateTime,
  assertMinorUnits,
  ensureFound,
  runInTransaction,
} from './database.mjs';

export function createQuotationRepository(db) {
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
      assertCurrency(version.currency);
      assertMinorUnits(version.customerTotalMinor ?? 0, 'customer total');
      assertIsoDateTime(version.createdAt, 'createdAt');
      return runInTransaction(db, () => {
        ensureFound(db.prepare('SELECT id FROM inquiries WHERE id = ?').get(version.inquiryId), 'Unknown inquiry');
        db.prepare(`
          INSERT INTO quotation_versions
            (id, inquiry_id, version_number, status, currency, customer_total_minor, created_at, published_at)
          VALUES (?, ?, ?, 'draft', ?, ?, ?, NULL)
        `).run(
          version.id,
          version.inquiryId,
          version.versionNumber,
          version.currency,
          version.customerTotalMinor ?? 0,
          version.createdAt,
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
      return runInTransaction(db, () => {
        const version = requireDraftVersion(item.quotationVersionId);
        ensureFound(
          db.prepare('SELECT id FROM inquiry_items WHERE id = ? AND inquiry_id = ?').get(item.inquiryItemId, version.inquiry_id),
          'Inquiry item does not belong to quotation inquiry',
        );
        db.prepare(`
          INSERT INTO quotation_items
            (id, quotation_version_id, inquiry_item_id, description, quantity, customer_unit_price_minor, currency, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.id,
          item.quotationVersionId,
          item.inquiryItemId,
          item.description,
          item.quantity,
          item.customerUnitPriceMinor,
          item.currency,
          item.createdAt,
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
  };
}
