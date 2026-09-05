CREATE TABLE product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(name) BETWEEN 1 AND 100 AND name = trim(name)),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT,
  CHECK (
    (status = 'ACTIVE' AND deactivated_at IS NULL)
    OR (status = 'INACTIVE' AND deactivated_at IS NOT NULL)
  )
);

ALTER TABLE quotation_items
  ADD COLUMN product_category_id TEXT
  REFERENCES product_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE INDEX quotation_items_product_category_id_idx
  ON quotation_items(product_category_id);
