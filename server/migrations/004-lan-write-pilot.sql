ALTER TABLE customers ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE customers SET updated_at = created_at;
ALTER TABLE customers ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(row_version) = 'integer' AND row_version > 0);

ALTER TABLE inquiries ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(row_version) = 'integer' AND row_version > 0);

ALTER TABLE inquiry_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE inquiry_items SET updated_at = created_at;
ALTER TABLE inquiry_items ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(row_version) = 'integer' AND row_version > 0);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_algorithm TEXT NOT NULL CHECK (password_algorithm = 'scrypt-v1'),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor','viewer','approver')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  session_epoch INTEGER NOT NULL DEFAULT 1 CHECK (session_epoch > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE idempotency_requests (
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, operation, idempotency_key),
  FOREIGN KEY (actor_id) REFERENCES accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

ALTER TABLE audit_logs ADD COLUMN actor_id TEXT;
ALTER TABLE audit_logs ADD COLUMN request_id TEXT;
ALTER TABLE audit_logs ADD COLUMN before_json TEXT;
ALTER TABLE audit_logs ADD COLUMN after_json TEXT;

CREATE TRIGGER audit_logs_reject_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;

CREATE TRIGGER audit_logs_reject_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;

CREATE TRIGGER audit_logs_reject_duplicate_insert
BEFORE INSERT ON audit_logs
WHEN EXISTS (SELECT 1 FROM audit_logs WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;
