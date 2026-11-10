# 05 — API Reference

[Documentation index](README.md) · Previous: [Database Design](04-Database-Design.md) · Next: [Installation Guide](06-Installation-Guide.md)

Developer reference for the NexusCore REST API. The **complete list of all 1,461 route handlers**
with their access requirement is in [Appendix — Endpoint Inventory](appendix-endpoint-inventory.md).
This page documents the conventions and the most important endpoints.

## 1. Base URL, versioning and documentation

| Item | Value | Source |
|---|---|---|
| Global prefix | `/api/v1` | `main.ts` → `app.setGlobalPrefix('api/v1')` |
| Default port | `4000` (`PORT`) | `main.ts` |
| Production base URL | `https://<host>/api/v1` behind the reverse proxy | `DEPLOYMENT.md` |
| OpenAPI / Swagger UI | `/api/docs` — on by default in development; in production only when `SWAGGER_ENABLED=true` | `main.ts` |
| WebSocket | Socket.IO namespace `/nexuscore`; send the access token in the handshake `auth.token` | `notifications.gateway.ts` |

Swagger reflects decorators in code, but most Legacy ERP endpoints accept `Record<string, any>`
bodies, so Swagger does **not** describe their request fields. For those, the service source file is
the reference.

## 2. Authentication

### 2.1 Sign in

`POST /api/v1/auth/login` — public, limited to 10 requests/minute.

```json
{ "email": "user@example.com", "password": "********" }
```

Optional fields accepted by `LoginDto`: `latitude`, `longitude`, `city`, `region`, `country`,
`timezone`, `device`, `browser`, `os`, `userAgent`, `ipAddress`. Any other field is rejected
(`forbidNonWhitelisted`).

Successful response (wrapped in the envelope, §3):

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "user": { "id": "…", "email": "…", "companyId": "…", "branchId": "…", "mustChangePassword": false, "company": { "…": "…" }, "branch": { "…": "…" } },
    "accessToken": "<JWT>",
    "refreshToken": "<JWT>"
  }
}
```

Errors: `401 Invalid credentials`, `401 Account is deactivated`, `403` with `TRIAL_EXPIRED` for an
expired trial company.

### 2.2 Using the token

Send `Authorization: Bearer <accessToken>` on every request. The JWT payload contains `sub` (user id),
`email`, `companyId`, `branchId` and issuer `iss` (`NEXUSCORE_JWT_ISSUER`, default `nexuscore`).
The strategy reloads the user on each request and rejects deactivated users.

| Token | Default lifetime | Variable |
|---|---|---|
| Access | 7 days | `NEXUSCORE_JWT_EXPIRES_IN` |
| Refresh | 30 days | `NEXUSCORE_JWT_REFRESH_EXPIRES_IN` |

### 2.3 Other auth endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/refresh` | Public (30/min) | Body `{ "refreshToken": "…" }` → new token pair |
| POST | `/auth/forgot-password` | Public (5 per 15 min) | Body `{ "email": "…" }`; always answers the same way |
| POST | `/auth/reset-password` | Public (10 per 15 min) | Body `{ "token": "…", "newPassword": "…" }` |
| POST | `/auth/change-password` | Signed-in (10/min) | Body `{ "newPassword": "…" }` (min. 6 characters) |
| POST | `/auth/logout` | Signed-in | Returns a message only — **the token is not revoked server-side** |
| GET | `/auth/me` | Signed-in | Current user profile |

## 3. Response envelope

All successful responses are wrapped by `ResponseInterceptor`:

```json
{ "success": true, "data": <payload>, "message": "OK", "meta": { } }
```

- An array payload becomes `data: [...]`.
- A payload object with `data`/`message`/`meta` keys is unpacked into the envelope.
- A payload that already has a `success` key is passed through unchanged.
- File downloads (attachments, report exports) write the response directly and are **not** wrapped.

## 4. Errors

`GlobalExceptionFilter` returns:

```json
{
  "success": false,
  "message": "Human-readable message",
  "errors": null,
  "meta": { "path": "/api/v1/…", "method": "POST", "timestamp": "2026-11-07T10:00:00.000Z", "errorId": "uuid (500s only)" }
}
```

| Status | When |
|---|---|
| 400 | Validation failure, business-rule violation, invalid paging, Prisma validation error, PostgreSQL `23502`/`22001`/`22P02`/`22003` |
| 401 | Missing/invalid/expired token (`Authentication required`) |
| 403 | Missing permission (`Insufficient permissions`), `PASSWORD_CHANGE_REQUIRED`, `TRIAL_EXPIRED`, legacy company not linked, self-approval |
| 404 | Not found — also returned for records of **another company** (never 403, so ids cannot be probed) |
| 409 | Unique conflicts (`P2002`, `23505`), still-referenced rows (`P2003`, `23503`), locked records, duplicates |
| 429 | Rate limit exceeded |
| 500 | Unexpected error — generic message plus `meta.errorId`; full details only in the server log |
| 503 | `/health/ready` when the database is unreachable |

## 5. Validation

The global `ValidationPipe` uses `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
and implicit type conversion. For endpoints with DTO classes (auth, users, PLM, dockets, cutting …)
unknown properties are rejected with 400. Legacy ERP endpoints mostly take plain objects and validate
inside the service (see the messages quoted in [03 — User Manual](03-Module-User-Manual.md)).

## 6. Pagination, search and sorting

Two conventions exist:

| Convention | Used by | Query parameters | Response |
|---|---|---|---|
| Legacy ERP paging (`list-paging.util.ts`) | Legacy ERP lists | `page` (≥1, enables paging), `pageSize` (1–500, default 50), `sortBy`, `sortDir` (`asc`/`desc`), plus `search` and screen filters | `{ rows, total, page, pageSize, pageCount, sortBy, sortDir }`; without `page` the full list is returned |
| Prisma services | PLM, dockets, costing … | `page` (default 1), `limit` (default 20), `search`, `status`, … | `{ data, meta: { total, page, … } }` (shape varies per service) |

## 7. Authorisation summary

| Access class | Count | Rule |
|---|---|---|
| Public | 16 | No token |
| Signed-in | 574 | Any authenticated user (GET routes default to this) |
| Permission | 862 | Role must grant `module:action` |
| Admin-only | 9 | `system:unclassified-write` — role, permission-settings and company-provisioning writes |

Counts include the 264 placeholder routes. See [07 — Security and Access](07-Security-and-Access.md).

## 8. Endpoint groups

| Group (prefix under `/api/v1`) | Routes | Notes |
|---|---|---|
| `auth` (7), `users` (11), `roles` (7), `permissions` (1), `permission-settings` (7), `settings` (7) | 40 | Identity and RBAC |
| `company` (3), `companies` (7), `branches` (6) | 16 | Company profile; platform-owner company provisioning and first administrator |
| `legacy-erp/*` | 366 | Legacy ERP (company-isolated) |
| `plm/*` (incl. `plm/costing-sheets`) | 222 | PLM definitions, cards, operations, costing |
| `dockets` (16), `docket-setup` (21), `docket-items` (9), `docket-documents` (3), `docket-reports` (6), `public` (5) | 60 | Docket management and public share/review pages |
| `report-builder/{plm,legacy-erp,docket}` | 33 | User-defined reports (CSV/XLSX/PDF export) |
| `reports` | 6 | Cutting reports and sustainability |
| `cutting-orders` (30), `fabric-types` (5), `fabric-rolls` (8), `bpm` (19) | 62 | Cutting orders and BPM |
| `approval` (6), `general-settings` (7), `audit` (5) | 18 | Approvals, settings, audit log |
| `menu-items` (5), `notifications` (4), `dashboard` (3), `health` (2), `upload` (2) | 16 | Platform services |
| CRM / collaboration: `catalog`, `collabs`, `communication`, `config`, `crm`, `documents`, `entities`, `feed`, `files`, `finance`, `fitness`, `logs`, `lookup`, `pipeline`, `projects`, `tables`, `whatsapp` | 358 | Inherited CRM platform |
| Placeholder (`StubsModule`, 42 prefixes such as `currencies`, `notes`, `smtp-settings`) | 264 | Return empty data — not functional |
| **Total** | **1,461** | |

Exact per-route paths: [Appendix](appendix-endpoint-inventory.md).

## 9. Key business endpoints (examples)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/legacy-erp/work-orders?search=&page=1&pageSize=50` | Signed-in | Work order list |
| GET | `/legacy-erp/work-orders/next-code` | Signed-in | Next work order number |
| POST / PUT / DELETE | `/legacy-erp/work-orders[/:id]` | `work-orders:create/update/delete` | Maintain work orders |
| PUT | `/legacy-erp/work-orders/:id/bom/:lineType` | `work-orders:update` | Save BOM lines (fabric/trim/ornament/process) |
| POST | `/legacy-erp/work-orders/:id/requirements/calculate` | `requirements:create` | Calculate requirements |
| POST | `/legacy-erp/work-orders/:id/requirements/lock` / `unlock` | `requirements:lock` / `requirements:unlock` | Lock control |
| POST | `/legacy-erp/inventory-receipts` | `inventory-receipts:create` | Create receipt |
| POST | `/legacy-erp/inventory-receipts/:id/approve` / `unapprove` | `approval:approve` | Approve / unapprove |
| POST | `/legacy-erp/inventory-receipts/:id/submit-for-approval` | `inventory-receipts:create` | Approval workflow |
| POST | `/legacy-erp/invoices/:receiptType/from-receipt/:receiptId` | `invoices:create` | Invoice from receipt |
| POST | `/legacy-erp/packing-lists/:id/approve` | `approval:approve` | Approve packing list |
| POST | `/plm/costing-sheets/:id/lock` / `unlock` | `costing:lock` / `costing:unlock` | Costing lock |
| POST | `/dockets/:id/share-links` | `dockets:create` | Create share link |
| GET | `/public/dockets/:token` | Public | Open a share link |
| POST | `/report-builder/legacy-erp/reports/:id/export` | `legacy-erp-reports:export` | Export report (body selects `csv`, `xlsx` or `pdf`) |
| GET | `/health`, `/health/ready` | Public | Liveness / readiness (DB check, 2 s timeout) |

Request bodies for Legacy ERP writes are the column-shaped objects used by the screens in
`frontend/lib/nexuscore-api.ts`; consult that client together with the matching
`nexuscore-backend/src/modules/legacy-erp/*.service.ts` when integrating.

## 10. Rate limits

| Scope | Limit | Source |
|---|---|---|
| Global, per signed-in user (or per IP when anonymous) | `THROTTLE_LIMIT` requests per `THROTTLE_TTL` seconds (defaults 600 / 60 s) | `app.module.ts`, `AppThrottlerGuard` |
| Login | 10 / min | `auth.controller.ts` |
| Refresh | 30 / min | 〃 |
| Forgot password | 5 / 15 min | 〃 |
| Reset password | 10 / 15 min | 〃 |
| Change password | 10 / min | 〃 |
| Health endpoints | not throttled | `health.controller.ts` |

## 11. Not verified

- Request/response bodies of individual endpoints were not exercised one by one in this audit;
  behaviour is covered only as far as the automated suites go ([08](08-Testing-and-Limitations.md)).
- WebSocket events and RabbitMQ queues listed in the older `nexuscore-backend/SETUP.md` were not
  re-verified at runtime.
