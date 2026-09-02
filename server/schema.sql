PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO app_meta (key, value, updated_at)
VALUES ('schema_version', '1', '1970-01-01T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active','closed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inquiry_items (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS quotation_versions (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft','published','void')),
  currency TEXT NOT NULL,
  customer_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (typeof(customer_total_minor) = 'integer' AND customer_total_minor >= 0),
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (inquiry_id, version_number),
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS quotation_options (
  id TEXT PRIMARY KEY,
  quotation_version_id TEXT NOT NULL,
  label TEXT NOT NULL,
  customer_price_minor INTEGER NOT NULL CHECK (typeof(customer_price_minor) = 'integer' AND customer_price_minor >= 0),
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  quotation_version_id TEXT NOT NULL,
  inquiry_item_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  customer_unit_price_minor INTEGER NOT NULL CHECK (typeof(customer_unit_price_minor) = 'integer' AND customer_unit_price_minor >= 0),
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (inquiry_item_id) REFERENCES inquiry_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cost_estimates (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  inquiry_item_id TEXT,
  supplier_label TEXT,
  estimated_cost_minor INTEGER NOT NULL CHECK (typeof(estimated_cost_minor) = 'integer' AND estimated_cost_minor >= 0),
  currency TEXT NOT NULL,
  internal_notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (inquiry_item_id) REFERENCES inquiry_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cost_allocations (
  id TEXT PRIMARY KEY,
  cost_estimate_id TEXT NOT NULL,
  quotation_item_id TEXT NOT NULL,
  allocated_cost_minor INTEGER NOT NULL CHECK (typeof(allocated_cost_minor) = 'integer' AND allocated_cost_minor >= 0),
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (cost_estimate_id) REFERENCES cost_estimates(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (quotation_item_id) REFERENCES quotation_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('inquiry','inquiry_item','quotation_version','quotation_item','cost_estimate')),
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('internal','customer')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pdf_documents (
  id TEXT PRIMARY KEY,
  quotation_version_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','generated','void')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('planned','completed','failed')),
  target_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

