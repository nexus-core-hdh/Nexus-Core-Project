# NexusCore — production deployment

Two Node.js processes behind one reverse proxy, one PostgreSQL database.

```
browser ──► IIS / Nginx (TLS)  ──  /          ──► frontend  (next start, :3000)
                               └─  /api/*     ──► backend   (node dist/src/main, :4000)
                                                     └──► PostgreSQL
```

Requirements: Node.js 22 LTS or 24 LTS, PostgreSQL 14+, `npm ci` at the repository root (workspaces).

## 1. Configure

- `nexuscore-backend/.env` — copy from `nexuscore-backend/.env.example`. Required: `NODE_ENV=production`,
  `NEXUSCORE_DATABASE_URL`, `NEXUSCORE_JWT_SECRET`, `NEXUSCORE_JWT_REFRESH_SECRET` (two different random
  values, 32+ characters — the backend refuses to start otherwise), `APP_PUBLIC_URL`, and SMTP settings
  (or an active SMTP setting in the app) so password-reset emails can be sent.
- Frontend build environment — see `frontend/.env.production.example`. `NEXT_PUBLIC_NEXUSCORE_API_URL`
  is required at build time (`/api/v1` for the same-origin setup above); the build fails without it.

## 2. Build

```
npm run build -w nexuscore-backend
NEXT_PUBLIC_NEXUSCORE_API_URL=/api/v1 npm run build -w frontend
```

## 3. Database (new installation)

```
cd nexuscore-backend
npm run db:deploy     # prisma migrate deploy — creates every table, including the legacy ERP schema
npm run db:setup      # company, branch, first administrator, roles/permissions, legacy company/workplace, menu
```

`db:setup` is idempotent (safe to re-run). Without `SEED_ADMIN_PASSWORD` it prints a one-time administrator
password once; the administrator must change it at first sign-in. Existing installations: run
`npm run db:deploy` on every upgrade (the legacy baseline migration is skipped automatically where the
legacy tables already exist).

## 4. Run (under a process manager)

```
cd nexuscore-backend && npm run start:prod          # listens on PORT (4000)
cd frontend && npm run start -- -p 3000
```

Use a process manager that restarts on crash and starts at boot — systemd or PM2 on Linux; a Windows
service (NSSM/WinSW) or PM2 on Windows. The backend shuts down gracefully on SIGTERM/SIGINT.

## 5. Reverse proxy

- `/api/*` → backend, everything else → frontend; enable WebSocket upgrade for `/socket.io`.
- Forward `X-Forwarded-For` (the backend trusts a proxy on the same machine by default — `TRUST_PROXY`).
- Allow request bodies of at least 10 MB (uploads). Terminate TLS here.
- Bind the backend and frontend to localhost so they are only reachable through the proxy.

## 6. Roles and permissions

The first administrator has every permission. All other users need a role: create roles in the
Role/Permission screen and grant the `module:action` permissions they need (e.g. `work-orders:create`,
`purchase-orders:update`). Signed-in users can read data; creating, changing and deleting records
requires the matching permission, enforced by the API.

## 7. Backups

Nightly `pg_dump` (uploaded files are stored in the database) plus WAL archiving or managed
point-in-time recovery, copied off the server; test restores regularly. Back up `.env` separately.
