# 10 — Client Handover Checklist

[Documentation index](README.md) · Previous: [Deployment and Maintenance](09-Deployment-and-Maintenance.md)

Use this checklist at the handover meeting. Tick each item only after it has actually been done or
demonstrated. Fields in `[brackets]` are for the client and delivery team to complete.

## 1. Deliverables

| # | Item | Location | Delivered |
|---|---|---|---|
| D1 | Source code (frontend, backend, migrations, scripts, tests) | Git repository `[repository URL]`, release `[tag / commit]` | ☐ |
| D2 | Developer documentation (Markdown) | `docs/` | ☐ |
| D3 | Client manual (Word) | `deliverables/Nexus-Core-ERP-Client-Manual.docx` | ☐ |
| D4 | Client manual (PDF) | `deliverables/Nexus-Core-ERP-Client-Manual.pdf` | ☐ |
| D5 | Existing deployment notes | `DEPLOYMENT.md` | ☐ |
| D6 | Performance audit report | `performance-audit-report.md` | ☐ |
| D7 | Configuration templates (no secrets) | `nexuscore-backend/.env.example`, `frontend/.env.production.example` | ☐ |

## 2. Configuration dependencies (client to provide)

| # | Dependency | Needed for | Provided |
|---|---|---|---|
| C1 | Production server(s) meeting [06 §1](06-Installation-Guide.md#1-prerequisites) | Hosting | ☐ |
| C2 | Domain name and TLS certificate | HTTPS | ☐ |
| C3 | PostgreSQL 14+ instance, backup storage location | Data | ☐ |
| C4 | SMTP account (host, port, user, sender address) | Password reset, administrator invitations | ☐ |
| C5 | `APP_PUBLIC_URL`, `QR_PUBLIC_BASE_URL` | E-mail links, QR labels | ☐ |
| C6 | Storage location for docket documents (URLs) | Docket Management | ☐ |
| C7 | (Optional) RabbitMQ | Event fan-out | ☐ |
| C8 | (Optional) Meta app and WhatsApp numbers | WhatsApp | ☐ |
| C9 | Label printer / phones for serial-card QR scanning | Serial cards | ☐ |

## 3. Outstanding client decisions

| # | Decision | Background | Decision / owner |
|---|---|---|---|
| Q1 | Remove or hide template, demo and placeholder screens (Finance ERP mock, AI Apps, Apps → Notes/Mail/Todo/Form Designer, Pages → template pages, placeholder settings screens) before go-live? | [01 §2.3](01-Project-Overview.md#23-not-delivered-as-working-functionality), [08 L1–L4](08-Testing-and-Limitations.md#4-known-issues-and-limitations) | `[ ]` |
| Q2 | Is a real Finance/accounting module in scope? (current Finance ERP is a mock) | L1 | `[ ]` |
| Q3 | Release or exclude the uncommitted Costing work (lock, manual amounts, Work Order Initial-Cost link + 3 migrations) | L7 | `[ ]` |
| Q4 | Per-company document numbering for Legacy ERP (currently global) | L8 | `[ ]` |
| Q5 | Ownership of a small number of records created before company isolation, and of the service price list table that has no company column | Development notes on company isolation | `[ ]` |
| Q6 | Priority and schedule for security findings S1–S11 (notably S3 secret exposure in login response and S11 cross-company user list) | [07 §7](07-Security-and-Access.md#7-confirmed-security-limitations-code-review) | `[ ]` |
| Q7 | Role design, who administers users, and whether a role-management screen must be built (roles can currently be created only through the API) | [07 §2](07-Security-and-Access.md#2-authorisation-rbac) | `[ ]` |
| Q8 | One company per instance, or several companies sharing roles? | S5 | `[ ]` |
| Q9 | Password policy (length, complexity, MFA) | S9 | `[ ]` |
| Q10 | Hosting and support model, service levels, backup retention | [09](09-Deployment-and-Maintenance.md) | `[ ]` |
| Q11 | Fix of the Current Account attachment download issue | L6 | `[ ]` |

## 4. Access handover

Never send credentials in this document, e-mail or chat. Use a password manager or sealed hand-over.

| # | Access | Handed to | Done |
|---|---|---|---|
| A1 | Git repository (owner/admin rights) | `[name]` | ☐ |
| A2 | Production server / hosting account | `[name]` | ☐ |
| A3 | PostgreSQL superuser and application login | `[name]` | ☐ |
| A4 | Application administrator account (forced password change on first sign-in) | `[name]` | ☐ |
| A5 | `.env` secrets (JWT secrets, DB URL, SMTP password) — regenerate JWT secrets after handover | `[name]` | ☐ |
| A6 | SMTP / Meta / RabbitMQ accounts (if used) | `[name]` | ☐ |
| A7 | Domain / DNS / certificate | `[name]` | ☐ |
| A8 | Revoke developer accounts and credentials no longer needed | `[name]` | ☐ |

## 5. Acceptance checks

Run on the client's staging or production environment. Record the result and the tester.

| # | Check | Expected result | Result / tester |
|---|---|---|---|
| T1 | `/api/v1/health/ready` | `ready` | `[ ]` |
| T2 | Administrator signs in, is forced to change password | Password change succeeds; dashboard opens | `[ ]` |
| T3 | Create a role with selected permissions (via the API — no screen exists) and a user with that role | User can do only the permitted writes (others: *Insufficient permissions*) | `[ ]` |
| T4 | Forgot password e-mail | E-mail received; link resets the password within 30 minutes | `[ ]` |
| T5 | Legacy ERP masters: create a warehouse, current account and inventory card | Saved; duplicate code refused | `[ ]` |
| T6 | PLM: create a Style Card | Saved; listed under the branch | `[ ]` |
| T7 | Work Order from the Style Card; transfer BOM; calculate, lock and unlock requirements | Works; locked requirement refuses changes | `[ ]` |
| T8 | Purchase Order → Purchase Receipt (type 2) with over-receipt attempt | Over-receipt refused; receipt approves | `[ ]` |
| T9 | Create an invoice from the receipt; try a second invoice for the same receipt | First succeeds; second refused | `[ ]` |
| T10 | Packing list with overlapping box ranges | Refused with the overlap message; valid list approves | `[ ]` |
| T11 | Generate serial cards, print a label, scan the QR on a phone | Scan page shows the card after sign-in | `[ ]` |
| T12 | Costing sheet: create, lock, attempt edit, unlock (only if Q3 = release) | Edit refused while locked | `[ ]` |
| T13 | Docket: add a document URL, approve it, create a share link with password, open it from a private browser window | Link opens only with the password; expires as configured | `[ ]` |
| T14 | Report Builder: create a Legacy ERP report, preview, export CSV/XLSX/PDF | Files download and open | `[ ]` |
| T15 | Approval Configuration: require approval for a screen; submit and approve as a second user; try self-approval | Self-approval refused unless enabled | `[ ]` |
| T16 | Second company (if used): its users cannot see the first company's Legacy ERP data | Records answer "not found" | `[ ]` |
| T17 | Backup and restore to a separate database | Restored application starts and shows the data | `[ ]` |
| T18 | Audit log shows the actions performed above | Entries present in *Log Tracking* (`/administration/log-tracking`) | `[ ]` |

## 6. Known limitations acknowledged by the client

The client confirms having read [08 — Testing and Limitations](08-Testing-and-Limitations.md) and
[07 — Security and Access §7](07-Security-and-Access.md#7-confirmed-security-limitations-code-review). ☐

## 7. Sign-off

| Role | Name | Organisation | Signature | Date |
|---|---|---|---|---|
| Client project sponsor | `[ ]` | `[ ]` | | |
| Client IT / system owner | `[ ]` | `[ ]` | | |
| Delivery project manager | `[ ]` | `[ ]` | | |
| Lead developer | `[ ]` | `[ ]` | | |

Acceptance is `[ ] full` / `[ ] conditional on items: ______` / `[ ] not accepted`.
