# 06 — Installation Guide

[Documentation index](README.md) · Previous: [API Reference](05-API-Reference.md) · Next: [Security and Access](07-Security-and-Access.md)

This guide covers a **development / evaluation installation**. Production deployment is in
[09 — Deployment and Maintenance](09-Deployment-and-Maintenance.md). Every command below exists in
the repository's `package.json` files; nothing here has been invented. The commands were **not**
re-run from a clean machine during this handover (the audit machine already had an installation).

> The older `nexuscore-backend/SETUP.md` is partly out of date (it lists port 3000 for the API and
> fixed seed credentials). Where it disagrees with this guide, follow this guide and `DEPLOYMENT.md`.

## 1. Prerequisites

| Software | Version | Notes |
|---|---|---|
| Node.js | 22 LTS or 24 LTS | `DEPLOYMENT.md`; the audit machine ran v24.19.0 with npm 11.17.0 |
| npm | bundled with Node.js | Workspaces are used (`npm ci` at the repository root) |
| PostgreSQL | 14 or newer | One database for the application; tests create a separate `*_test` database |
| Git | any recent | To obtain the source |
| RabbitMQ | 3.12+ (optional) | The API starts without it |
| SMTP account | optional | Needed for password-reset and invitation e-mails |
| Browser | current Chrome, Edge or Firefox | Not formally tested per browser |

Hardware: no sizing was established. The repository notes one development machine with 7.75 GB RAM
on which starting both dev servers at once was slow (`scripts/dev-all.mjs`).

## 2. Get the source and install dependencies

```bash
git clone <repository-url> Nexus-Core-Project
cd Nexus-Core-Project
npm ci            # installs both workspaces from package-lock.json
```

## 3. Create the database

```sql
CREATE DATABASE nexuscore_db;
-- optional, recommended: a dedicated login with rights on this database only
```

Set the database server time zone to the same zone as the application server (see
[04 — Database Design §7](04-Database-Design.md#7-data-maintenance-rules)).

## 4. Configure the backend

```bash
cd nexuscore-backend
cp .env.example .env
```

Edit `.env`. Minimum for development:

| Variable | Example / default | Required | Notes |
|---|---|---|---|
| `NEXUSCORE_DATABASE_URL` | `postgresql://<user>:<password>@localhost:5432/nexuscore_db` | **Yes** | Optional `?connection_limit=N` |
| `PORT` | `4000` | No | API port |
| `NODE_ENV` | `development` | No | `production` enables strict secret checks and hides Swagger |
| `NEXUSCORE_JWT_SECRET`, `NEXUSCORE_JWT_REFRESH_SECRET` | random, ≥ 32 characters, different | **Yes in production** | Development generates a random per-process secret if missing (sessions end at every restart) |
| `NEXUSCORE_JWT_EXPIRES_IN` / `_REFRESH_EXPIRES_IN` | `7d` / `30d` | No | Token lifetimes |
| `NEXUSCORE_JWT_ISSUER` | `nexuscore` | No | |
| `CORS_ORIGINS` | `http://localhost:3000` (default when unset) | No | Comma-separated browser origins |
| `APP_PUBLIC_URL` | `https://erp.example.com` | For e-mail | Used in password-reset links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — / `587` / `false` | For e-mail | Fallback when no active SMTP setting exists in the database |
| `UPLOAD_MAX_MB` | `10` | No | Also bounded by the 10 MB request body limit |
| `SWAGGER_ENABLED` | unset | No | Development: on unless `false`; production: off unless `true` |
| `THROTTLE_TTL`, `THROTTLE_LIMIT` | `60`, `600` | No | Global rate limit |
| `TRUST_PROXY` | `loopback` | No | Reverse-proxy trust for real client IPs |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_COMPANY_NAME`, `SEED_BRANCH_NAME`, `SEED_WORKPLACE_NAME` | — | No | Used by `db:setup` only when the admin does not exist yet |
| `NEXUSCORE_RABBITMQ_URL`, `NEXUSCORE_RABBITMQ_EXCHANGE` | — / `nexuscore.events` | No | |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION` | — / `v17.0` | No | WhatsApp |

Variables read by the code but **not listed in `.env.example`** (add them if needed):

| Variable | Effect | Default |
|---|---|---|
| `COMPANY_TRIAL_DAYS` | Default trial length (1–365 days) when creating a trial company | none (no default trial length) |
| `FIRST_ADMIN_INVITE_TTL_HOURS` | Validity of the first-administrator set-password link (1–168 h) | 72 h |
| `QR_PUBLIC_BASE_URL` | Public https address encoded into Serial Card QR labels | the address the browser opened the ERP on — **set it in production** so labels stay valid |
| `META_VERIFY_TOKEN` | WhatsApp webhook verification token | a built-in fallback value — **set your own** |
| `SEED_COMPANY_SLUG` | Slug of the seeded company | derived from the company name |
| `NEXUSCORE_PRINT_ROUTE_PERMISSIONS` | `1` prints the route → permission table at start-up | off |

Never commit `.env` files; keep real values out of documentation and tickets.

## 5. Configure the frontend

Development uses `frontend/.env.local`:

```env
NEXT_PUBLIC_NEXUSCORE_API_URL=http://localhost:4000/api/v1
```

For production builds see `frontend/.env.production.example`: `NEXT_PUBLIC_NEXUSCORE_API_URL` is
**required at build time** (`/api/v1` for same-origin hosting). The build refuses a localhost URL
unless `ALLOW_LOCALHOST_API_URL=true` (`frontend/scripts/check-production-env.mjs`).
`NEXT_PUBLIC_*` values are compiled into the bundle — rebuild after changing them.

## 6. Create the schema and initial data

```bash
cd nexuscore-backend
npm run prisma:generate      # generate the Prisma client
npm run db:deploy            # prisma migrate deploy — all 48 migrations incl. the legacy ERP baseline
npm run db:setup:dev         # development: company, branch, admin, roles, permissions, legacy company/workplace, menus, standard reports
```

For a compiled (production-style) setup use `npm run build` then `npm run db:setup`
(runs `dist/prisma/setup.js`).

`db:setup` is idempotent. If `SEED_ADMIN_PASSWORD` is not set it prints a **one-time administrator
password once** — record it securely. The administrator must change it at first sign-in.

## 7. Start the application (development)

From the repository root:

```bash
npm run dev            # starts the backend, waits until :4000 listens, then the frontend on :3000
# or separately
npm run dev:backend    # nest start --watch on :4000
npm run dev:frontend   # Next.js dev supervisor on :3000
```

Open `http://localhost:3000` and sign in with the administrator account.

| URL | Purpose |
|---|---|
| `http://localhost:3000` | Application |
| `http://localhost:4000/api/v1/health` | API liveness |
| `http://localhost:4000/api/v1/health/ready` | API + database readiness |
| `http://localhost:4000/api/docs` | Swagger UI (development) |

## 8. Link the legacy ERP company

Legacy ERP screens require `Company.legacyCompanyId` to point at an active `MD_Company` row with an
active `MD_Workplace`. `db:setup` creates the legacy company/workplace for the seeded company. For an
existing database run `scripts/map-company-legacy-company.ts` from `nexuscore-backend/` (dry run by default;
`--apply` additionally requires `--backup=<pg_dump file written in the last 60 minutes>`):

```bash
npx ts-node -T scripts/map-company-legacy-company.ts --company=<slug> --legacy=<MD_Company RecId>
npx ts-node -T scripts/map-company-legacy-company.ts --company=<slug> --create --code=<C00n> --workplace-code=<W00n>
```

## 9. Verify the installation

```bash
npm run typecheck                      # root: backend + frontend type checks
npm run test:company-isolation -w nexuscore-backend   # example DB-backed suite (uses a separate *_test database)
```

See [08 — Testing and Limitations](08-Testing-and-Limitations.md) for all suites.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Startup failed: NEXUSCORE_JWT_SECRET is not set / is a known placeholder / is shorter than 32 characters` | Production mode without proper secrets | Set two different random secrets ≥ 32 characters |
| `prestart:dev` reports the port is in use | Another backend/frontend already runs on 4000/3000 | Stop the other process (`scripts/ensure-port-free.mjs` refuses duplicates) |
| Frontend build fails on `NEXT_PUBLIC_NEXUSCORE_API_URL` | Variable missing or localhost | Set it in the build environment |
| Legacy ERP screens answer *not linked to a legacy ERP company* | `Company.legacyCompanyId` empty | Run `db:setup` (new DB) or map the company |
| Migration `…legacy_erp_baseline` appears to do nothing | Legacy tables already exist | Expected — it is guarded and only recorded |
| Pages intermittently 404 in development | Stale Next.js dev route table | Restart the frontend dev server (`npm run dev:clean-cache -w frontend` trims the cache) |
| Password-reset e-mail never arrives | No SMTP configured (the *SMTP Settings* screen is a placeholder) | Set `SMTP_*` variables; `npm run smtp:verify -w nexuscore-backend` checks the connection without sending |
| `ECONNREFUSED` to RabbitMQ in the log | RabbitMQ not running | Ignore (optional) or start RabbitMQ |
