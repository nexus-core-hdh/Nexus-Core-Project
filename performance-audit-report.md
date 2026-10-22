# Nexus Core ERP — Performance Audit

**Date:** 2026-10-21 · **Type:** audit only (no application, configuration, dependency, schema or data changes) · **Scope:** Next.js frontend, NestJS backend, Prisma, PostgreSQL

---

## 1. Executive summary

The ERP's own work is fast. The time people experience is lost **around** it:

1. **Development compile and reload, not the API, is the dominant slowness.**
   - First visits to pages in `next dev` took **18–77 s** (Turbopack on-demand compile).
   - Every backend save interrupts the API for **8 s (median), 20 s (P90), up to 105 s**. During that window, requests wait about 3.5 s and then fail with 503: 85 of 7,411 observed requests failed this way.
2. **The dev API proxy adds about 40 ms to every call.**
   - Through the proxy, the public health endpoint takes P50 **42 ms**; directly it takes **2.8 ms**.
   - For most endpoints this proxy hop is 60–90% of the measured time. It is dev-only (production uses a reverse proxy, not measured).
3. **Steady-state API latency is low.**
   - Across 7,411 real requests on 95 route patterns, handler time is P50 **46 ms** and P95 **175 ms**.
   - Service-level database time is **0–26 ms per call** on the current (small) data.
4. **The real query hotspots are N+1 patterns that will grow with data.**
   - Cutting Complete-Order runs **40 queries per request** (`getOrderCutting`) and **31** (`listOrderFabrics`) for only 2 fabrics × 4 colours.
   - `getTotalRequirements` runs **14** and `recentTransactions` **11**.
   - 47 database calls inside loops across 18 backend files, and 204 `findMany` calls without a row limit (heuristic scan, needs review).
5. **Chatty clients.**
   - Notification polling is **45% of all API traffic** (two requests per tab every 30 s).
   - `GET /settings` (24 KB) is fetched once per grid instance (297 calls). Its `PATCH` does an unlocked read-modify-write of a shared JSON blob (lost-update risk).
   - `GET /companies/:id` fails on **171 of 190** calls (an unauthenticated check on every navigation).
6. **Typecheck cost is driven by two things.**
   - The generated **Prisma client types are 450,178 lines (20 MB)**.
   - Frontend type-checking spends **48.8 s** of a 55.6 s cold run in the checker.
7. **Security finding for separate review: no tenant filtering in the legacy ERP.** None of the 42 legacy-ERP services filters reads by company. Now that a second company (Creative Apparels) has an active admin, that user can likely read the other company's legacy records.

## 2. Environment and benchmark conditions

| Item | Value |
|---|---|
| Machine | Intel Core i5-1135G7 (4 cores / 8 threads), 15.7 GB RAM, Windows 11 |
| Free RAM at start | **2.7 GB** (CPU load 31%) |
| Largest consumers | Next dev server **1,772 MB**, Nest watch (`nest start --watch`) **896 MB**, backend app 148 MB, Chrome 2.8 GB, VS Code 1.5 GB |
| Node / npm | v24.19.0 / 11.17.0 |
| Next.js / React | 16.2.10 (Turbopack) / 19.2.7 |
| NestJS / TypeScript | 10.4.22 / 5.9.3 |
| Prisma | 5.22.0 (schema: 195 models, 4,812 lines) |
| PostgreSQL | 17.11 (local), `max_connections` 100, `shared_buffers` 128 MB |
| Mode | **Development only** (`next dev`, `nest start --watch`). No production build was run. |
| Data | Dev database with small volumes (e.g. 2 companies, 5 users, 14 serial cards). Query-count findings scale with data; times will not. |
| Repo state | branch `erp-dashboard-units-grid-colors`, 47 modified / 36 untracked files (unchanged by this audit) |

**Evidence sources** (no load testing):

- **Dev-server log, 19–21 Oct 2026:** 7,411 real API requests through the Next.js proxy and 256 page loads, each with a timing breakdown. There were also 88 backend boots and 79 reload outages.
- **Service profiling:** 18 read-only service methods, each run 1 warm-up + 5 measured times, with a query counter attached to Prisma's own query events.
- **Proxy-hop check:** 40 sequential requests per variant against the public `/health` endpoint.
- **Typechecks** run sequentially, and static code analysis.

## 3. Compile / build / test timings

| Operation | Command | Measured | Samples |
|---|---|---|---|
| Backend typecheck (incremental) | `npm run typecheck` (nexuscore-backend) | **7.8 s, 8.7 s** | 2 |
| Backend typecheck (cold) | `tsc --noEmit --incremental false --extendedDiagnostics` | **9.6 s** total (check 6.0 s), **1.06 GB** memory, 1,367 files, 49k lines of TS + **594k lines of definitions** | 1 |
| Frontend typecheck | `npm run typecheck` (frontend) | **13.2 s, 9.5 s** | 2 |
| Frontend typecheck (cold) | same + `--incremental false --extendedDiagnostics` | **55.6 s** total (**check 48.8 s**), **1.40 GB**, 3,926 files, 232k lines of TS | 1 |
| Backend reload after a save (API unavailable) | from dev-all log | **min 2 s · P50 8.1 s · P90 20.1 s · max 104.6 s** | 79 |
| ↳ compile finished → first Nest log (process start + module load) | dev log | P50 3 s · P90 7 s · max 55 s | 107 |
| ↳ first Nest log → "successfully started" (DI + routes + startup seeding) | dev log | P50 1 s · P90 2 s · max 4 s | 84 |
| Frontend first load of a page (dev, on-demand compile) | dev log, "next.js" time | e.g. Dashboard max **76 s**, Cutting order **69 s**, Work Orders **50 s**, Cutting Card 30 s, Companies 22.5 s, Serial Cards 18.6 s; repeat loads P50 30–230 ms | 256 |
| Frontend cold start | dev log | "Ready in 5.9 s" (one cold start), 0.67 s (warm restart) | 2 |
| Non-DB test suites | `npm run test:*` | backend `test:mail` 2.3 s; frontend suites 1.6–5.6 s each (`workspace-resilience` 5.6 s) | 1 each |
| DB-backed test suites | `test:company`, `test:cutting`, … | **not run in this audit** (they write to the isolated test DB; each also runs `prisma migrate deploy` first) | — |
| Production builds | `next build`, `nest build` | **not run**: approval needed (CPU/memory heavy with 2.7 GB free; `nest build` shares `dist/` with the running watcher) | — |
| HMR edit-to-update | — | **not measured**: needs a source edit, which the rules forbid | — |

## 4. API inventory and measured response times

**Inventory:** **1,431 routes** (567 GET) in 81 controllers / 41 modules, taken from the backend's own route-mapping log. Authentication is a global JWT guard plus role permissions. Under the existing rule, GET routes need only a login unless they declare `@Permissions`; writes need the module permission.

Largest route groups (routes / GET / seen in the log with timings):

| Group | Routes | GET | Observed |
|---|---|---|---|
| lookup | 68 | 17 | 0 |
| legacy-erp/work-orders | 47 | 23 | 12 |
| config | 43 | 12 | 0 |
| crm | 38 | 10 | 0 |
| entities | 34 | 13 | 4 |
| cutting-orders | 30 | 11 | 1 |
| finance | 30 | 9 | 0 |
| legacy-erp/inventory-receipts | 29 | 13 | 0 |
| legacy-erp/orders | 29 | 13 | 0 |
| legacy-erp/purchase-orders | 29 | 13 | 0 |
| report-builder | 27 | 9 | 0 |
| communication | 26 | 9 | 0 |
| legacy-erp/receipts | 26 | 12 | 0 |
| plm/style-cards | 22 | 11 | 10 |
| docket-setup, collabs, bpm, fabric-cards, sample-cards, files, dockets, accounts, … | 11–21 each | | |

In total **82 routes (95 route patterns)** have measured traffic; the other ~1,350 were not exercised in the logged sessions and were not hit by this audit (no indiscriminate requests).

### 4a. Measured GET endpoints (real sessions; "handler" = proxy route time, which includes the backend call; "total" adds Next.js framework time)

| Method | Route | Tested? | Samples | Handler P50 ms | Handler P95 ms | Handler P99 ms | Total P50 ms | Total P95 ms | 5xx | 4xx | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | /notifications | log | 1670 | 44 | 193 | 479 | 66 | 223 | 8 | 2 | 30 s poll; table empty |
| GET | /notifications/unread-count | log | 1670 | 28 | 158 | 414 | 56 | 203 | 7 | 2 | 30 s poll |
| GET | /settings | log | 297 | 57 | 555 | 3700 | 82 | 1226 | 7 | 0 | 24 KB body, once per grid |
| GET | /legacy-erp/work-orders/:id | log | 240 | 49 | 112 | 3600 | 69 | 157 | 4 | 0 | |
| GET | /plm/style-cards/:id | log | 238 | 52 | 111 | 180 | 67 | 148 | 4 | 0 | 7 queries |
| GET | /settings/:id | log | 213 | 79 | 283 | 3600 | 112 | 996 | 8 | 0 | profile/settings pages |
| GET | /companies/:id | log | 190 | 29 | 93 | 3600 | 49 | 139 | 3 | **171** | unauthenticated `company-check` call — fails every navigation |
| GET | /menu-items | log | 183 | 62 | 213 | 3700 | 82 | 663 | 5 | 0 | 30 KB body |
| GET | /users/:id/profile | log | 139 | 33 | 88 | 1239 | 42 | 113 | 1 | 0 | |
| GET | /entities/custom-fields | log | 116 | 61 | 226 | 3600 | 82 | 238 | 5 | 0 | |
| GET | /legacy-erp/work-orders/:id/bom/{fabric,process,ornament,trim} | log | 112 each | 50–56 | 98–106 | 128–162 | 73–77 | 139–152 | 0 | 0 | 4 parallel calls per open |
| GET | /plm/color-cards | log | 108 | 58 | 239 | 3600 | 77 | 595 | 4 | 0 | |
| GET | /legacy-erp/work-orders | log | 93 | 68 | 1820 | 3700 | 96 | 2400 | 4 | 0 | list (limit 50); tail = reloads |
| GET | /legacy-erp/work-orders/:id/items | log | 82 | 50 | 113 | 229 | 73 | 192 | 4 | 0 | |
| GET | /entities/custom-field-values | log | 80 | 54 | 106 | 219 | 78 | 153 | 0 | 0 | |
| GET | /legacy-erp/work-orders/:id/work-order-{explanation,expenses,activities} | log | 78 each | 50–61 | 105–135 | 197–266 | 73–84 | 186–223 | 0 | 0 | |
| GET | /entities/pages | log | 71 | 76 | 252 | 3600 | 113 | 952 | 3 | 0 | |
| GET | /plm/style-cards/:id/bom-lines | log | 70 | 52 | 103 | 217 | 73 | 167 | 0 | 0 | |
| GET | /dashboard/order-kpis | log | 66 | 44 | 143 | 3600 | 65 | 164 | 1 | 0 | 3 queries, 2 ms |
| GET | /legacy-erp/work-orders/:id/cutting-card/fabrics | log | 61 | 67 | 158 | 3600 | 85 | 194 | 0 | 0 | |
| GET | /legacy-erp/work-orders/:id/cutting-card/order/fabrics | log + profiled | 56 | **103** | 183 | 256 | 121 | 213 | 0 | 0 | **31 queries** |
| GET | /companies/access | log | 48 | 57 | 417 | 560 | 77 | 443 | 0 | 0 | |
| GET | /plm/costing-sheets | log | 47 | 49 | 119 | 1317 | 71 | 169 | 0 | 4 | |
| GET | /companies | log + profiled | 45 | 61 | 210 | 325 | 72 | 248 | 0 | 0 | |
| GET | /dashboard/recent-transactions | log + profiled | 44 | 76 | 186 | 1264 | 109 | 243 | 0 | 0 | 11 queries |
| GET | /dashboard/recent-activity | log + profiled | 39 | 69 | 3600 | 3600 | 101 | 3600 | 1 | 0 | 5 queries |
| GET | /cutting-orders | log | 39 | 65 | 230 | 1332 | 94 | 263 | 0 | 0 | |
| GET | /legacy-erp/work-orders/:id/cutting-card/matrix | log + profiled | 39 | 40 | 215 | 620 | 64 | 238 | 0 | 0 | 9 queries |
| GET | /general-settings/screen-parameters/active | log | 34 | 59 | 3600 | 3600 | 73 | 3600 | 3 | 0 | tail = reloads |
| GET | /plm/style-cards | log + profiled | 28 | 43 | 76 | 95 | 61 | 99 | 0 | 4 | |
| GET | /company | log | 24 | 50 | 104 | 305 | 73 | 156 | 1 | 0 | |
| GET | /legacy-erp/serial-cards | log + profiled | 16 | 105 | 161 | N/A (n<20) | — | 182 | 0 | 0 | 26 ms DB, 25 KB |

**Every 3,600–3,700 ms value and nearly every 5xx above are dev-proxy retries during backend reloads**, not slow handlers. The proxy retries for 0.5 s + 1 s + 2 s and then returns 503. P99 is shown only where n ≥ 20.

### 4b. Service-level profile (no HTTP; dev DB; median of 5 runs after 1 warm-up)

| Route | Service method | Queries | Total ms | DB ms | Non-DB ms | Payload |
|---|---|---|---|---|---|---|
| GET …/cutting-card/order | `getOrderCutting` | **40** | **45** | 3 | 42 | 3.4 KB |
| GET …/cutting-card/order/fabrics | `listOrderFabrics` (2 fabrics) | **31** | 37 | 3 | 34 | 1.0 KB |
| GET /legacy-erp/serial-cards | `listAll(take 50)` | 3 | 25 | 26 | 0 | 24.6 KB |
| GET /dashboard/recent-transactions | `recentTransactions(all, 8)` | 11 | 20 | 50 (parallel) | 0 | 2.1 KB |
| GET …/requirements/total?type=fabric | `getTotalRequirements` | **14** | 17 | 3 | 14 | 0.5 KB |
| GET /dashboard/recent-activity | `recentActivity(8)` | 5 | 15 | 10 | 5 | 2.1 KB |
| GET …/cutting-card/matrix | `getColorMatrix` | 9 | 15 | 10 | 5 | 1.6 KB |
| GET /menu-items | `getMenuItems` | 1 | 14 | 2 | 12 | **30.2 KB** |
| GET /plm/style-cards/:id | `getStyleCard` | 7 | 11 | 0 | 11 | 1.4 KB |
| GET /plm/style-cards | `listStyleCards` | 2 | 6 | 1 | 5 | 5.5 KB |
| GET /companies | provisioning `list` | 3 | 6 | 0 | 6 | 1.1 KB |
| GET /settings | `getSettings` | 1 | 5 | 2 | 3 | **23.8 KB** |
| GET …/requirements/manufacturing-quantity | `getManufacturingQuantitySummary` | 3 | 4 | 0 | 4 | 0.2 KB |
| GET /legacy-erp/work-orders | `list` (limit 50) | 1 | 3 | 1 | 2 | 8.6 KB |
| GET /notifications | `findAll` | 2 | 2 | 0 | 2 | 0.1 KB |
| GET /dashboard/order-kpis | `orderKpis(30 d)` | 3 | 2 | 2 | 0 | 0.4 KB |
| GET /legacy-erp/work-orders/:id | `get` | 1 | 1 | 0 | 1 | 0.9 KB |
| GET …/bom/fabric | `listBom` | 1 | 1 | 0 | 1 | 0.0 KB |

"DB ms" is the sum of Prisma's reported query durations, so it can exceed total time when queries run in parallel. "Non-DB" is the time between queries: Prisma client overhead plus app logic and round-trips.

### 4c. Where an HTTP request's time goes (`GET /health`, public, 40 samples each)

| Path | Min | P50 | P95 | Max |
|---|---|---|---|---|
| Direct backend `:4000/api/v1/health` | 1.7 | **2.8** | 3.9 | 24.1 ms |
| Through Next dev proxy `:3000/api/v1/health` | 29.9 | **42.3** | 74.2 | 326.6 ms |
| Direct backend `/health/ready` (one DB query) | 3.1 | 4.0 | 5.4 | 5.9 ms |

## 5. Slowest measured endpoints (n ≥ 5, by handler P95)

| # | Route | n | P50 | P95 | Explanation |
|---|---|---|---|---|---|
| 1 | GET /dashboard/recent-activity | 39 | 69 | 3600 | reload retries; service itself 15 ms / 5 queries |
| 2 | GET /general-settings/screen-parameters/active | 34 | 59 | 3600 | reload retries |
| 3 | GET /legacy-erp/work-orders | 93 | 68 | 1820 | reload retries; service 3 ms |
| 4 | GET /settings | 297 | 57 | 555 | 24 KB blob, frequent; reload tail |
| 5 | GET /companies/access | 48 | 57 | 417 | 3 permission lookups per call |

Ranked by steady-state cost (P50) instead: `…/cutting-card/order/fabrics` (103 ms, 31 queries), `/legacy-erp/serial-cards` (105 ms), `/settings/:id` (79 ms), `/dashboard/recent-transactions` (76 ms), `/entities/pages` (76 ms).

## 6. Frontend page performance (development build only)

| Page (dev) | Loads | Total P50 | Total max | "next.js" (compile) max |
|---|---|---|---|---|
| /[company]/default (dashboard) | 41 | 334 ms | 77 s | 76 s |
| /legacy-erp/cutting-card/order | 44 | 1,151 ms | 77 s | 69 s |
| /legacy-erp/work-orders | 80 | 771 ms | 51 s | 50 s |
| /legacy-erp/cutting-card | 19 | 273 ms | 30 s | 29.9 s |
| /pages/companies | 28 | 570 ms | 23 s | 22.5 s |
| /legacy-erp/serial-cards | 1 | 19.1 s | 19.1 s | 18.6 s |
| /pages/users | 8 | 695 ms | 18 s | 15.8 s |

Findings:

- **F1 — The workspace registry puts every page in every route's graph.**
  - `app/[company]/(auth)/layout.tsx:55` renders `ContentContainer`, which leads to `components/layout/workspace/workspace-content-stack.tsx:8`, then `lib/workspace/registry.tsx`, then `registry.generated.ts` with **261 `dynamic(() => import(page))` entries**.
  - Every page is also its own Next route, so it can be compiled both as a route and as a workspace chunk.
  - This is the leading explanation for the 20–77 s first loads. It's a **hypothesis**: confirming it needs an A/B compile run with the registry trimmed, which is a code change.
- **F2 — Request fan-out when opening a Work Order.**
  - About 12 GETs: the Work Order, items, variants, BOM ×4 (parallel), explanation, expenses, activities, custom fields and cutting fabrics.
  - Each pays the ~40 ms proxy hop in dev.
- **F3 — Notification polling.** `components/layout/header/notifications.tsx:61` polls every 30 s with two requests per tab, which made up 45% of API calls. The backend already has a socket gateway (`notifications.gateway`) that could push updates instead.
- **F4 — Settings fetched per grid.** `hooks/use-grid-columns.ts:252` calls `settingsApi.getCurrentSettings()` per grid instance, and `use-worklist`, `use-draft-form`, `master-detail-layout` and the workspace store do the same, with no shared cache. That's 297 GETs of a body up to 26 KB, plus 202 PATCHes.
- **F5 — A guaranteed 4xx on every navigation.** `app/[company]/(auth)/components/company-check.tsx:36` fetches `/companies/:id` without an auth header, which is why 171 of 190 calls failed.
- **F6 — Heavy libraries are scoped, which is good.** Recharts (41 files), Tiptap (30), Handsontable, Shiki, Motion and socket.io are not imported by the shared layout. The dev chunks are 1.0–1.2 MB (unminified, so not representative of production).
- **F7 — Very large client files:** `lib/api.ts` (4,716 lines), `workflow-builder.tsx` (2,654), `add-product-form.tsx` (2,092), `inventory-receipt-line-grid.tsx` (2,018), and the unused `create-company-dialog.tsx` (1,990).
- **Not measured:**
  - production bundle sizes, LCP/INP or Core Web Vitals (would need `next build` and a production run);
  - re-render counts (would need the React Profiler);
  - memory leaks (would need long browser sessions).

## 7. Database and Prisma findings

| # | Finding | Evidence | Impact | Remedy | Confidence |
|---|---|---|---|---|---|
| D1 | **N+1 in Cutting Complete Order** | `cutting-card.service.ts:579-580` runs `listApplicableFabrics` → `resolveBomLines` + inventory + colour queries **per colour, sequentially**; `getOrderCutting` (`:595-601`) calls it again via `requireOrderFabric` and re-reads sizes/variants; measured **31 / 40 queries** for 2 fabrics × 4 colours | grows with colours × fabrics; 103 ms P50 today | resolve the BOM once per request; share sizes/variants between steps | High |
| D2 | Requirements total does many small reads | `getTotalRequirements` → `getColorWiseRequirements`: **14 queries** | moderate; grows with BOM lines | batch the per-line lookups | Medium |
| D3 | Row-by-row writes inside long transactions | `order-manufacturing.service.ts:525-559` (per entry × per size INSERT/UPDATE); similar patterns in `serial-card.service.ts` (12 loop sites), `packing-list.service.ts` (6), `work-order.service.ts:405/457` | longer transactions, more lock time and pool pressure as grids grow | batched `INSERT … VALUES (…),(…)` / `UPDATE … FROM (VALUES …)` | Medium (writes not executed in this audit) |
| D4 | Unlocked read-modify-write of a JSON blob | `user-settings.service.ts:16-30` reads `tablePreferences`, merges, then upserts; up to **26 KB / 57 keys** per user; 202 PATCHes | lost updates when two grids save together; large payloads | `jsonb` merge in one SQL statement (`tablePreferences || $1`) or a per-key table | High (code) |
| D5 | 204 `findMany` without `take` across 48 files | heuristic scan; densest: `plm-definitions.service.ts` (20), `config.service.ts` (12), `plm-cards.service.ts` (9), `dashboard.service.ts` (7) | unbounded results as data grows | review each; add paging/limits to list endpoints | Low–Medium (heuristic) |
| D6 | 47 DB awaits inside loops across 18 files | heuristic scan (top: serial-card 12, order-manufacturing 10, packing-list 6) | sequential round-trips | review case by case | Low–Medium |
| D7 | Prisma query events emitted with no listener | `prisma.service.ts:10-11` sets `log: [{ emit: 'event', level: 'query' }]`; no `$on('query')` anywhere | small per-query overhead | remove, or wire it to a debug-only slow-query log | Medium (cost unmeasured) |
| D8 | Per-request auth and permission queries | `JwtStrategy.validate` loads user + company + branch on **every** request; `RolesGuard` loads roles → permissions on every permission-checked request; `/companies/access` does 3 lookups | fixed few-ms cost per request | short-TTL cache of the permission set per user | Medium |
| D9 | Indexes | the schema has many `@@index`; no slow query was observed on the current data | — | **hypothesis only**: run `EXPLAIN (ANALYZE, BUFFERS)` on the D1/D2/serial-card queries against realistic volumes (needs approval) | Low |

## 8. CPU / memory observations

- Only **2.7 GB of 15.7 GB RAM was free**. The Next dev server holds **1.77 GB** and the Nest watcher **0.9 GB**, and a cold frontend typecheck needs another **1.4 GB** (backend 1.06 GB). Paging under this pressure is a likely contributor to the long tails: 55 s backend process starts and 77 s page compiles.
- CPU load was 31% at idle (4 cores). Competing compilers (Turbopack, Nest's tsc watcher, an editor TS server, test runs) share the same 4 cores.
- PostgreSQL uses about 79 MB; the database is not a resource bottleneck at current volumes.
- The backend prints **1,431 "Mapped route" lines per boot** (127,421 over 88 boots). That's minor I/O, but it slows reloads and buries useful log lines.

## 9. Evidence-backed bottlenecks (file / line)

1. **Backend reload downtime (P50 8 s, max 105 s) on every save.**
   - `nest start --watch` (`nexuscore-backend/package.json:13`) with full-program tsc, `declaration` and `sourceMap` (`tsconfig.json:4,10`), then a full process restart.
   - The 450k-line Prisma client types are re-checked on every rebuild.
2. **First page compiles of 18–77 s:** the workspace registry pulls 261 pages into every route graph (`registry.generated.ts`, imported via `workspace-content-stack.tsx:8`). Memory pressure adds to it.
3. **The ~40 ms dev proxy hop on every call:** `frontend/app/api/v1/[...path]/route.ts` with `lib/dev-api-proxy.ts`, measured against the direct path.
4. **N+1 in Cutting Complete Order:** `cutting-card.service.ts:579-580, 595-601` (31–40 queries).
5. **Chatty and oversized client traffic:**
   - notification polling (`notifications.tsx:61`);
   - per-grid settings fetches (`use-grid-columns.ts:252`) of a 24 KB blob;
   - the failing `company-check.tsx:36` on every navigation.

## 10. Recommended improvements (ranked)

| Rank | Change | Impact | Confidence | Risk | Effort |
|---|---|---|---|---|---|
| 1 | Backend dev loop: switch watch to SWC (`nest start --watch -b swc`, or `"builder": "swc"` + `typeCheck: false`, with typechecking run separately); disable `declaration`/`sourceMap` for the dev build | Very high (reload seconds → ~1–2 s typical) | Medium-High | Low (dev only) | Low |
| 2 | Lazy workspace registry: load page modules only when a tab opens (or let Next routes own the pages) | Very high (first-load compile) | Medium (needs A/B) | Medium | Medium |
| 3 | Replace notification polling with the existing socket gateway (or 2–5 min polling while hidden) | High (−45% requests) | High | Low | Low |
| 4 | Fix the Cutting N+1 (D1), resolving the BOM once per request | High (scales with colours) | High | Low | Low-Medium |
| 5 | One shared settings cache (single fetch per session), atomic `jsonb` merge for PATCH (D4) | High (traffic + correctness) | High | Low-Medium | Medium |
| 6 | Remove the unauthenticated `company-check` call (or send auth and cache it) | Medium | High | Low | Low |
| 7 | Free memory for the dev loop (close unused Chrome tabs/VS Code windows; optionally `NODE_OPTIONS=--max-old-space-size` tuning) | Medium | Medium | None | None |
| 8 | Batch writes in Order Manufacturing / Serial Cards / Packing List (D3) | Medium (grows with data) | Medium | Medium | Medium |
| 9 | Cache the permission set per user for a short TTL (D8); drop unused Prisma query events (D7) | Low-Medium | Medium | Low-Medium | Low |
| 10 | Cut the frontend typecheck cost: find the slow types with `tsc --generateTrace` (likely zod/react-hook-form/tanstack generics or the 4.7k-line `lib/api.ts`) | Medium (CI/editor) | Medium | Low | Medium |
| 11 | Silence per-route "Mapped" logs in dev (Nest logger levels) | Low | High | None | Low |

## 11. Not measured, and why

- **Production builds and production runtime** (`next build`, `nest build`, Core Web Vitals, minified bundle sizes): CPU/memory heavy on a machine with 2.7 GB free, and `nest build` shares `dist/` with the running watcher. **Needs approval**, ideally with the dev servers stopped.
- **HMR edit-to-update time:** needs a source edit, which this audit forbids.
- **DB-backed test suites:** they write to the isolated test database.
- **HTTP timings for the ~1,350 routes not in the logs:** would need authenticated requests. The 18 most relevant were profiled at service level instead.
- **Query plans (`EXPLAIN ANALYZE`):** need approval and realistic data volumes.
- **`node_modules` and `.next` disk size:** the scan was too slow on this disk and was stopped.
- **Re-render counts and memory leaks:** need the React Profiler or long browser sessions.
- **Load/concurrency behaviour:** deliberately not tested against a shared database.

## 12. Phased optimization plan

1. **Phase 1 — dev loop (days):** SWC backend watch (#1); quieter Nest logs (#11); free memory (#7). Measure reload downtime again from the same dev-all log metric.
2. **Phase 2 — traffic (days):**
   - notification push instead of polling (#3);
   - a single settings fetch plus atomic merge (#5);
   - remove the failing `company-check` (#6).
   - Re-measure request counts per session.
3. **Phase 3 — query hotspots (1–2 weeks):**
   - Cutting N+1 (#4) and Requirements (D2);
   - batched writes (#8);
   - review the unbounded `findMany` calls (D5);
   - `EXPLAIN` the top queries with realistic data.
4. **Phase 4 — frontend architecture (1–2 weeks):**
   - A/B the lazy workspace registry (#2), then roll it out;
   - production build and bundle analysis;
   - trace the frontend typecheck (#10).
5. **Separate security review (before more companies go live):** company scoping for all legacy-ERP reads (§13 below).

## 13. Reliability and security notes (report only — nothing changed)

- **Tenant isolation, legacy ERP: high priority for a separate security review.**
  - 0 of 42 `legacy-erp/*.service.ts` filter by `"CompanyId"`, and 10 hard-code company 1 on insert. For example, `work-order.service.ts:239` lists every non-deleted Work Order.
  - The 87 controller handlers that pass the caller's company use it for auditing, not filtering.
  - With Creative Apparels' admin now active, cross-company reads of legacy data are likely possible.
- **Reload outages hit real users.** 85 requests returned 5xx, including **4 of 5 `POST /companies/:id/first-admin`** attempts, which landed during backend reloads triggered by code saves.
- **Lost-update risk:** `PATCH /settings` (D4).
- **Unbounded reads:** D5 (204 candidates).

## 14. Commands run and changes made

- **Read-only inspection:** `git status`/`branch`, `grep`/`sed`/`find`/`wc`, PowerShell CIM queries (CPU/RAM/disk/process), version reads, read-only SQL (`SELECT version()`, settings, row counts, JSON sizes).
- **Measurements:**
  - `npm run typecheck` ×2 each (backend, frontend);
  - cold `tsc --noEmit --incremental false --extendedDiagnostics` ×1 each;
  - non-DB test suites ×1 each (`test:mail`, `test:clipboard`, `test:company-actions`, `test:cutting-modes`, `test:screen-search`, `test:workspace-tabs`, `test:workspace-resilience`, `test:grid-columns`, `test:row-open-and-columns`);
  - 120 `curl` GETs to the public health endpoints;
  - one read-only service-profiling script: booted the Nest modules without `main.ts` and called 18 read methods ×6. It ran from a temporary folder that was deleted afterwards.
- **Analysis of the existing dev-server log**, in the session scratchpad, outside the repo.
- **Changes:** **none** to application code, configuration, dependencies, environment files, schema, migrations or data. No server was stopped or restarted. The only file created in the repository is this report. Git counts before and after: 47 modified / 36 untracked (+1 untracked: this report).
