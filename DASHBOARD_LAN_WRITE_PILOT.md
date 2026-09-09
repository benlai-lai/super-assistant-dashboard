# Dashboard LAN Write Pilot

This document describes the isolated Phase A write pilot and the boundary for the future Phase B LAN trial. Phase A uses synthetic data only. It does not expose a LAN listener, install a certificate, change Windows Firewall, or enable production use.

## Phase A boundary

- Data root: an absolute, dedicated directory outside Git, GitHub Pages, and OneDrive.
- Database: SQLite schema version 4 in WAL mode, with `foreign_keys`, `recursive_triggers`, a 5-second busy timeout, and full synchronous writes.
- Accounts: locally managed accounts with scrypt password hashes. The pilot uses three independent `editor` accounts; passwords are entered or supplied at runtime and are never written to reports.
- Business data: customers, inquiries, and `inquiry_items` only. Delete, quotations, approvals, PDF, attachments, product catalogs, and LINE are not exposed by the pilot server or UI.
- Network: plaintext HTTP is accepted only when `testMode: true` and the listener is exactly `127.0.0.1`. Any non-loopback plaintext startup fails closed. HTTPS and cross-machine validation belong to Phase B.
- Compatibility: the existing V1/V2 static entries, existing HTTP server, and local readonly pilot keep their original entry points. Opening an existing schema v1–3 database applies migration 4 before repository use.

## Write contract

Every create or update requires an `Idempotency-Key`. Every update additionally requires a quoted positive `If-Match` row version. A repeated key with the same canonical operation and body returns the stored success result. Reusing a key with different content returns `409 idempotency_key_reused`.

For an update retry, a matching idempotency receipt is checked before the current row version. A new request with an old row version returns `409 stale_version` without changing business data, audit records, or receipts. Mutation, append-only audit entry, and successful idempotency receipt commit in one SQLite transaction.

Account disable and password reset increment `session_epoch`. Existing sessions are rejected and removed on the next protected request. Phase A does not claim push-based or instantaneous client notification.

## Local test startup

Set these process-only environment variables without saving them in a repository file:

```powershell
$env:DASHBOARD_PHASE_A_TEST_ROOT = 'C:\Users\Andy\AppData\Local\SuperAssistantDashboard\lan-write-pilot-a'
New-Item -ItemType Directory -Force -Path $env:DASHBOARD_PHASE_A_TEST_ROOT | Out-Null
$env:DASHBOARD_TEST_EDITOR_1_PASSWORD = '<enter a unique test password>'
$env:DASHBOARD_TEST_EDITOR_2_PASSWORD = '<enter a unique test password>'
$env:DASHBOARD_TEST_EDITOR_3_PASSWORD = '<enter a unique test password>'
npm run pilot:lan:test
```

The command prints only the loopback URL. Stop it with Ctrl+C. Do not use this HTTP entry for LAN access.

## Account and maintenance commands

Set `DASHBOARD_PILOT_DATA_ROOT` and `DASHBOARD_PILOT_DB` to absolute paths under the dedicated data root. Password input for `add` and `reset-password` is interactive.

```powershell
npm run pilot:admin -- add <actor-id> <username>
npm run pilot:admin -- disable <actor-id>
npm run pilot:admin -- reset-password <actor-id>
npm run pilot:admin -- list
npm run pilot:admin -- backup <absolute-backup-path>
npm run pilot:admin -- restore <absolute-backup-path>
```

Backup uses SQLite's online backup API and records a versioned SHA-256 manifest. It includes committed WAL state, account hashes, audit history, idempotency receipts, and the migration ledger. Restore is offline-only: stop the pilot first. The backup and manifest are verified before the live database, WAL, and SHM files are moved into a timestamped recovery directory. A backup path must differ from the live database path.

## Verification

```powershell
npm test
npm run lint
npm run build
npm audit --audit-level=high
npm run test:e2e
git diff --check
```

Playwright uses three isolated browser contexts to verify shared synthetic CRUD, optimistic conflict handling, restart persistence, and a 390px viewport. Those contexts are not evidence of three physical computers. Trace, HAR, video, and screenshots are disabled so authentication material is not retained.

The ZAP plan at `security/zap/lan-write-pilot.yaml` contains exactly eight anonymous fixed requests and passive scan waiting. It excludes authentication and all write bodies, and does not run spider, AJAX spider, or active scan. Its result is only a bounded anonymous passive observation—not complete authentication, authorization, API, TLS, or LAN security coverage.

## Phase B remains unexecuted

Before LAN use, an operator must separately confirm the Windows and Node versions, network profile and adapter, stable hostname/address, port availability, service/data/backup directory ACLs, certificate tooling, and client trust distribution. Phase B requires HTTPS, a narrowly scoped Windows Firewall rule, real cross-device testing on at least two physical client computers, documented certificate removal, firewall rollback, listener/service shutdown, and backup-restore rehearsal. None of those host or client changes are made by Phase A.
