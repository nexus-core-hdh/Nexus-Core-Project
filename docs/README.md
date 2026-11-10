# Nexus Core ERP — Documentation

Handover documentation for the Nexus Core ERP repository. Prepared 2026-11-07 from the repository
state on branch `erp-dashboard-units-grid-colors` (commit `09452f5` plus uncommitted working-tree
changes). Document version **1.0**.

## Quick navigation

| # | Document | Audience | What you will find |
|---|---|---|---|
| 01 | [Project Overview](01-Project-Overview.md) | Everyone | Purpose, scope, what is delivered / mock / placeholder |
| 02 | [System Architecture](02-System-Architecture.md) | IT, developers | Components, data flow, tenancy, integrations, diagrams |
| 03 | [Module User Manual](03-Module-User-Manual.md) | End users, key users | How to use each delivered module, validations, troubleshooting |
| 04 | [Database Design](04-Database-Design.md) | Developers, DBAs | Prisma models, legacy ERP tables, relationships, ER diagrams |
| 05 | [API Reference](05-API-Reference.md) | Developers, integrators | Auth, envelope, errors, paging, endpoint groups |
| — | [Appendix — Endpoint Inventory](appendix-endpoint-inventory.md) | Developers | All 1,461 routes with their access requirement (generated from source) |
| 06 | [Installation Guide](06-Installation-Guide.md) | IT, developers | Prerequisites, configuration, database setup, start-up, troubleshooting |
| 07 | [Security and Access](07-Security-and-Access.md) | Administrators, security | Authentication, RBAC, company isolation, confirmed limitations |
| 08 | [Testing and Limitations](08-Testing-and-Limitations.md) | Everyone | Test suites, actual results, coverage gaps, known issues |
| 09 | [Deployment and Maintenance](09-Deployment-and-Maintenance.md) | IT / operations | Production procedure, upgrades, backups, logs, routine tasks |
| 10 | [Client Handover Checklist](10-Client-Handover-Checklist.md) | Client and delivery team | Deliverables, dependencies, decisions, access, acceptance, sign-off |

## Client-facing manual

- Word: `../deliverables/Nexus-Core-ERP-Client-Manual.docx`
- PDF: `../deliverables/Nexus-Core-ERP-Client-Manual.pdf`

The client manual summarises 01, 03, 06, 07, 08, 09 and 10 for non-developers. Detailed schema and
API material stays in this folder.

## Related existing documents (unchanged)

- [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — production deployment notes
- [`../nexuscore-backend/SETUP.md`](../nexuscore-backend/SETUP.md) — older backend setup guide (partly outdated, see [06](06-Installation-Guide.md))
- [`../performance-audit-report.md`](../performance-audit-report.md) — performance audit

## Conventions

- **Implemented** = backed by a real API and database; **Mock / demo** = browser-only sample data;
  **Placeholder** = API route that returns empty data; **Unverified** = not confirmed during the audit.
- Paths such as `src/modules/...` are relative to `nexuscore-backend/` unless stated otherwise.
- No secrets, passwords or customer records are contained in this documentation.

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-07 | Prepared with Claude Code for `[delivery team]` | Initial handover documentation from repository audit |
