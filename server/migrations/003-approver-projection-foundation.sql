ALTER TABLE quotation_versions
  ADD COLUMN owner_actor_id TEXT
  CHECK (
    owner_actor_id IS NULL
    OR (length(owner_actor_id) BETWEEN 2 AND 81 AND owner_actor_id = trim(owner_actor_id))
  );

ALTER TABLE quotation_versions
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (approval_status IN ('PENDING','APPROVED','RETURNED'));

ALTER TABLE quotation_versions
  ADD COLUMN valid_until TEXT;

ALTER TABLE quotation_versions
  ADD COLUMN shipping_display TEXT;

ALTER TABLE quotation_versions
  ADD COLUMN locked_exchange_rate_micros INTEGER
  CHECK (
    locked_exchange_rate_micros IS NULL
    OR (typeof(locked_exchange_rate_micros) = 'integer' AND locked_exchange_rate_micros > 0)
  );

ALTER TABLE quotation_versions
  ADD COLUMN margin_minor INTEGER
  CHECK (margin_minor IS NULL OR typeof(margin_minor) = 'integer');

ALTER TABLE quotation_versions
  ADD COLUMN margin_rate_basis_points INTEGER
  CHECK (margin_rate_basis_points IS NULL OR typeof(margin_rate_basis_points) = 'integer');

ALTER TABLE quotation_versions
  ADD COLUMN internal_notes TEXT;

CREATE TABLE quotation_approvals (
  id TEXT PRIMARY KEY,
  quotation_version_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','RETURNED')),
  approver_actor_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) WITHOUT ROWID;

CREATE INDEX quotation_approvals_version_created_idx
  ON quotation_approvals(quotation_version_id, created_at, id);

-- Reject replacements before their implicit delete, even with recursive_triggers=0.
CREATE TRIGGER quotation_approvals_immutable_insert
BEFORE INSERT ON quotation_approvals
WHEN EXISTS (SELECT 1 FROM quotation_approvals WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'quotation approval records are immutable');
END;

CREATE TRIGGER quotation_approvals_immutable_update
BEFORE UPDATE ON quotation_approvals
BEGIN
  SELECT RAISE(ABORT, 'quotation approval records are immutable');
END;

CREATE TRIGGER quotation_approvals_immutable_delete
BEFORE DELETE ON quotation_approvals
BEGIN
  SELECT RAISE(ABORT, 'quotation approval records are immutable');
END;
