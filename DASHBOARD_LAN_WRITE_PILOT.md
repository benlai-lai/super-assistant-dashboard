# Dashboard LAN Write Pilot

This document describes the isolated Phase A write pilot and the boundary for the future Phase B LAN trial. Phase A uses synthetic data only. It does not expose a LAN listener, install a certificate, change Windows Firewall, or enable production use.

## Phase A boundary

- Data root: an absolute, dedicated non-volume-root directory outside every Git worktree and every OneDrive variant. Existing path components must not be symlinks or junctions, and the path is revalidated immediately before the database opens.
- Database: SQLite schema version 4 in WAL mode, with `foreign_keys`, `recursive_triggers`, a 5-second busy timeout, and full synchronous writes.
- Accounts: locally managed accounts with scrypt password hashes. The pilot uses three independent `editor` accounts; passwords are entered or supplied at runtime and are never written to reports.
- Business data: customers, inquiries, and `inquiry_items` only. Delete, quotations, approvals, PDF, attachments, product catalogs, and LINE are not exposed by the pilot server or UI.
- Network: plaintext HTTP is accepted only when `testMode: true` and the listener is exactly `127.0.0.1`. Any non-loopback plaintext startup fails closed. HTTPS and cross-machine validation belong to Phase B.
- Compatibility: the existing V1/V2 static entries, existing HTTP server, and local readonly pilot keep their original entry points. Opening an existing schema v1–3 database applies migration 4 before repository use.

## Write contract

Every create or update requires an `Idempotency-Key`. Every update additionally requires a quoted positive `If-Match` row version. A key is unique for an actor across all operations. A repeated key with the same canonical operation and body returns the stored success result. Reusing a key for different content or a different operation returns `409 idempotency_key_reused`.

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

The command prints only the loopback URL. Stop it with Ctrl+C. Do not use this HTTP entry for LAN access. If a pilot editor ID already exists, startup verifies its exact username, active editor role, and the supplied password; a stale password or mismatched identity fails closed instead of being silently reused.

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

Backup uses SQLite's online backup API and records a versioned SHA-256 manifest. It includes committed WAL state, account hashes, audit history, idempotency receipts, and the migration ledger. Restore is offline-only: stop the pilot first. Before any live file moves, restore verifies the file hash and byte count, manifest schema and migration versions, current registered migration names and checksums, the complete application schema fingerprint, foreign keys, and SQLite integrity. A backup path must differ from the live database path.

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

The ZAP plan at `security/zap/lan-write-pilot.yaml` contains exactly eight anonymous fixed requests, passive scan waiting, a JSON report job, and an exit-status gate that fails on Medium or High alerts. It excludes authentication and all write bodies, and does not run spider, AJAX spider, or active scan. The wrapper requires a new or empty absolute result root, uses a separate disposable ZAP home, rejects URL credentials/query/fragment, runs with `-silent`, and accepts only exit code 0. Its result is only a bounded anonymous passive observation—not complete authentication, authorization, API, TLS, or LAN security coverage.

The static `lan-pilot/` files may be visible through GitHub Pages, but they are not a working login endpoint there. Asset URLs are repository-subpath-safe, login controls have no native form submission fallback, and credentials remain disabled unless the Phase A server injects the runtime marker into the served HTML. Every subsequent API response must also carry the expected pilot response header.

## Phase B remains unexecuted

Before LAN use, an operator must separately confirm the Windows and Node versions, network profile and adapter, stable hostname/address, port availability, service/data/backup directory ACLs, certificate tooling, and client trust distribution. Phase B requires HTTPS, a narrowly scoped Windows Firewall rule, real cross-device testing on at least two physical client computers, documented certificate removal, firewall rollback, listener/service shutdown, and backup-restore rehearsal. None of those host or client changes are made by Phase A.

## Phase B HTTPS launcher (code preparation only)

Temporary trial host: `LAPTOP-BFIEIE3U`. This is not a production placement decision.
Planned URL: `https://192.168.1.101:8443/lan-pilot/`. The second physical client is not yet designated; it does not block code preparation. Host configuration, certificate issuance/trust, firewall changes and LAN startup require separate authorization.

The dedicated launcher accepts an explicit IPv4 bind address assigned to this host. It rejects wildcard, multicast, hostnames, IPv6 and unassigned addresses. Port defaults to 8443; an explicit port must be 1–65535 (no ephemeral port 0). It does not auto-discover or select a LAN interface.

All five paths (`--data-root`, `--db`, `--tls-root`, `--cert`, `--key`) must be explicit absolute local paths. Existing dedicated roots and files must be outside Git and OneDrive/configured sync roots, with no symlink/junction/reparse components. Volume roots, UNC/device paths, traversal and alternate streams are rejected. TLS files and DB must be distinct regular files, not hard links. The database must already exist: this launcher does not seed accounts or create a new pilot database. Existing database migrations remain the underlying pilot behavior, so use only a separately approved synthetic schema-v4 database and its backup. Check private-key, data and backup ACLs during the later host-configuration gate; this launcher does not change ACLs.

TLS is mandatory. Before opening the DB, the launcher checks readable certificate/private-key files, certificate validity dates, IP SAN matching the bind address, key pairing and a TLS context with minimum TLS 1.2. Encrypted private keys are unsupported; no passphrase argument is accepted. Issuer/client trust is a separate client-configuration check. The launcher logs only lifecycle states and the endpoint, never raw exceptions, passwords or TLS material. It neither creates certificates nor modifies certificate stores.

After separate host-configuration and LAN-start authorization, use this command template with the approved existing synthetic DB and certificate paths (do not execute during code preparation):

```powershell
node scripts/start-lan-pilot-https.mjs --host 192.168.1.101 --port 8443 --data-root 'C:\DashboardPhaseB\data' --db 'C:\DashboardPhaseB\data\pilot.sqlite3' --tls-root 'C:\DashboardPhaseB\tls' --cert 'C:\DashboardPhaseB\tls\server.pem' --key 'C:\DashboardPhaseB\tls\server.key'
```

Expected output: `phase_b=STARTING`, `phase_b=RUNNING`, and the exact HTTPS URL. `phase_b=FAILED` means startup was refused; do not bypass validation or switch to HTTP. Inspect the explicit arguments, approved path metadata, certificate dates/SAN and local address without printing secrets. The existing Phase A response header/runtime marker is retained for compatibility with the shared UI; transport is HTTPS and session cookies are Secure.

Stop with Ctrl+C (SIGINT), or SIGTERM where supported. Output becomes `STOPPING`, then `STOPPED` after listener and DB closure. Concurrent stop requests share one shutdown. Requests may drain for up to five seconds; remaining connections are destroyed so an incomplete TLS handshake cannot hold the port indefinitely. Verify the process exits and the port is no longer listening before backup/restore or restart.

Rollback for this code stage is to leave the launcher stopped and retain the previous checkout; no host configuration was changed. During a later authorized host trial, stop the launcher first, retain the synthetic DB/backup, and separately revoke the exact trial firewall rule and remove only the recorded trial certificate/trust entries under that gate. Do not delete an entire certificate store, change network profiles, remove unrelated ACLs, or fall back to a LAN HTTP listener. No service is installed by this launcher.

Loopback-only verification:

```powershell
node --test tests/lan-https-launcher.test.mjs
npm test
npm run lint
npm run build
npm audit --audit-level=high
git diff --check
```

Tests require OpenSSL (`openssl` on PATH on Unix; Git for Windows bundled OpenSSL by default; override executable with `DASHBOARD_TEST_OPENSSL`). They generate disposable one-day self-signed loopback test material in a dedicated OS temporary directory and remove it at completion. No test private key is committed or emitted as evidence. Tests never bind to the planned LAN address. Passing these checks establishes launcher code readiness only; host configuration, trusted-client TLS, real cross-device write validation and production readiness remain `UNKNOWN`.
