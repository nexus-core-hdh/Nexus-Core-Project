# 01 — Project Overview

[Documentation index](README.md) · Next: [System Architecture](02-System-Architecture.md)

> Audit basis: repository state on branch `erp-dashboard-units-grid-colors` at commit `09452f5`
> plus uncommitted working-tree changes, inspected on 2026-11-07. Everything below is derived from
> source code, configuration, migrations and test runs performed during the audit. Items that could
> not be confirmed are marked **Unverified**.

## 1. Purpose

Nexus Core ERP ("NexusCore" in code) is a web-based business system for an apparel / textile
manufacturing business. It combines:

- a **manufacturing and inventory ERP** (the "Legacy ERP" module) whose database tables were migrated
  from an earlier SQL Server ERP and are now hosted in PostgreSQL;
- **product-lifecycle management** (PLM: style, sample, swatch and product cards, costing sheets,
  PLM orders, tasks and critical path);
- **document control** (Docket Management, with approval workflows and secure external sharing);
- **user-defined reporting** (Report Builder for the PLM, Legacy ERP and Docket modules, with CSV,
  Excel and PDF export);
- platform services: users, roles and permissions, multi-company tenancy, approvals, audit logging,
  notifications, menu management and a BPM task queue.

## 2. Scope of this delivery

The repository also contains a large number of screens inherited from the commercial UI template the
frontend was built on (`frontend/package.json` is still named `shadcn-ui-kit`) and some modules that
are only placeholders. The tables below separate what is delivered from what is not.

### 2.1 Capability status

| Status | Meaning |
|---|---|
| **Implemented** | Screen is backed by a real API that reads and writes the database. |
| **Implemented + tested** | As above, and an automated test suite exercises it (see [08 — Testing](08-Testing-and-Limitations.md)). |
| **Partial** | Works, but with documented gaps. |
| **Mock / demo** | Screen works only with in-browser sample data or canned responses; nothing is saved. |
| **Placeholder** | Screen calls an API route that returns empty data and ignores saves (`StubsModule`). |

### 2.2 Delivered business modules

| Module | Main screens (menu path) | Status | Evidence |
|---|---|---|---|
| Legacy ERP — masters | Warehouses, Current Account, Yarn/Fabric/Trim Cards, Trim Inventory Cards, Inventory Card List, Sizes, Unit Sets, Master lookups (Fab Type, Group Code, Finish GSM, Dye Type, Composition, Subcontract Type/Receipt), Warehouse Parameters | Implemented | `src/modules/legacy-erp/*` controllers; menu in `prisma/seed.ts` |
| Legacy ERP — orders | 1-Purchase Order, 3-Subcontract Order, Subcontract Receipts, Purchase/Sale Contracts | Implemented | `purchase-order`, `order-type`, `contract` controllers |
| Legacy ERP — manufacturing | Work Order (Style Info, Manufacturing Quantities, BOM, Order Form), Fabric/Trim/Yarn Requirements (Calculate, Lock/Unlock, Transfer from Style BOM), Fabric/Trim/Yarn Planning, Yarn Recipe, Order Manufacturing Entry, Cutting Card | Implemented + tested | `work-order`, `fabric-yarn-requirements`, `order-manufacturing`, `cutting-card` controllers; `test:bom-transfer`, `test:om-route`, `test:fabric-planning`, `test:order-form` |
| Legacy ERP — inventory | Inventory Receipts (18 receipt types), Approve/Unapprove, Item Allocation, Item Statement, Stock value | Implemented + tested | `inventory-receipt`, `item-allocation`, `item-statement` controllers; `test:receipt-approval`, `test:stock-value` |
| Legacy ERP — invoicing | Receipt Invoices (18 types), consolidated invoices across receipts of one Current Account | Implemented + tested | `invoice.controller.ts`; `test:invoices` |
| Legacy ERP — logistics | Packing Lists (multiple box rows), Serial Cards (generate, QR labels, phone scan page `/s/<serial>`) | Implemented + tested | `packing-list`, `serial-card` controllers; `test:packing-list`, `test:serial-cards` |
| Legacy ERP — finance | Financial Receipts, Receipt & Master Data | Implemented | `fi-receipt.controller.ts` |
| Legacy ERP — reports | Standard reports (e.g. Yarn Requirement, Inward Gate Pass, Dyeing Follow-up, Process Follow-up, Order Manufacturing Entry, Work Order Order Form) and Report Builder | Implemented + tested | `src/modules/reports/*.report.ts`; `test:yarn-report`, `test:gate-pass`, `test:dyeing`, `test:process-follow-up`, `test:om-entry-report`, `test:report-builder` |
| PLM | Style/Sample/Swatch/Product Cards, Mood Boards, PLM Templates, General Definitions (16 card types), PLM Orders, Tasks, Critical Path, PLM reports | Implemented | `src/modules/plm/*` (195 routes) |
| Costing | Costing Sheets, Cost Detail Entry, Profit Breakdown, Lock/Unlock, link to Work Order Initial Cost | Implemented + tested (lock/manual amounts are **uncommitted work in progress**) | `src/modules/costing/*`; `test:costing`; untracked migrations `20261102000000`–`20261103010000` |
| Docket Management | Style/Sample/Product/Order Dockets, Approval Queue, Document Register, Document Types, Docket Templates, Approval Workflows, Shared Links, External Reviews, Completeness / Missing / Expiry reports | **Partial** — documents are registered by entering a *File URL* and name; the screen does not upload file contents, so files must be hosted elsewhere | `src/modules/docket-management/*` (60 routes); `dockets/order-dockets/[id]/page.tsx` upload form |
| Cutting Orders (BPM-driven) | Cutting orders, rolls, marker plans, batches, approval history | Implemented + tested | `src/modules/cutting/*`; `test:cutting` |
| BPM | Task Queue, Request Types | Implemented | `src/modules/bpm/*` |
| Administration | Users (role assignment), Roles & permissions (API only — no screen), Companies (platform owner), Menu items, Approval Configuration, Screen Parameters, Log Tracking (audit), User-Defined Fields | Implemented + tested | `users`, `roles`, `company`, `approval`, `general-settings`, `audit` modules; `test:users`, `test:company`, `test:company-isolation`, `test:udf` |
| CRM / collaboration | Entities (contacts, deals…), pipeline dashboards, feed, collabs, online documents, file manager, chat, projects | Implemented (not covered by this handover's acceptance tests) | `crm`, `entities`, `pipeline`, `feed`, `collab`, `documents`, `files`, `communication`, `projects` modules |

### 2.3 Not delivered as working functionality

| Area | Status | Evidence |
|---|---|---|
| **Finance ERP** (General Ledger, Payables, Receivables, Fixed Assets, Inventory demand/issuance, Finance settings — 56 screens under `/finance-erp`) | **Mock / demo** — in-memory sample data held in the browser; changes are lost on reload | `frontend/lib/finance-erp/mock/create-store.ts` ("Generic in-memory mock backend") |
| Currencies, Locations, Taxes, Units, Product Properties, Notes, Todos, Mail, Email Templates/Signatures/Notifications, **SMTP Settings screen**, Pricing Plans, Custom Fields, Access Controls, Securities, Business Processes (Automation), Form Builder, Analytical Reports, Login History screen, Auto-numbering, System Settings, Drive usage | **Placeholder** — 264 API routes in `StubsModule` return empty values and never touch the database | `nexuscore-backend/src/modules/stubs/stubs.controller.ts` |
| AI Chat, AI Chat V2, Image Generator, Text to Speech | **Mock / demo** — canned responses, no AI service is called | `frontend/app/[company]/(auth)/apps/ai-chat/app-render.tsx` |
| Template showcase pages (crypto, hotel, hospital, academy, ecommerce, logistics, payment, widgets, pricing, empty states, alternative login/register pages) | **Template** — static UI samples from the UI kit | No API calls in those folders |

> Several of these placeholder screens appear in the seeded sidebar menu (for example *Apps → Notes*,
> *Apps → Mail*, *Apps → Form Designer*, *AI Apps*). See the decision list in
> [10 — Handover Checklist](10-Client-Handover-Checklist.md) about hiding them before go-live.

## 3. Architecture at a glance

- **Frontend:** Next.js 16 / React 19 application (`frontend/`), served by `next start` on port 3000.
- **Backend:** NestJS 10 modular monolith (`nexuscore-backend/`), REST API under `/api/v1` on
  port 4000, Socket.IO namespace `/nexuscore` for notifications.
- **Database:** one PostgreSQL database (14+). Prisma manages 196 models; a further 532 legacy ERP
  tables (`MA_`, `MD_`, `IM_`, `FI_`, `SM_`, `HR_`, `CR_`, `GL_` …) are created by a guarded baseline
  migration and accessed with raw SQL.
- **Optional services:** RabbitMQ (event fan-out; the API runs without it), SMTP (password-reset and
  first-administrator emails), Meta WhatsApp Cloud API (per-branch configuration).

Details: [02 — System Architecture](02-System-Architecture.md).

## 4. Stakeholders and roles

| Stakeholder | Interest | Where documented |
|---|---|---|
| Client business owner / sponsor | Scope, acceptance, outstanding decisions | This file, [10](10-Client-Handover-Checklist.md) |
| End users (merchandising, production, stores, purchasing, accounts) | Operating the screens | [03 — Module User Manual](03-Module-User-Manual.md) and the client manual (`deliverables/`) |
| Client system administrator | Users, roles, company setup, approvals | [07 — Security and Access](07-Security-and-Access.md) |
| IT / operations | Installation, deployment, backups, monitoring | [06](06-Installation-Guide.md), [09](09-Deployment-and-Maintenance.md) |
| Developers taking over maintenance | Architecture, schema, API, tests | [02](02-System-Architecture.md), [04](04-Database-Design.md), [05](05-API-Reference.md), [08](08-Testing-and-Limitations.md) |

> Names of the client organisation, project sponsor and support contacts were not found in the
> repository and must be filled in by the client (see the sign-off section of
> [10 — Handover Checklist](10-Client-Handover-Checklist.md)).

## 5. Verified capabilities (summary)

Confirmed during the audit by running the automated suites and type checks; see
[08 — Testing and Limitations](08-Testing-and-Limitations.md) for exact results:

- Backend and frontend TypeScript type checks complete with zero errors.
- Business rules covered by passing automated tests include: packing-list box ranges, serial-card
  generation, stock value, receipt approval, receipt invoices and consolidated invoices,
  Work Order BOM transfer, order-manufacturing routes, costing, cutting, user management, company
  provisioning, legacy company isolation (including a real-login HTTP test) and user-defined fields.

**Not verified in this handover:** end-to-end browser walkthroughs of every screen, a production
deployment, backup restoration, e-mail delivery through a real SMTP server, RabbitMQ and WhatsApp
integrations.
