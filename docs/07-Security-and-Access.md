# 07 — Security and Access

[Documentation index](README.md) · Previous: [Installation Guide](06-Installation-Guide.md) · Next: [Testing and Limitations](08-Testing-and-Limitations.md)

All statements are from source review on 2026-11-07. **No penetration test or external security
assessment was performed.** Items in §8 are confirmed by reading the code; they were not exploited
or tested at runtime unless stated.

## 1. Authentication

| Control | Implementation | Source |
|---|---|---|
| Password storage | bcrypt hash (cost 10) | `auth.service.ts` |
| Sign-in | E-mail + password; e-mail lower-cased; deactivated users refused | `auth.service.ts` |
| Tokens | Signed JWT access token (default 7 days) and refresh token (default 30 days) with separate secrets and an issuer claim | `auth.service.ts`, `config/jwt.config.ts` |
| Secret strength | Production refuses to start when a JWT secret is missing, shorter than 32 characters, a known placeholder or both secrets are equal | `config/jwt.config.ts` |
| Per-request check | Token verified, user reloaded from the database, inactive users rejected; file-view scoped tokens rejected outside downloads | `strategies/jwt.strategy.ts` |
| Forced password change | `mustChangePassword` (default true for new users) blocks every route except those marked `@AllowDuringPasswordChange` | `roles.guard.ts` |
| Password policy | Minimum 6 characters; no complexity, history or expiry rules | `dto/change-password.dto.ts` |
| Password reset | 32-byte random token, stored as SHA-256 hash, valid 30 minutes, 60-second resend cool-down; response never reveals whether the account exists | `password-reset.service.ts` |
| Brute-force protection | Rate limits (login 10/min, forgot-password 5/15 min, reset 10/15 min); no account lockout | `auth.controller.ts` |
| Trial companies | Users of a company whose trial has ended get 403 `TRIAL_EXPIRED` at sign-in, refresh and on API calls; the platform-owner company is exempt | `common/company-trial.ts` |
| Session storage (browser) | Access token kept in `localStorage` (`auth_token`) and mirrored into an `auth_token` cookie set by JavaScript (`SameSite=Lax`) | `frontend/lib/auth.ts` |

## 2. Authorisation (RBAC)

Model: `User` → `UserRole` → `Role` → `RolePermission` → `Permission(module, action)`.

Rules applied to **every** HTTP route by `RolesGuard` (single source of truth
`resolveRequiredPermissions()` in `permissions.decorator.ts`):

1. `@Public()` → no sign-in.
2. Explicit `@Permissions({module, action})` → all listed permissions required.
3. `@AllowAuthenticated()` → any signed-in user.
4. `GET` without explicit permission → any signed-in user.
5. `POST` / `PUT` / `PATCH` / `DELETE` → `<module>:create` / `update` / `delete` of the controller's
   `@PermissionModule`.
6. Unclassified writes → `system:unclassified-write`, held only by system ("Full access") roles.

At start-up the API upserts every permission referenced by a route into the `Permission` table and
grants it to system roles (`main.ts`). **There is no screen for creating roles or granting
permissions to them**: the frontend only lists roles (`rolesApi.getRoles`) and assigns an existing
role to a user. Roles are created and granted through `POST /api/v1/roles` and
`PUT /api/v1/roles/:id/permissions` (Admin only). `DEPLOYMENT.md` §6 refers to a "Role/Permission
screen"; the existing *Permission settings* page manages a different, CRM-level model
(`PermissionSetting`) and does not change RBAC. Setting `NEXUSCORE_PRINT_ROUTE_PERMISSIONS=1` prints the full route → permission table.

**Important consequence:** read access is broad. Any signed-in user can call most `GET` endpoints
of their company (for example lists of users, work orders, receipts, audit logs) regardless of role.
Only writes and explicitly protected reads (e.g. `users:read` on `/settings/:userId`, `logs:read`,
report `view`/`export`, approval queues) are permission-checked.

### 2.1 Seeded roles and permission modules

`db:setup` creates the **Admin** role (`isSystem = true`, "Full access") with all permissions and
assigns it to the first administrator. No other roles are seeded; the client must create them.

Permission modules found in the code: `approval`, `bpm`, `catalog`, `collaboration`, `communication`,
`company`, `contracts`, `costing`, `crm`, `crm-settings`, `current-accounts`, `cutting`,
`cutting-cards`, `dockets`, `docket-reports`, `fabric`, `fabric-cards`, `files`, `finance`,
`financial-receipts`, `fitness`, `general-settings`, `inventory-receipts`, `invoices`,
`item-allocation`, `legacy-erp-reports`, `logs`, `master-data`, `menu`, `order-manufacturing`,
`orders`, `packing-lists`, `plm`, `plm-reports`, `purchase-orders`, `receipts`, `requirements`,
`roles`, `serial-cards`, `settings`, `system`, `trim-cards`, `trim-inventory-cards`, `users`,
`warehouses`, `whatsapp`, `work-orders`, `yarn-cards`.

Special actions beyond create/update/delete: `approval:approve|reject|view-pending|view-history`,
`requirements:lock|unlock`, `costing:lock|unlock`, `roles:manage`, `users:read`, `logs:read`,
`general-settings:manage-approval-configuration|manage-screen-parameters`, `<report-module>:view|export`.

### 2.2 Suggested role design (for client decision)

| Role | Typical permissions |
|---|---|
| Viewer | none beyond sign-in (read access is implicit) |
| Store keeper | `inventory-receipts:*`, `serial-cards:*`, `packing-lists:*`, `item-allocation:*` |
| Purchasing | `purchase-orders:*`, `orders:*`, `contracts:*`, `current-accounts:*` |
| Production planner | `work-orders:*`, `requirements:create|delete|lock`, `order-manufacturing:update`, `cutting-cards:*` |
| Merchandiser / PLM | `plm:*`, `costing:create|update|lock`, `dockets:*`, `plm-reports:view|export` |
| Approver | `approval:approve|reject|view-pending|view-history`, `requirements:unlock`, `costing:unlock` |
| Administrator | Admin (system role) |

This is a recommendation only; it is not configured in the system.

## 3. Multi-company isolation

| Layer | Control |
|---|---|
| Legacy ERP (`/legacy-erp/*`) | `LegacyCompanyGuard` resolves `Company.legacyCompanyId` → active `MD_Company` + first active `MD_Workplace` before any handler; fails closed with 403 if unmapped or invalid. Services filter by `CompanyId`, validate linked records (`assertSameCompany`, `assertOwnedRow`) and answer **404** for other companies' ids. Covered by 43 tests in `test/company-isolation`, including a real sign-in HTTP test |
| Shared legacy masters | Rows with `CompanyId IS NULL` (processes, quality types, size sets, item groups, unit sets) are visible to all companies by design |
| Prisma modules | PLM, costing and docket **lists** are filtered by the user's `branchId`; the user list is filtered only by a client-supplied `companyId` (see S11) |
| Roles and permissions | **Instance-wide** (no company column) |
| Company provisioning | Only the platform-owner company may set up another company's first administrator |

## 4. Data protection

| Area | Status |
|---|---|
| Transport | TLS is expected at the reverse proxy (`DEPLOYMENT.md`); the application itself serves plain HTTP |
| Data at rest | Not encrypted by the application; rely on database/disk encryption |
| Error responses | Unexpected errors return a generic message with an `errorId`; SQL/stack details go to the server log only |
| Uploads | Extension allow-list and content checks, size limit (`UPLOAD_MAX_MB`, default 10 MB); downloads sent with `X-Content-Type-Options: nosniff`, active content forced to download, `Content-Security-Policy: default-src 'none'; sandbox` |
| Secrets in source | `.env` files are git-ignored per workspace; `.env.example` contains placeholders only |
| Audit trail | `AuditLog` records entity, action, old/new values, user, company, screen and document no. — viewable in *Log Tracking* |
| Swagger | Disabled in production unless `SWAGGER_ENABLED=true` |
| Security headers | Only on file downloads; no global security-header middleware (e.g. HSTS, frame options) — configure at the reverse proxy |

## 5. Public endpoints

| Endpoint | Protection |
|---|---|
| `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/settings/password-reset/*` | Rate limits; reset tokens hashed and short-lived |
| `/health`, `/health/ready` | Return status and uptime only (readiness error includes the DB error text) |
| `/public/dockets/:token[...]`, `/public/review/:token[...]` | Unguessable UUID token, expiry, optional password, deactivation; access count logged |
| `/upload/:id` | Authenticates inside `FileAccessGuard` (header, `auth_token` cookie or `?token=`) |
| `/legacy-erp/accounts/:id/attachments/:attId/content` | Verifies a token from header or `?token=` |
| `/whatsapp/callback` | Meta webhook verification |

## 6. Operational security checklist

- Use strong, unique values for `NEXUSCORE_JWT_SECRET` and `NEXUSCORE_JWT_REFRESH_SECRET`; rotate them
  if they leak (all sessions end).
- Restrict PostgreSQL to the application host; use a least-privilege database login.
- Bind ports 3000/4000 to localhost and expose only the reverse proxy (`DEPLOYMENT.md`).
- Do not log full URLs at the proxy for `/upload/*` and `/attachments/*/content` (they can carry
  `?token=`).
- Set `CORS_ORIGINS` explicitly when the API is on a different origin.
- Keep `SWAGGER_ENABLED` unset in production.
- Review users and role assignments regularly; deactivate leavers (`isActive = false`).

## 7. Confirmed security limitations (code review)

| # | Finding | Impact | Recommendation |
|---|---|---|---|
| S1 | Access token stored in `localStorage` and a JavaScript-readable cookie | Any XSS would expose the session token | Move to HttpOnly, Secure cookies; add a Content-Security-Policy |
| S2 | Logout does not revoke tokens; access tokens live 7 days, refresh tokens 30 days; refresh tokens are not rotated or revocable | A stolen token stays valid until expiry; deactivation is the only server-side cut-off | Shorter access-token lifetime, refresh rotation with a revocation list |
| S3 | The login response includes the full `company` and `branch` records, which contain `metaAppSecret` and `waAccessToken` | WhatsApp/Meta credentials are sent to every user of that company who signs in | Strip secret fields from the login response |
| S4 | WebSocket gateway allows `cors: { origin: '*' }` | Broad cross-origin socket connections (authentication still required by the gateway) | Restrict to `CORS_ORIGINS` |
| S5 | `Role` has no company — roles and their permissions are shared by all companies on one instance | A role edited for one company affects users of every company | Single-company deployment, or add company ownership to roles |
| S6 | Docket share-link passwords stored in plain text | Exposed to anyone with database access | Hash share-link passwords |
| S7 | Fetch-by-id for some PLM records (e.g. `getStyleCard(id)`) does not check branch or company | A signed-in user who knows a UUID could read another branch's record | Add branch/company scope to all by-id reads |
| S8 | Most `GET` routes need only sign-in (no role check) | Every user can read every module's data in their company via the API | Add read permissions to sensitive modules (costing, users, audit) |
| S9 | Minimum password length 6, no complexity, no lockout | Weak passwords possible | Raise to ≥ 10 characters; consider lockout/MFA |
| S10 | Tokens accepted in `?token=` query strings for file downloads | Tokens may appear in proxy/browser logs | Prefer the scoped file-view token or cookies; scrub logs |
| S11 | `GET /api/v1/users` takes `companyId` and `branchId` from the **query string** and applies no company filter when they are omitted (`users.controller.ts` → `UsersService.findAll`) | Any signed-in user can list users (name, e-mail, company, branch, roles — no passwords) of **all companies** on the instance | Derive the company from the signed-in user, ignore client-supplied `companyId` |

## 8. Functional issue noticed during the security review

`GET /legacy-erp/accounts/:id/attachments/:attId/content` is `@Public` and verifies the token itself,
but it never sets the request user. Its service then calls the company-scope check, which needs the
signed-in user, so the request is expected to fail with 403 *No company on the signed-in user*. This
fails safe (no data leak), but **downloading or opening Current Account attachments probably does
not work** — the attachments tab (`frontend/components/legacy-erp/attachments-tab.tsx`) calls this
same route with a Bearer header, which a `@Public` route does not turn into a request user.
**Unverified at runtime**; the automated tests exercise the attachment service directly, not this
HTTP route. The equivalent Yarn Card, Fabric Card and Purchase Order `content` routes are not
`@Public` and are not affected.
