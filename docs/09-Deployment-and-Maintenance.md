# 09 — Deployment and Maintenance

[Documentation index](README.md) · Previous: [Testing and Limitations](08-Testing-and-Limitations.md) · Next: [Client Handover Checklist](10-Client-Handover-Checklist.md)

This procedure is taken from the repository's `DEPLOYMENT.md` and package scripts.
**No production deployment, upgrade or backup restore was performed or verified during this
handover.** Perform the procedure on a staging server first.

## 1. Target topology

Two Node.js processes behind one reverse proxy, one PostgreSQL database (diagram in
[02 — System Architecture §3](02-System-Architecture.md#3-deployment-topology)).

| Process | Command | Port | Bind |
|---|---|---|---|
| Backend API | `npm run start:prod -w nexuscore-backend` (`node dist/src/main`) | `PORT` (4000) | localhost |
| Frontend | `npm run start -w frontend -- -p 3000` (`next start`) | 3000 | localhost |
| Reverse proxy | IIS or Nginx | 443 | public |

## 2. First deployment

### 2.1 Prepare

1. Install Node.js 22 or 24 LTS and PostgreSQL 14+.
2. Create the database and a least-privilege login.
3. Obtain the release (tagged commit) and run `npm ci` at the repository root.

### 2.2 Configure

- `nexuscore-backend/.env` from `.env.example`, with **at least**: `NODE_ENV=production`,
  `NEXUSCORE_DATABASE_URL`, `NEXUSCORE_JWT_SECRET`, `NEXUSCORE_JWT_REFRESH_SECRET` (two different
  random values ≥ 32 characters — start-up fails otherwise), `APP_PUBLIC_URL`, SMTP settings,
  `QR_PUBLIC_BASE_URL` (recommended), `CORS_ORIGINS` (only for a separate API origin).
- Frontend build environment: `NEXT_PUBLIC_NEXUSCORE_API_URL=/api/v1` (same-origin setup).

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 2.3 Build

```bash
npm run build -w nexuscore-backend
NEXT_PUBLIC_NEXUSCORE_API_URL=/api/v1 npm run build -w frontend
```

On Windows PowerShell set the variable first: `$env:NEXT_PUBLIC_NEXUSCORE_API_URL="/api/v1"`.
The frontend `prebuild` step (`scripts/check-production-env.mjs`) aborts the build if the variable
is missing or points at localhost.

### 2.4 Database

```bash
cd nexuscore-backend
npm run db:deploy      # prisma migrate deploy
npm run db:setup       # company, branch, first administrator, roles/permissions, legacy company/workplace, menu, standard reports
```

Record the one-time administrator password printed by `db:setup` (unless `SEED_ADMIN_PASSWORD` was set).

### 2.5 Run under a process manager

Use a manager that restarts on crash and starts at boot: systemd or PM2 (Linux); a Windows service
wrapper (NSSM/WinSW) or PM2 (Windows). The backend shuts down gracefully on SIGTERM/SIGINT
(`app.enableShutdownHooks()`).

### 2.6 Reverse proxy

- Route `/api/*` → backend, everything else → frontend.
- Enable WebSocket upgrade for `/socket.io`.
- Forward `X-Forwarded-For`; keep `TRUST_PROXY=loopback` when the proxy runs on the same host.
- Allow request bodies of at least **10 MB**.
- Terminate TLS; add HSTS and other security headers here (the application does not set them globally).

### 2.7 Post-deployment checks

| Check | Expected |
|---|---|
| `GET https://<host>/api/v1/health` | `{"success":true,"data":{"status":"ok",…}}` |
| `GET https://<host>/api/v1/health/ready` | `status: "ready"`; 503 means the database is unreachable |
| Sign in as the administrator | Prompted to change the password |
| Open a Legacy ERP list (e.g. Warehouses) | Loads without *not linked to a legacy ERP company* |
| `GET /api/docs` | 404 (Swagger off in production) |
| Backend log at start-up | `NexusCore API running … (production)`; permission coverage report; RabbitMQ warning acceptable if not used |

## 3. Upgrades

1. Back up the database (§4) and `.env`.
2. Stop the application or put it in maintenance.
3. Deploy the new release, `npm ci`.
4. Rebuild backend and frontend (§2.3).
5. `npm run db:deploy` — applies only new migrations. The legacy baseline migration is skipped
   automatically where the legacy tables already exist.
6. `npm run db:setup` — idempotent; adds new menu items, permissions and standard reports.
7. Start both processes; run the checks in §2.7.

Rollback: Prisma migrations are forward-only. Roll back by restoring the pre-upgrade database backup
and redeploying the previous release.

## 4. Backups

From `DEPLOYMENT.md`:

- Nightly `pg_dump` of the database. Uploaded files and legacy attachments are stored **inside the
  database**, so the dump contains them. (Docket documents and file-manager media are stored as
  URLs — back up wherever those files are hosted.)
- WAL archiving or managed point-in-time recovery for finer recovery points.
- Copy backups off the server; back up `.env` separately and securely.
- **Test restores regularly.** No restore test was performed during this handover.

Example (adjust connection details; do not put passwords on the command line in shared logs):

```bash
pg_dump --format=custom --file=nexuscore_$(date +%Y%m%d).dump "<connection-string>"
pg_restore --clean --if-exists --dbname="<connection-string-of-restore-target>" nexuscore_YYYYMMDD.dump
```

`scripts/map-company-legacy-company.ts --apply` demands a `pg_dump` written within the last 60
minutes — follow the same discipline for any data-changing maintenance script.

## 5. Logs and monitoring

| Source | Content | Where |
|---|---|---|
| Backend stdout/stderr | Start-up, warnings, errors (`log`, `error`, `warn` in production; `debug` in development). Unexpected errors carry an `errorId` matching the client response | Captured by the process manager |
| Frontend stdout/stderr | Next.js server output | Process manager |
| `AuditLog` table | Business create/update/delete/approve actions | *Log Tracking* screen (`/<company-slug>/administration/log-tracking`) |
| Exception logs | Client-reported errors (`/api/v1/logs/exceptions`) | `logs:read` |
| Login history | `/api/v1/logs/login-history` (`logs:read`) | API (the *Login History* screen itself is a placeholder) |
| Health | `/api/v1/health`, `/api/v1/health/ready` | Uptime monitor |

Recommended: rotate process-manager logs, alert on `/health/ready` failures and on repeated 5xx.

## 6. Routine maintenance

| Frequency | Task |
|---|---|
| Daily | Check backups completed; check health monitor |
| Weekly | Review error logs (`errorId`s), failed sign-ins, disk space |
| Monthly | Review users and role assignments; deactivate leavers; apply OS and PostgreSQL patches |
| Quarterly | Test a full restore on a separate server; review `npm audit` output for both workspaces in a test environment |
| Each release | Follow §3; run the test suites in [08](08-Testing-and-Limitations.md) on staging |

## 7. Maintenance scripts in the repository

| Script | Purpose | In `db:setup`? |
|---|---|---|
| `scripts/seed-*-menu-item.ts`, `seed-*-standard-reports.ts`, `seed-approval-permissions.ts` | Idempotent menu / report / permission seeding | Yes |
| `scripts/map-company-legacy-company.ts` | Map or create a legacy company for a NexusCore company | No (manual, dry-run default) |
| `scripts/fix-fabric-card-yarn-names.ts` | One-off data repair | No |
| `scripts/reorganize-menu-modules.ts` | Menu reorganisation keyed by development ids — **not safe on other databases** | No |
| `scripts/seed-invoice-menu-items.ts`, `seed-forex-currencies.ts`, `install-*-report.ts`, `add-manufacturing-quality-types.ts`, `link-standard-route-legacy-processes.ts`, `mark-fabric-type-cards-coming.ts` | Targeted seeding/installation scripts | No — review each before use |
| `npm run smtp:verify` | Checks the SMTP connection without sending mail | — |

Read every script before running it against production data and take a backup first.
