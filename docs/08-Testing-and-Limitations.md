# 08 — Testing and Limitations

[Documentation index](README.md) · Previous: [Security and Access](07-Security-and-Access.md) · Next: [Deployment and Maintenance](09-Deployment-and-Maintenance.md)

## 1. Test infrastructure

| Item | Detail |
|---|---|
| Framework | Node.js built-in test runner (`node --test`) with `ts-node` for TypeScript |
| Backend suites | `nexuscore-backend/test/<suite>/*.test.ts`, one npm script per suite (`npm run test:<suite>`) |
| Test database | DB-backed suites first run `test/packing-list/prepare-test-db.ts`: it creates the database named in the test URL if missing, runs `prisma migrate deploy` on it and refuses any database whose name does not end in `_test` or equals the development database |
| Frontend suites | `frontend/scripts/*.test.mjs` (`npm run test:<suite> -w frontend`); `*.browser.test.mjs` drive a real browser against a running app |
| Root suite | `npm run test:dev-all` (dev launcher) |
| Type checks | `npm run typecheck` (backend `tsc --noEmit`, frontend `tsc` with `tsconfig.typecheck.json`) |
| Jest | `npm test` in the backend calls `jest`, but **Jest is not a declared dependency** and no Jest tests were found — this script is not usable |

## 2. Results of the audit run (2026-11-07)

Run on the audit workstation (Windows 11, Node v24.19.0) against the working tree, which includes the
uncommitted costing changes. Exit code 0 for every suite listed.

### 2.1 Type checks

| Check | Result |
|---|---|
| `npm run typecheck -w nexuscore-backend` | Passed — 0 errors |
| `npm run typecheck -w frontend` | Passed — 0 errors |

### 2.2 Backend suites — no database required

| Script | Tests | Passed | Failed |
|---|---|---|---|
| `test:yarn-report` | 12 | 12 | 0 |
| `test:gate-pass` | 6 | 6 | 0 |
| `test:dyeing` | 5 | 5 | 0 |
| `test:style-route` | 3 | 3 | 0 |
| `test:process-follow-up` | 8 | 8 | 0 |
| `test:order-form` | 13 | 13 | 0 |
| `test:report-builder` | 13 | 13 | 0 |
| `test:mail` (SMTP configuration audit, non-sending connection check with a fake transport) | 8 | 8 | 0 |
| **Subtotal** | **68** | **68** | **0** |

### 2.3 Backend suites — test database

| Script | Area | Tests | Passed | Failed |
|---|---|---|---|---|
| `test:udf` | User-defined fields | 102 | 102 | 0 |
| `test:packing-list` | Packing lists, multiple box rows | 32 | 32 | 0 |
| `test:stock-value` | Inventory stock value | 18 | 18 | 0 |
| `test:serial-cards` | Serial cards | 34 | 34 | 0 |
| `test:fabric-planning` | Fabric planning | 15 | 15 | 0 |
| `test:dev-reliability` | Development reliability guards | 9 | 9 | 0 |
| `test:users` | User management | 12 | 12 | 0 |
| `test:bom-transfer` | Work Order BOM transfer | 18 | 18 | 0 |
| `test:costing` | Costing sheets | 4 | 4 | 0 |
| `test:cutting` | Cutting | 8 | 8 | 0 |
| `test:company` | Company provisioning / first admin / trial | 34 | 34 | 0 |
| `test:om-route` | Order manufacturing routes | 13 | 13 | 0 |
| `test:om-entry-report` | Order Manufacturing Entry report | 6 | 6 | 0 |
| `test:receipt-approval` | Inventory receipt approval | 23 | 23 | 0 |
| `test:invoices` | Receipt invoices, consolidated invoices | 49 | 49 | 0 |
| `test:company-isolation` | Legacy company isolation incl. real-login HTTP test | 43 | 43 | 0 |
| **Subtotal** | | **420** | **420** | **0** |

**Backend total: 24 suites, 488 tests, 488 passed.**

### 2.4 Frontend node suites

| Script | Tests | Passed | Skipped |
|---|---|---|---|
| `test:dev-supervisor` | 37 | 37 | 0 |
| `test:stale-routes` | 22 | 22 | 0 |
| `test:route-integrity` | 14 | 14 | 0 |
| `test:workspace-tabs` | 62 | 62 | 0 |
| `test:workspace-resilience` | 4 | 4 | 0 |
| `test:dev-api-proxy` | 13 | 13 | 0 |
| `test:screen-search` | 16 | 16 | 0 |
| `test:grid-columns` | 17 | 17 | 0 |
| `test:bom-transfer` | 17 | 17 | 0 |
| `test:inventory-card-display` | 10 | 10 | 0 |
| `test:row-open-and-columns` | 9 | 9 | 0 |
| `test:serial-card-actions` | 33 | 33 | 0 |
| `test:serial-card-qr` | 19 | 18 | 1 (needs `SERIAL_CARD_LABEL_FIXTURE`) |
| `test:cutting-modes` | 5 | 5 | 0 |
| `test:company-actions` | 26 | 26 | 0 |
| `test:clipboard` | 5 | 5 | 0 |
| `test:route-code` | 9 | 9 | 0 |
| `test:om-process-route` | 18 | 18 | 0 |
| **Frontend total** | **336** | **335** | **1** |

Root `test:dev-all`: 8 tests, 8 passed.

### 2.5 Not run in this audit

| Item | Reason |
|---|---|
| Browser suites: `test:om-process-browser`, `test:om-matrix-browser`, `test:packing-list-browser`, `test:receipt-approval-browser`, `test:invoice-list-browser`, `test:receipt-create-invoice-browser`, `test:invoice-browser` | Require a running frontend + backend and a browser session; not executed |
| `npm run lint` (both workspaces) | Not executed |
| `npm run build` / `npm run verify` | Not executed (production build) |
| Manual end-to-end walkthrough of every screen | Not performed |
| Load / performance tests | None exist (see the separate `performance-audit-report.md`) |
| Security / penetration tests | None exist |

## 3. Coverage gaps

| Area | Automated coverage |
|---|---|
| Legacy ERP masters (warehouses, current accounts, yarn/fabric/trim cards, sizes, unit sets) | Indirect only (company-isolation tests) |
| Purchase / subcontract orders, contracts, financial receipts | Company-isolation tests only |
| PLM (style, sample, swatch, product cards, orders, tasks, critical path) | Only `test:style-route` (route codes) |
| Docket Management, sharing, external review | **None** |
| Report Builder | `test:report-builder` covers the data-source catalog, exclusion of sensitive columns, field validation, join limits and query generation/run; CSV/XLSX/PDF export is not tested |
| Authentication flows, password reset e-mails | Partly (`test:users`, `test:mail` with a fake transport) |
| CRM / collaboration modules | **None** |
| WebSocket notifications, RabbitMQ, WhatsApp | **None** |

## 4. Known issues and limitations

| # | Limitation | Evidence | Impact |
|---|---|---|---|
| L1 | **Finance ERP** screens are a front-end mock | `frontend/lib/finance-erp/mock/create-store.ts` | No accounting data is stored; must not be used operationally |
| L2 | **264 placeholder API routes** (`StubsModule`) behind settings and app screens (Currencies, Taxes, Units, Locations, SMTP Settings, Notes, Todos, Mail, Email templates, Pricing Plans, Form Designer, Business Processes …) | `src/modules/stubs/stubs.controller.ts` | Those screens show empty data; saves are silently discarded |
| L3 | AI Chat / Image Generator / Text-to-Speech are canned demos | `apps/ai-chat/app-render.tsx` | No AI functionality |
| L4 | UI-kit template pages are still shipped and some appear in the seeded menu | `prisma/seed.ts` menu groups *Apps*, *AI Apps*, *Pages* | User confusion; hide before go-live |
| L5 | Docket documents are registered by URL only; no file upload; watermarking not implemented | `dockets.service.ts`, `sharing.service.ts` | Files must be hosted elsewhere |
| L6 | Current Account attachment download/open probably fails (403) | [07 §8](07-Security-and-Access.md#8-functional-issue-noticed-during-the-security-review) | Unverified at runtime |
| L7 | Costing lock, manual amounts and the Work Order Initial-Cost link are **uncommitted** (3 untracked migrations) | `git status` | Must be committed and deployed together, or excluded |
| L8 | Legacy document numbering is global, not per company | `LegacyCodeSequence` | Numbers interleave between companies |
| L9 | Roles are instance-wide; several security findings S1–S11 | [07](07-Security-and-Access.md) | See recommendations |
| L10 | Most Legacy ERP request bodies are untyped (`Record<string, any>`) and not described in Swagger | controllers | Integration requires reading the source |
| L11 | Time-zone mismatch between DB server and application shifts legacy dates (development observation) | [04 §7](04-Database-Design.md#7-data-maintenance-rules) | Align time zones |
| L12 | `nexuscore-backend/SETUP.md` is outdated (ports, seed credentials) | file content | Use [06](06-Installation-Guide.md) |
| L13 | Backend `npm test` (Jest) is not runnable | `package.json` | Use the `test:*` scripts |
| L14 | The development log files (`frontend/dev-server.log` etc.) are tracked/modified in the working tree | `git status` | Housekeeping before handover |
| L15 | No screen to create roles or grant permissions; only the API (`/api/v1/roles`) | `frontend/lib/api.ts` (`rolesApi` lists only) | Administrators need API access or a script; consider building a screen |
| L16 | Companies, Log Tracking and User-Defined Fields screens are not in the seeded menu | `prisma/seed.ts` | Reach by URL or add menu items |

## 5. Workflows not verified end-to-end

Every workflow in [03 — User Manual](03-Module-User-Manual.md) except the server-side rules exercised
by the suites above. In particular: sign-in → forced password change in the browser; complete PLM
Style → Work Order → Requirements → Purchase → Receipt → Invoice cycle in the UI; packing list and
serial-card label printing on real printers; QR scanning on a phone; report export downloads;
docket sharing to an external recipient; password-reset e-mail delivery.
