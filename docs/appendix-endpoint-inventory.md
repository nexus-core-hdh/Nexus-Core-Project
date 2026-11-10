# Appendix — Endpoint Inventory

> Generated on 2026-11-07 by statically parsing every `*.controller.ts` file under
> `nexuscore-backend/src` (decorators `@Controller`, `@Get/@Post/@Put/@Patch/@Delete`,
> `@Public`, `@Permissions`, `@PermissionModule`, `@AllowAuthenticated`). The Report Builder
> routes are created dynamically per module and were expanded by hand from
> `src/modules/reports/report-builder.controller.ts` and `report-modules.ts`.
> Every path is relative to the server root and already includes the global prefix `/api/v1`.

Back to [API Reference](05-API-Reference.md) · [Documentation index](README.md)

## How to read the "Access" column

The value is resolved exactly as `resolveRequiredPermissions()` in
`src/common/decorators/permissions.decorator.ts` resolves it at runtime:

| Access value | Meaning |
|---|---|
| `Public` | No sign-in required (`@Public()`). Some public routes authenticate by other means (share-link token, query token) — see [Security](07-Security-and-Access.md). |
| `Signed-in` | Any authenticated user with a valid access token (and no pending forced password change). |
| `module:action` | The user's roles must grant this permission. Write routes inherit `<module>:create/update/delete` from the controller's `@PermissionModule` unless an explicit `@Permissions` overrides it. |
| `system:unclassified-write` | Write route with no classification — only the system **Admin** ("Full access") role holds it. |

## Totals

| Measure | Count |
|---|---|
| Route handlers | 1461 |
| …of which in `StubsModule` (placeholder routes returning empty data — **not functional**) | 264 |
| Public | 16 |
| Signed-in only | 574 |
| Permission-checked | 862 |
| Admin-only (unclassified write) | 9 |

## Contents

- [approval/approval](#approvalapproval) (6)
- [approval/approval-configuration](#approvalapproval-configuration) (2)
- [audit/audit](#auditaudit) (5)
- [auth/auth](#authauth) (7)
- [bpm/bpm](#bpmbpm) (19)
- [branch/branch](#branchbranch) (6)
- [catalog/catalog](#catalogcatalog) (13)
- [collab/collab](#collabcollab) (20)
- [communication/communication](#communicationcommunication) (26)
- [company/companies](#companycompanies) (7)
- [company/company](#companycompany) (3)
- [config/config](#configconfig) (43)
- [costing/costing](#costingcosting) (17)
- [crm/crm](#crmcrm) (38)
- [cutting/cutting](#cuttingcutting) (30)
- [dashboard/dashboard](#dashboarddashboard) (3)
- [docket-management/docket-management](#docket-managementdocket-management) (21)
- [docket-management/dockets](#docket-managementdockets) (21)
- [docket-management/reports](#docket-managementreports) (6)
- [docket-management/sharing](#docket-managementsharing) (12)
- [documents/documents](#documentsdocuments) (8)
- [entities/entities](#entitiesentities) (34)
- [fabric/fabric](#fabricfabric) (13)
- [feed/feed](#feedfeed) (8)
- [files/files](#filesfiles) (17)
- [finance/finance](#financefinance) (30)
- [fitness/fitness](#fitnessfitness) (12)
- [general-settings/screen-parameter](#general-settingsscreen-parameter) (5)
- [health/health](#healthhealth) (2)
- [legacy-erp/account](#legacy-erpaccount) (16)
- [legacy-erp/contract](#legacy-erpcontract) (15)
- [legacy-erp/cutting-card](#legacy-erpcutting-card) (11)
- [legacy-erp/fabric-card](#legacy-erpfabric-card) (19)
- [legacy-erp/fabric-planning](#legacy-erpfabric-planning) (1)
- [legacy-erp/fabric-yarn-requirements](#legacy-erpfabric-yarn-requirements) (18)
- [legacy-erp/fi-receipt](#legacy-erpfi-receipt) (15)
- [legacy-erp/inventory-card](#legacy-erpinventory-card) (1)
- [legacy-erp/inventory-receipt](#legacy-erpinventory-receipt) (26)
- [legacy-erp/invoice](#legacy-erpinvoice) (17)
- [legacy-erp/item-allocation](#legacy-erpitem-allocation) (5)
- [legacy-erp/item-statement](#legacy-erpitem-statement) (4)
- [legacy-erp/legacy-master-lookup](#legacy-erplegacy-master-lookup) (3)
- [legacy-erp/lookup](#legacy-erplookup) (1)
- [legacy-erp/master-lookup](#legacy-erpmaster-lookup) (5)
- [legacy-erp/order-manufacturing](#legacy-erporder-manufacturing) (6)
- [legacy-erp/order-type](#legacy-erporder-type) (29)
- [legacy-erp/packing-list](#legacy-erppacking-list) (12)
- [legacy-erp/purchase-order](#legacy-erppurchase-order) (29)
- [legacy-erp/receipt-type](#legacy-erpreceipt-type) (27)
- [legacy-erp/recipe-usage](#legacy-erprecipe-usage) (1)
- [legacy-erp/serial-card](#legacy-erpserial-card) (11)
- [legacy-erp/size-set](#legacy-erpsize-set) (11)
- [legacy-erp/trim-card](#legacy-erptrim-card) (11)
- [legacy-erp/trim-inventory-card](#legacy-erptrim-inventory-card) (15)
- [legacy-erp/trim-planning](#legacy-erptrim-planning) (1)
- [legacy-erp/unified-grid](#legacy-erpunified-grid) (2)
- [legacy-erp/unit-set](#legacy-erpunit-set) (11)
- [legacy-erp/warehouse](#legacy-erpwarehouse) (6)
- [legacy-erp/warehouse-parameter](#legacy-erpwarehouse-parameter) (2)
- [legacy-erp/work-order](#legacy-erpwork-order) (17)
- [legacy-erp/worklist-fields](#legacy-erpworklist-fields) (2)
- [legacy-erp/yarn-card](#legacy-erpyarn-card) (15)
- [legacy-erp/yarn-planning](#legacy-erpyarn-planning) (1)
- [logs/logs](#logslogs) (5)
- [lookup/lookup](#lookuplookup) (68)
- [menu-items/menu-items](#menu-itemsmenu-items) (5)
- [notifications/notifications](#notificationsnotifications) (4)
- [pipeline/pipeline](#pipelinepipeline) (16)
- [plm/plm-cards](#plmplm-cards) (52)
- [plm/plm-definitions](#plmplm-definitions) (105)
- [plm/plm-operations](#plmplm-operations) (38)
- [projects/projects](#projectsprojects) (8)
- [reports/report-builder](#reportsreport-builder) (33)
- [reports/reports](#reportsreports) (6)
- [roles/roles](#rolesroles) (15)
- [style-extras/style-extras](#style-extrasstyle-extras) (10)
- [tables/tables](#tablestables) (9)
- [upload/upload](#uploadupload) (2)
- [user-settings/user-settings](#user-settingsuser-settings) (7)
- [users/users](#usersusers) (11)
- [whatsapp/whatsapp](#whatsappwhatsapp) (3)
- [stubs/stubs](#stubsstubs) (264)

## approval/approval

Source: `nexuscore-backend/src/modules/approval/approval.controller.ts`

| Method | Path | Access |
|---|---|---|
| POST | `/api/v1/approval/approve` | `approval:approve` |
| GET | `/api/v1/approval/history` | `approval:view-history` |
| GET | `/api/v1/approval/pending` | `approval:view-pending` |
| POST | `/api/v1/approval/reject` | `approval:reject` |
| GET | `/api/v1/approval/status` | Signed-in |
| POST | `/api/v1/approval/submit` | `approval:create` |

## approval/approval-configuration

Source: `nexuscore-backend/src/modules/approval/approval-configuration.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/general-settings/approval-configurations` | Signed-in |
| PUT | `/api/v1/general-settings/approval-configurations` | `general-settings:manage-approval-configuration` |

## audit/audit

Source: `nexuscore-backend/src/modules/audit/audit.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/audit/logs` | Signed-in |
| GET | `/api/v1/audit/logs/:id` | Signed-in |
| GET | `/api/v1/audit/logs/filters/actions` | Signed-in |
| GET | `/api/v1/audit/logs/filters/entity-types` | Signed-in |
| GET | `/api/v1/audit/logs/filters/modules` | Signed-in |

## auth/auth

Source: `nexuscore-backend/src/modules/auth/auth.controller.ts`

| Method | Path | Access |
|---|---|---|
| POST | `/api/v1/auth/change-password` | Signed-in |
| POST | `/api/v1/auth/forgot-password` | Public |
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/logout` | Signed-in |
| GET | `/api/v1/auth/me` | Signed-in |
| POST | `/api/v1/auth/refresh` | Public |
| POST | `/api/v1/auth/reset-password` | Public |

## bpm/bpm

Source: `nexuscore-backend/src/modules/bpm/bpm.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/bpm/processes` | Signed-in |
| POST | `/api/v1/bpm/processes` | `bpm:create` |
| DELETE | `/api/v1/bpm/processes/:id` | `bpm:delete` |
| GET | `/api/v1/bpm/processes/:id` | Signed-in |
| PATCH | `/api/v1/bpm/processes/:id` | `bpm:update` |
| POST | `/api/v1/bpm/processes/:id/stages` | `bpm:create` |
| DELETE | `/api/v1/bpm/processes/:id/stages/:stageId` | `bpm:delete` |
| PATCH | `/api/v1/bpm/processes/:id/stages/:stageId` | `bpm:update` |
| GET | `/api/v1/bpm/request-types` | Signed-in |
| POST | `/api/v1/bpm/request-types` | `bpm:create` |
| DELETE | `/api/v1/bpm/request-types/:id` | `bpm:delete` |
| PATCH | `/api/v1/bpm/request-types/:id` | `bpm:update` |
| POST | `/api/v1/bpm/seed` | `bpm:create` |
| GET | `/api/v1/bpm/tasks` | Signed-in |
| POST | `/api/v1/bpm/tasks` | `bpm:create` |
| GET | `/api/v1/bpm/tasks/:id` | Signed-in |
| POST | `/api/v1/bpm/tasks/:id/assign` | `bpm:create` |
| GET | `/api/v1/bpm/tasks/:id/history` | Signed-in |
| PATCH | `/api/v1/bpm/tasks/:id/move-stage` | `bpm:update` |

## branch/branch

Source: `nexuscore-backend/src/modules/branch/branch.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/branches` | Signed-in |
| POST | `/api/v1/branches` | `company:create` |
| DELETE | `/api/v1/branches/:id` | `company:delete` |
| GET | `/api/v1/branches/:id` | Signed-in |
| PATCH | `/api/v1/branches/:id` | `company:update` |
| GET | `/api/v1/branches/:id/whatsapp-status` | Signed-in |

## catalog/catalog

Source: `nexuscore-backend/src/modules/catalog/catalog.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/catalog/categories` | Signed-in |
| POST | `/api/v1/catalog/categories` | `catalog:create` |
| DELETE | `/api/v1/catalog/categories/:id` | `catalog:delete` |
| PATCH | `/api/v1/catalog/categories/:id` | `catalog:update` |
| GET | `/api/v1/catalog/products` | Signed-in |
| POST | `/api/v1/catalog/products` | `catalog:create` |
| DELETE | `/api/v1/catalog/products/:id` | `catalog:delete` |
| GET | `/api/v1/catalog/products/:id` | Signed-in |
| PATCH | `/api/v1/catalog/products/:id` | `catalog:update` |
| GET | `/api/v1/catalog/subcategories` | Signed-in |
| POST | `/api/v1/catalog/subcategories` | `catalog:create` |
| DELETE | `/api/v1/catalog/subcategories/:id` | `catalog:delete` |
| PATCH | `/api/v1/catalog/subcategories/:id` | `catalog:update` |

## collab/collab

Source: `nexuscore-backend/src/modules/collab/collab.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/collabs` | Signed-in |
| POST | `/api/v1/collabs` | `collaboration:create` |
| DELETE | `/api/v1/collabs/:id` | `collaboration:delete` |
| GET | `/api/v1/collabs/:id` | Signed-in |
| PATCH | `/api/v1/collabs/:id` | `collaboration:update` |
| POST | `/api/v1/collabs/:id/invitations` | `collaboration:create` |
| POST | `/api/v1/collabs/:id/members` | `collaboration:create` |
| DELETE | `/api/v1/collabs/:id/members/:userId` | `collaboration:delete` |
| GET | `/api/v1/collabs/connections` | Signed-in |
| POST | `/api/v1/collabs/connections` | `collaboration:create` |
| DELETE | `/api/v1/collabs/connections/:id` | `collaboration:delete` |
| PATCH | `/api/v1/collabs/connections/:id` | `collaboration:update` |
| PATCH | `/api/v1/collabs/invitations/:id` | `collaboration:update` |
| POST | `/api/v1/collabs/work-groups` | `collaboration:create` |
| DELETE | `/api/v1/collabs/work-groups/:id` | `collaboration:delete` |
| GET | `/api/v1/collabs/work-groups/:id` | Signed-in |
| PATCH | `/api/v1/collabs/work-groups/:id` | `collaboration:update` |
| POST | `/api/v1/collabs/work-groups/:id/members` | `collaboration:create` |
| DELETE | `/api/v1/collabs/work-groups/:id/members/:userId` | `collaboration:delete` |
| GET | `/api/v1/collabs/work-groups/list` | Signed-in |

## communication/communication

Source: `nexuscore-backend/src/modules/communication/communication.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/communication/chats` | Signed-in |
| POST | `/api/v1/communication/chats` | `communication:create` |
| GET | `/api/v1/communication/chats/:id` | Signed-in |
| GET | `/api/v1/communication/chats/:id/messages` | Signed-in |
| POST | `/api/v1/communication/chats/:id/messages` | `communication:create` |
| GET | `/api/v1/communication/email-notifications` | Signed-in |
| POST | `/api/v1/communication/email-notifications` | `communication:create` |
| PATCH | `/api/v1/communication/email-notifications/:id` | `communication:update` |
| GET | `/api/v1/communication/email-signatures` | Signed-in |
| POST | `/api/v1/communication/email-signatures` | `communication:create` |
| DELETE | `/api/v1/communication/email-signatures/:id` | `communication:delete` |
| PATCH | `/api/v1/communication/email-signatures/:id` | `communication:update` |
| GET | `/api/v1/communication/email-templates` | Signed-in |
| POST | `/api/v1/communication/email-templates` | `communication:create` |
| DELETE | `/api/v1/communication/email-templates/:id` | `communication:delete` |
| PATCH | `/api/v1/communication/email-templates/:id` | `communication:update` |
| GET | `/api/v1/communication/mails` | Signed-in |
| POST | `/api/v1/communication/mails` | `communication:create` |
| DELETE | `/api/v1/communication/mails/:id` | `communication:delete` |
| GET | `/api/v1/communication/mails/:id` | Signed-in |
| PATCH | `/api/v1/communication/mails/:id` | `communication:update` |
| DELETE | `/api/v1/communication/messages/:id` | `communication:delete` |
| GET | `/api/v1/communication/smtp` | Signed-in |
| POST | `/api/v1/communication/smtp` | `communication:create` |
| DELETE | `/api/v1/communication/smtp/:id` | `communication:delete` |
| PATCH | `/api/v1/communication/smtp/:id` | `communication:update` |

## company/companies

Source: `nexuscore-backend/src/modules/company/companies.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/companies` | Signed-in |
| POST | `/api/v1/companies` | `system:unclassified-write` |
| GET | `/api/v1/companies/:id` | Signed-in |
| GET | `/api/v1/companies/:id/first-admin` | Signed-in |
| POST | `/api/v1/companies/:id/first-admin` | `system:unclassified-write` |
| POST | `/api/v1/companies/:id/first-admin/setup-link` | `system:unclassified-write` |
| GET | `/api/v1/companies/access` | Signed-in |

## company/company

Source: `nexuscore-backend/src/modules/company/company.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/company` | Signed-in |
| PUT | `/api/v1/company` | `company:update` |
| POST | `/api/v1/company/meta-config` | `company:create` |

## config/config

Source: `nexuscore-backend/src/modules/config/config.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/config/access-control` | Signed-in |
| POST | `/api/v1/config/access-control` | `settings:create` |
| DELETE | `/api/v1/config/access-control/:id` | `settings:delete` |
| PATCH | `/api/v1/config/access-control/:id` | `settings:update` |
| GET | `/api/v1/config/analytical-reports` | Signed-in |
| POST | `/api/v1/config/analytical-reports` | `settings:create` |
| DELETE | `/api/v1/config/analytical-reports/:id` | `settings:delete` |
| PATCH | `/api/v1/config/analytical-reports/:id` | `settings:update` |
| GET | `/api/v1/config/auto-numbering` | Signed-in |
| PATCH | `/api/v1/config/auto-numbering/:entity` | `settings:update` |
| GET | `/api/v1/config/business-processes` | Signed-in |
| POST | `/api/v1/config/business-processes` | `settings:create` |
| DELETE | `/api/v1/config/business-processes/:id` | `settings:delete` |
| PATCH | `/api/v1/config/business-processes/:id` | `settings:update` |
| GET | `/api/v1/config/crm-roles` | Signed-in |
| POST | `/api/v1/config/crm-roles` | `settings:create` |
| DELETE | `/api/v1/config/crm-roles/:id` | `settings:delete` |
| PATCH | `/api/v1/config/crm-roles/:id` | `settings:update` |
| GET | `/api/v1/config/menu` | Signed-in |
| POST | `/api/v1/config/menu` | `settings:create` |
| DELETE | `/api/v1/config/menu/:id` | `settings:delete` |
| PATCH | `/api/v1/config/menu/:id` | `settings:update` |
| GET | `/api/v1/config/pdf-reports` | Signed-in |
| POST | `/api/v1/config/pdf-reports` | `settings:create` |
| DELETE | `/api/v1/config/pdf-reports/:id` | `settings:delete` |
| GET | `/api/v1/config/permissions` | Signed-in |
| POST | `/api/v1/config/permissions` | `settings:create` |
| DELETE | `/api/v1/config/permissions/:id` | `settings:delete` |
| PATCH | `/api/v1/config/permissions/:id` | `settings:update` |
| GET | `/api/v1/config/pricing-plans` | Signed-in |
| POST | `/api/v1/config/pricing-plans` | `settings:create` |
| DELETE | `/api/v1/config/pricing-plans/:id` | `settings:delete` |
| PATCH | `/api/v1/config/pricing-plans/:id` | `settings:update` |
| GET | `/api/v1/config/report-templates` | Signed-in |
| POST | `/api/v1/config/report-templates` | `settings:create` |
| DELETE | `/api/v1/config/report-templates/:id` | `settings:delete` |
| PATCH | `/api/v1/config/report-templates/:id` | `settings:update` |
| GET | `/api/v1/config/security` | Signed-in |
| POST | `/api/v1/config/security` | `settings:create` |
| DELETE | `/api/v1/config/security/:id` | `settings:delete` |
| PATCH | `/api/v1/config/security/:id` | `settings:update` |
| GET | `/api/v1/config/system` | Signed-in |
| PATCH | `/api/v1/config/system` | `settings:update` |

## costing/costing

Source: `nexuscore-backend/src/modules/costing/costing.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/plm/costing-sheets` | Signed-in |
| POST | `/api/v1/plm/costing-sheets` | `costing:create` |
| DELETE | `/api/v1/plm/costing-sheets/:id` | `costing:delete` |
| GET | `/api/v1/plm/costing-sheets/:id` | Signed-in |
| PUT | `/api/v1/plm/costing-sheets/:id` | `costing:update` |
| PUT | `/api/v1/plm/costing-sheets/:id/labor-lines` | `costing:update` |
| POST | `/api/v1/plm/costing-sheets/:id/lock` | `costing:lock` |
| PUT | `/api/v1/plm/costing-sheets/:id/other-lines` | `costing:update` |
| GET | `/api/v1/plm/costing-sheets/:id/profit-breakdown` | Signed-in |
| PUT | `/api/v1/plm/costing-sheets/:id/raw-material-lines` | `costing:update` |
| POST | `/api/v1/plm/costing-sheets/:id/unlock` | `costing:unlock` |
| GET | `/api/v1/plm/costing-sheets/lock-permissions` | Signed-in |
| GET | `/api/v1/plm/costing-sheets/lookup` | Signed-in |
| GET | `/api/v1/plm/sample-cards/:id/costing-sheets` | Signed-in |
| POST | `/api/v1/plm/sample-cards/:id/issue-costing-sheet` | `costing:create` |
| GET | `/api/v1/plm/style-cards/:id/costing-sheets` | Signed-in |
| POST | `/api/v1/plm/style-cards/:id/issue-costing-sheet` | `costing:create` |

## crm/crm

Source: `nexuscore-backend/src/modules/crm/crm.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/crm/activities` | Signed-in |
| POST | `/api/v1/crm/activities` | `crm:create` |
| DELETE | `/api/v1/crm/activities/:id` | `crm:delete` |
| GET | `/api/v1/crm/calendar-events` | Signed-in |
| POST | `/api/v1/crm/calendar-events` | `crm:create` |
| DELETE | `/api/v1/crm/calendar-events/:id` | `crm:delete` |
| GET | `/api/v1/crm/calendar-events/:id` | Signed-in |
| PATCH | `/api/v1/crm/calendar-events/:id` | `crm:update` |
| GET | `/api/v1/crm/comments` | Signed-in |
| POST | `/api/v1/crm/comments` | `crm:create` |
| DELETE | `/api/v1/crm/comments/:id` | `crm:delete` |
| PATCH | `/api/v1/crm/comments/:id` | `crm:update` |
| DELETE | `/api/v1/crm/note-checklists/:id` | `crm:delete` |
| PATCH | `/api/v1/crm/note-checklists/:id` | `crm:update` |
| GET | `/api/v1/crm/note-labels` | Signed-in |
| POST | `/api/v1/crm/note-labels` | `crm:create` |
| DELETE | `/api/v1/crm/note-labels/:id` | `crm:delete` |
| PATCH | `/api/v1/crm/note-labels/:id` | `crm:update` |
| GET | `/api/v1/crm/notes` | Signed-in |
| POST | `/api/v1/crm/notes` | `crm:create` |
| DELETE | `/api/v1/crm/notes/:id` | `crm:delete` |
| GET | `/api/v1/crm/notes/:id` | Signed-in |
| PATCH | `/api/v1/crm/notes/:id` | `crm:update` |
| POST | `/api/v1/crm/notes/:noteId/checklists` | `crm:create` |
| GET | `/api/v1/crm/reminders` | Signed-in |
| POST | `/api/v1/crm/reminders` | `crm:create` |
| DELETE | `/api/v1/crm/reminders/:id` | `crm:delete` |
| PATCH | `/api/v1/crm/reminders/:id` | `crm:update` |
| DELETE | `/api/v1/crm/todo-comments/:id` | `crm:delete` |
| DELETE | `/api/v1/crm/todo-subtasks/:id` | `crm:delete` |
| PATCH | `/api/v1/crm/todo-subtasks/:id` | `crm:update` |
| GET | `/api/v1/crm/todos` | Signed-in |
| POST | `/api/v1/crm/todos` | `crm:create` |
| DELETE | `/api/v1/crm/todos/:id` | `crm:delete` |
| GET | `/api/v1/crm/todos/:id` | Signed-in |
| PATCH | `/api/v1/crm/todos/:id` | `crm:update` |
| POST | `/api/v1/crm/todos/:todoId/comments` | `crm:create` |
| POST | `/api/v1/crm/todos/:todoId/subtasks` | `crm:create` |

## cutting/cutting

Source: `nexuscore-backend/src/modules/cutting/cutting.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/cutting-orders` | Signed-in |
| POST | `/api/v1/cutting-orders` | `cutting:create` |
| DELETE | `/api/v1/cutting-orders/:id` | `cutting:delete` |
| GET | `/api/v1/cutting-orders/:id` | Signed-in |
| PATCH | `/api/v1/cutting-orders/:id` | `cutting:update` |
| GET | `/api/v1/cutting-orders/:id/approval-history` | Signed-in |
| POST | `/api/v1/cutting-orders/:id/approve` | `cutting:create` |
| GET | `/api/v1/cutting-orders/:id/audit-trail` | Signed-in |
| GET | `/api/v1/cutting-orders/:id/batches` | Signed-in |
| POST | `/api/v1/cutting-orders/:id/batches` | `cutting:create` |
| PATCH | `/api/v1/cutting-orders/:id/batches/:bId/complete` | `cutting:update` |
| PATCH | `/api/v1/cutting-orders/:id/batches/:bId/start` | `cutting:update` |
| POST | `/api/v1/cutting-orders/:id/complete` | `cutting:create` |
| GET | `/api/v1/cutting-orders/:id/cost` | Signed-in |
| PUT | `/api/v1/cutting-orders/:id/cost` | `cutting:update` |
| GET | `/api/v1/cutting-orders/:id/documents` | Signed-in |
| POST | `/api/v1/cutting-orders/:id/documents` | `cutting:create` |
| DELETE | `/api/v1/cutting-orders/:id/documents/:docId` | `cutting:delete` |
| GET | `/api/v1/cutting-orders/:id/lines` | Signed-in |
| POST | `/api/v1/cutting-orders/:id/lines` | `cutting:create` |
| DELETE | `/api/v1/cutting-orders/:id/lines/:lineId` | `cutting:delete` |
| GET | `/api/v1/cutting-orders/:id/marker-plan` | Signed-in |
| PUT | `/api/v1/cutting-orders/:id/marker-plan` | `cutting:update` |
| GET | `/api/v1/cutting-orders/:id/qr` | Signed-in |
| POST | `/api/v1/cutting-orders/:id/reject` | `cutting:create` |
| GET | `/api/v1/cutting-orders/:id/rolls` | Signed-in |
| POST | `/api/v1/cutting-orders/:id/rolls` | `cutting:create` |
| DELETE | `/api/v1/cutting-orders/:id/rolls/:rollId` | `cutting:delete` |
| PATCH | `/api/v1/cutting-orders/:id/status` | `cutting:update` |
| POST | `/api/v1/cutting-orders/:id/submit-approval` | `cutting:create` |

## dashboard/dashboard

Source: `nexuscore-backend/src/modules/dashboard/dashboard.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/dashboard/order-kpis` | Signed-in |
| GET | `/api/v1/dashboard/recent-activity` | Signed-in |
| GET | `/api/v1/dashboard/recent-transactions` | Signed-in |

## docket-management/docket-management

Source: `nexuscore-backend/src/modules/docket-management/docket-management.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/docket-setup/approval-workflows` | Signed-in |
| POST | `/api/v1/docket-setup/approval-workflows` | `dockets:create` |
| DELETE | `/api/v1/docket-setup/approval-workflows/:id` | `dockets:delete` |
| GET | `/api/v1/docket-setup/approval-workflows/:id` | Signed-in |
| PUT | `/api/v1/docket-setup/approval-workflows/:id` | `dockets:update` |
| GET | `/api/v1/docket-setup/document-types` | Signed-in |
| POST | `/api/v1/docket-setup/document-types` | `dockets:create` |
| DELETE | `/api/v1/docket-setup/document-types/:id` | `dockets:delete` |
| GET | `/api/v1/docket-setup/document-types/:id` | Signed-in |
| PUT | `/api/v1/docket-setup/document-types/:id` | `dockets:update` |
| PATCH | `/api/v1/docket-setup/document-types/:id/toggle` | `dockets:update` |
| GET | `/api/v1/docket-setup/templates` | Signed-in |
| POST | `/api/v1/docket-setup/templates` | `dockets:create` |
| DELETE | `/api/v1/docket-setup/templates/:id` | `dockets:delete` |
| GET | `/api/v1/docket-setup/templates/:id` | Signed-in |
| PUT | `/api/v1/docket-setup/templates/:id` | `dockets:update` |
| POST | `/api/v1/docket-setup/templates/:id/duplicate` | `dockets:create` |
| POST | `/api/v1/docket-setup/templates/:id/items` | `dockets:create` |
| DELETE | `/api/v1/docket-setup/templates/:id/items/:itemId` | `dockets:delete` |
| PUT | `/api/v1/docket-setup/templates/:id/items/:itemId` | `dockets:update` |
| PATCH | `/api/v1/docket-setup/templates/:id/set-default` | `dockets:update` |

## docket-management/dockets

Source: `nexuscore-backend/src/modules/docket-management/dockets.controller.ts`

| Method | Path | Access |
|---|---|---|
| DELETE | `/api/v1/docket-documents/:id` | `dockets:delete` |
| GET | `/api/v1/docket-documents/:id` | Signed-in |
| GET | `/api/v1/docket-documents/:id/download` | Signed-in |
| DELETE | `/api/v1/docket-items/:id` | `dockets:delete` |
| GET | `/api/v1/docket-items/:id` | Signed-in |
| PATCH | `/api/v1/docket-items/:id` | `dockets:update` |
| PATCH | `/api/v1/docket-items/:id/approve` | `dockets:update` |
| GET | `/api/v1/docket-items/:id/documents` | Signed-in |
| POST | `/api/v1/docket-items/:id/documents` | `dockets:create` |
| GET | `/api/v1/docket-items/:id/history` | Signed-in |
| PATCH | `/api/v1/docket-items/:id/reject` | `dockets:update` |
| PATCH | `/api/v1/docket-items/:id/request-revision` | `dockets:update` |
| GET | `/api/v1/dockets` | Signed-in |
| POST | `/api/v1/dockets` | `dockets:create` |
| DELETE | `/api/v1/dockets/:id` | `dockets:delete` |
| GET | `/api/v1/dockets/:id` | Signed-in |
| GET | `/api/v1/dockets/:id/items` | Signed-in |
| POST | `/api/v1/dockets/:id/items` | `dockets:create` |
| POST | `/api/v1/dockets/:id/recalculate` | `dockets:create` |
| PATCH | `/api/v1/dockets/:id/status` | `dockets:update` |
| GET | `/api/v1/dockets/entity/:entityType/:entityId` | Signed-in |

## docket-management/reports

Source: `nexuscore-backend/src/modules/docket-management/reports.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/docket-reports/approval-status` | Signed-in |
| GET | `/api/v1/docket-reports/buyer-access-log` | Signed-in |
| GET | `/api/v1/docket-reports/completeness` | Signed-in |
| GET | `/api/v1/docket-reports/document-expiry` | Signed-in |
| GET | `/api/v1/docket-reports/missing-documents` | Signed-in |
| GET | `/api/v1/docket-reports/version-history` | Signed-in |

## docket-management/sharing

Source: `nexuscore-backend/src/modules/docket-management/sharing.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/dockets/:id/buyer-access-log` | Signed-in |
| POST | `/api/v1/dockets/:id/external-review` | `dockets:create` |
| GET | `/api/v1/dockets/:id/share-links` | Signed-in |
| POST | `/api/v1/dockets/:id/share-links` | `dockets:create` |
| GET | `/api/v1/dockets/external-reviews` | Signed-in |
| DELETE | `/api/v1/dockets/share-links/:linkId` | `dockets:delete` |
| PATCH | `/api/v1/dockets/share-links/:linkId` | `dockets:update` |
| GET | `/api/v1/public/dockets/:token` | Public |
| GET | `/api/v1/public/dockets/:token/documents/:docId` | Public |
| POST | `/api/v1/public/dockets/:token/verify-password` | Public |
| GET | `/api/v1/public/review/:token` | Public |
| POST | `/api/v1/public/review/:token/comment` | Public |

## documents/documents

Source: `nexuscore-backend/src/modules/documents/documents.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/documents` | Signed-in |
| DELETE | `/api/v1/documents/:id` | `collaboration:delete` |
| GET | `/api/v1/documents/:id` | Signed-in |
| PUT | `/api/v1/documents/:id` | `collaboration:update` |
| POST | `/api/v1/documents/board` | `collaboration:create` |
| POST | `/api/v1/documents/excel` | `collaboration:create` |
| POST | `/api/v1/documents/powerpoint` | `collaboration:create` |
| POST | `/api/v1/documents/word` | `collaboration:create` |

## entities/entities

Source: `nexuscore-backend/src/modules/entities/entities.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/entities/custom-field-targets` | Signed-in |
| GET | `/api/v1/entities/custom-field-values` | Signed-in |
| PUT | `/api/v1/entities/custom-field-values` | Signed-in |
| GET | `/api/v1/entities/custom-field-values/grid` | Signed-in |
| PUT | `/api/v1/entities/custom-field-values/grid` | Signed-in |
| GET | `/api/v1/entities/custom-fields` | Signed-in |
| POST | `/api/v1/entities/custom-fields` | `settings:create` |
| DELETE | `/api/v1/entities/custom-fields/:id` | `settings:delete` |
| PATCH | `/api/v1/entities/custom-fields/:id` | `settings:update` |
| POST | `/api/v1/entities/custom-fields/reorder` | `settings:update` |
| GET | `/api/v1/entities/data` | Signed-in |
| POST | `/api/v1/entities/data` | `crm:create` |
| DELETE | `/api/v1/entities/data/:id` | `crm:delete` |
| GET | `/api/v1/entities/data/:id` | Signed-in |
| PATCH | `/api/v1/entities/data/:id` | `crm:update` |
| DELETE | `/api/v1/entities/fields/:id` | `crm:delete` |
| PATCH | `/api/v1/entities/fields/:id` | `crm:update` |
| GET | `/api/v1/entities/pages` | Signed-in |
| POST | `/api/v1/entities/pages` | `crm:create` |
| DELETE | `/api/v1/entities/pages/:id` | `crm:delete` |
| GET | `/api/v1/entities/pages/:id` | Signed-in |
| PATCH | `/api/v1/entities/pages/:id` | `crm:update` |
| GET | `/api/v1/entities/pages/slug/:slug` | Signed-in |
| GET | `/api/v1/entities/schema/:entityName` | Signed-in |
| GET | `/api/v1/entities/sections` | Signed-in |
| POST | `/api/v1/entities/sections` | `crm:create` |
| DELETE | `/api/v1/entities/sections/:id` | `crm:delete` |
| PATCH | `/api/v1/entities/sections/:id` | `crm:update` |
| POST | `/api/v1/entities/sections/:sectionId/fields` | `crm:create` |
| GET | `/api/v1/entities/templates` | Signed-in |
| POST | `/api/v1/entities/templates` | `crm:create` |
| DELETE | `/api/v1/entities/templates/:id` | `crm:delete` |
| GET | `/api/v1/entities/templates/:id` | Signed-in |
| PATCH | `/api/v1/entities/templates/:id` | `crm:update` |

## fabric/fabric

Source: `nexuscore-backend/src/modules/fabric/fabric.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/fabric-rolls` | Signed-in |
| POST | `/api/v1/fabric-rolls` | `fabric:create` |
| DELETE | `/api/v1/fabric-rolls/:id` | `fabric:delete` |
| GET | `/api/v1/fabric-rolls/:id` | Signed-in |
| PATCH | `/api/v1/fabric-rolls/:id` | `fabric:update` |
| POST | `/api/v1/fabric-rolls/:id/consume` | `fabric:create` |
| GET | `/api/v1/fabric-rolls/:id/qr` | Signed-in |
| GET | `/api/v1/fabric-rolls/available` | Signed-in |
| GET | `/api/v1/fabric-types` | Signed-in |
| POST | `/api/v1/fabric-types` | `fabric:create` |
| DELETE | `/api/v1/fabric-types/:id` | `fabric:delete` |
| GET | `/api/v1/fabric-types/:id` | Signed-in |
| PATCH | `/api/v1/fabric-types/:id` | `fabric:update` |

## feed/feed

Source: `nexuscore-backend/src/modules/feed/feed.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/feed` | Signed-in |
| POST | `/api/v1/feed` | `collaboration:create` |
| DELETE | `/api/v1/feed/:id` | `collaboration:delete` |
| GET | `/api/v1/feed/:id` | Signed-in |
| PATCH | `/api/v1/feed/:id` | `collaboration:update` |
| POST | `/api/v1/feed/:id/comments` | `collaboration:create` |
| POST | `/api/v1/feed/:id/like` | Signed-in |
| DELETE | `/api/v1/feed/comments/:id` | `collaboration:delete` |

## files/files

Source: `nexuscore-backend/src/modules/files/files.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/files` | Signed-in |
| POST | `/api/v1/files` | `files:create` |
| DELETE | `/api/v1/files/:id` | `files:delete` |
| GET | `/api/v1/files/:id` | Signed-in |
| PATCH | `/api/v1/files/:id` | `files:update` |
| GET | `/api/v1/files/docs/rich` | Signed-in |
| POST | `/api/v1/files/docs/rich` | `files:create` |
| DELETE | `/api/v1/files/docs/rich/:id` | `files:delete` |
| GET | `/api/v1/files/docs/rich/:id` | Signed-in |
| PATCH | `/api/v1/files/docs/rich/:id` | `files:update` |
| GET | `/api/v1/files/folders` | Signed-in |
| POST | `/api/v1/files/folders` | `files:create` |
| DELETE | `/api/v1/files/folders/:id` | `files:delete` |
| GET | `/api/v1/files/folders/:id` | Signed-in |
| PATCH | `/api/v1/files/folders/:id` | `files:update` |
| GET | `/api/v1/files/storage/quota` | Signed-in |
| PATCH | `/api/v1/files/storage/quota` | `files:update` |

## finance/finance

Source: `nexuscore-backend/src/modules/finance/finance.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/finance/customers` | Signed-in |
| POST | `/api/v1/finance/customers` | `finance:create` |
| DELETE | `/api/v1/finance/customers/:id` | `finance:delete` |
| GET | `/api/v1/finance/customers/:id` | Signed-in |
| PATCH | `/api/v1/finance/customers/:id` | `finance:update` |
| DELETE | `/api/v1/finance/order-items/:id` | `finance:delete` |
| PATCH | `/api/v1/finance/order-items/:id` | `finance:update` |
| GET | `/api/v1/finance/order-returns` | Signed-in |
| POST | `/api/v1/finance/order-returns` | `finance:create` |
| DELETE | `/api/v1/finance/order-returns/:id` | `finance:delete` |
| PATCH | `/api/v1/finance/order-returns/:id` | `finance:update` |
| GET | `/api/v1/finance/orders` | Signed-in |
| POST | `/api/v1/finance/orders` | `finance:create` |
| DELETE | `/api/v1/finance/orders/:id` | `finance:delete` |
| GET | `/api/v1/finance/orders/:id` | Signed-in |
| PATCH | `/api/v1/finance/orders/:id` | `finance:update` |
| POST | `/api/v1/finance/orders/:orderId/items` | `finance:create` |
| GET | `/api/v1/finance/payments` | Signed-in |
| POST | `/api/v1/finance/payments` | `finance:create` |
| DELETE | `/api/v1/finance/payments/:id` | `finance:delete` |
| PATCH | `/api/v1/finance/payments/:id` | `finance:update` |
| GET | `/api/v1/finance/supplier-payments` | Signed-in |
| POST | `/api/v1/finance/supplier-payments` | `finance:create` |
| DELETE | `/api/v1/finance/supplier-payments/:id` | `finance:delete` |
| PATCH | `/api/v1/finance/supplier-payments/:id` | `finance:update` |
| GET | `/api/v1/finance/suppliers` | Signed-in |
| POST | `/api/v1/finance/suppliers` | `finance:create` |
| DELETE | `/api/v1/finance/suppliers/:id` | `finance:delete` |
| GET | `/api/v1/finance/suppliers/:id` | Signed-in |
| PATCH | `/api/v1/finance/suppliers/:id` | `finance:update` |

## fitness/fitness

Source: `nexuscore-backend/src/modules/fitness/fitness.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/fitness/activities` | Signed-in |
| POST | `/api/v1/fitness/activities` | `fitness:create` |
| DELETE | `/api/v1/fitness/activities/:id` | `fitness:delete` |
| PATCH | `/api/v1/fitness/activities/:id` | `fitness:update` |
| GET | `/api/v1/fitness/nutrition` | Signed-in |
| POST | `/api/v1/fitness/nutrition` | `fitness:create` |
| DELETE | `/api/v1/fitness/nutrition/:id` | `fitness:delete` |
| PATCH | `/api/v1/fitness/nutrition/:id` | `fitness:update` |
| GET | `/api/v1/fitness/sleep` | Signed-in |
| POST | `/api/v1/fitness/sleep` | `fitness:create` |
| DELETE | `/api/v1/fitness/sleep/:id` | `fitness:delete` |
| PATCH | `/api/v1/fitness/sleep/:id` | `fitness:update` |

## general-settings/screen-parameter

Source: `nexuscore-backend/src/modules/general-settings/screen-parameter.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/general-settings/screen-parameters` | Signed-in |
| POST | `/api/v1/general-settings/screen-parameters` | `general-settings:manage-screen-parameters` |
| DELETE | `/api/v1/general-settings/screen-parameters/:id` | `general-settings:manage-screen-parameters` |
| PUT | `/api/v1/general-settings/screen-parameters/:id` | `general-settings:manage-screen-parameters` |
| GET | `/api/v1/general-settings/screen-parameters/active` | Signed-in |

## health/health

Source: `nexuscore-backend/src/modules/health/health.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/health` | Public |
| GET | `/api/v1/health/ready` | Public |

## legacy-erp/account

Source: `nexuscore-backend/src/modules/legacy-erp/account.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/accounts` | Signed-in |
| POST | `/api/v1/legacy-erp/accounts` | `current-accounts:create` |
| DELETE | `/api/v1/legacy-erp/accounts/:id` | `current-accounts:delete` |
| GET | `/api/v1/legacy-erp/accounts/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/accounts/:id` | `current-accounts:update` |
| GET | `/api/v1/legacy-erp/accounts/:id/:tab` | Signed-in |
| POST | `/api/v1/legacy-erp/accounts/:id/:tab` | `current-accounts:create` |
| DELETE | `/api/v1/legacy-erp/accounts/:id/:tab/:lineId` | `current-accounts:delete` |
| GET | `/api/v1/legacy-erp/accounts/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/accounts/:id/attachments` | `current-accounts:create` |
| DELETE | `/api/v1/legacy-erp/accounts/:id/attachments/:attId` | `current-accounts:delete` |
| GET | `/api/v1/legacy-erp/accounts/:id/attachments/:attId/content` | Public |
| GET | `/api/v1/legacy-erp/accounts/:id/attachments/:attId/view-token` | Signed-in |
| GET | `/api/v1/legacy-erp/accounts/:id/totals/all` | Signed-in |
| GET | `/api/v1/legacy-erp/accounts/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/accounts/next-code` | Signed-in |

## legacy-erp/contract

Source: `nexuscore-backend/src/modules/legacy-erp/contract.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/contracts/:receiptType` | Signed-in |
| POST | `/api/v1/legacy-erp/contracts/:receiptType` | `contracts:create` |
| DELETE | `/api/v1/legacy-erp/contracts/:receiptType/:id` | `contracts:delete` |
| GET | `/api/v1/legacy-erp/contracts/:receiptType/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/contracts/:receiptType/:id` | `contracts:update` |
| GET | `/api/v1/legacy-erp/contracts/:receiptType/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/contracts/:receiptType/:id/attachments` | `contracts:create` |
| DELETE | `/api/v1/legacy-erp/contracts/:receiptType/:id/attachments/:attId` | `contracts:delete` |
| GET | `/api/v1/legacy-erp/contracts/:receiptType/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/contracts/:receiptType/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/contracts/:receiptType/:id/items` | `contracts:create` |
| DELETE | `/api/v1/legacy-erp/contracts/:receiptType/:id/items/:itemId` | `contracts:delete` |
| PUT | `/api/v1/legacy-erp/contracts/:receiptType/:id/items/:itemId` | `contracts:update` |
| GET | `/api/v1/legacy-erp/contracts/:receiptType/by-receipt-no/:receiptNo` | Signed-in |
| GET | `/api/v1/legacy-erp/contracts/:receiptType/next-receipt-no` | Signed-in |

## legacy-erp/cutting-card

Source: `nexuscore-backend/src/modules/legacy-erp/cutting-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/work-orders/:id/cutting-card` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/cutting-card/color-totals` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders/:id/cutting-card/detail` | `cutting-cards:create` |
| POST | `/api/v1/legacy-erp/work-orders/:id/cutting-card/entries` | `cutting-cards:create` |
| DELETE | `/api/v1/legacy-erp/work-orders/:id/cutting-card/entries/:entryId` | `cutting-cards:delete` |
| PUT | `/api/v1/legacy-erp/work-orders/:id/cutting-card/entries/:entryId` | `cutting-cards:update` |
| POST | `/api/v1/legacy-erp/work-orders/:id/cutting-card/entries/:entryId/size` | `cutting-cards:create` |
| GET | `/api/v1/legacy-erp/work-orders/:id/cutting-card/fabrics` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/cutting-card/matrix` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/cutting-card/order` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/cutting-card/order/fabrics` | Signed-in |

## legacy-erp/fabric-card

Source: `nexuscore-backend/src/modules/legacy-erp/fabric-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/fabric-cards` | Signed-in |
| POST | `/api/v1/legacy-erp/fabric-cards` | `fabric-cards:create` |
| DELETE | `/api/v1/legacy-erp/fabric-cards/:id` | `fabric-cards:delete` |
| GET | `/api/v1/legacy-erp/fabric-cards/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/fabric-cards/:id` | `fabric-cards:update` |
| GET | `/api/v1/legacy-erp/fabric-cards/:id/:tab` | Signed-in |
| POST | `/api/v1/legacy-erp/fabric-cards/:id/:tab` | `fabric-cards:create` |
| DELETE | `/api/v1/legacy-erp/fabric-cards/:id/:tab/:lineId` | `fabric-cards:delete` |
| PUT | `/api/v1/legacy-erp/fabric-cards/:id/:tab/:lineId` | `fabric-cards:update` |
| GET | `/api/v1/legacy-erp/fabric-cards/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/fabric-cards/:id/attachments` | `fabric-cards:create` |
| DELETE | `/api/v1/legacy-erp/fabric-cards/:id/attachments/:attId` | `fabric-cards:delete` |
| GET | `/api/v1/legacy-erp/fabric-cards/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/fabric-cards/:id/yarn-recipe` | Signed-in |
| PUT | `/api/v1/legacy-erp/fabric-cards/:id/yarn-recipe` | `fabric-cards:update` |
| GET | `/api/v1/legacy-erp/fabric-cards/:id/yarn-recipe/colors` | Signed-in |
| GET | `/api/v1/legacy-erp/fabric-cards/:id/yarn-recipe/summary` | Signed-in |
| GET | `/api/v1/legacy-erp/fabric-cards/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/fabric-cards/next-code` | Signed-in |

## legacy-erp/fabric-planning

Source: `nexuscore-backend/src/modules/legacy-erp/fabric-planning.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/fabric-planning` | Signed-in |

## legacy-erp/fabric-yarn-requirements

Source: `nexuscore-backend/src/modules/legacy-erp/fabric-yarn-requirements.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements` | Signed-in |
| DELETE | `/api/v1/legacy-erp/work-orders/:id/requirements/:recordId` | `requirements:delete` |
| DELETE | `/api/v1/legacy-erp/work-orders/:id/requirements/all` | `requirements:delete` |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/bom-source` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/calculate` | `requirements:create` |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/consumption` | `requirements:create` |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/has-history` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/lock` | `requirements:lock` |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/lock-status` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/manufacturing-quantity` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/mapping-warnings` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/material-color` | `requirements:create` |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/refresh-bom-from-style-card` | `work-orders:update` |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/save` | `requirements:create` |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/saved` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/total` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/requirements/transactions` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders/:id/requirements/unlock` | `requirements:unlock` |

## legacy-erp/fi-receipt

Source: `nexuscore-backend/src/modules/legacy-erp/fi-receipt.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/financial-receipts` | Signed-in |
| POST | `/api/v1/legacy-erp/financial-receipts` | `financial-receipts:create` |
| DELETE | `/api/v1/legacy-erp/financial-receipts/:id` | `financial-receipts:delete` |
| GET | `/api/v1/legacy-erp/financial-receipts/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/financial-receipts/:id` | `financial-receipts:update` |
| GET | `/api/v1/legacy-erp/financial-receipts/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/financial-receipts/:id/attachments` | `financial-receipts:create` |
| DELETE | `/api/v1/legacy-erp/financial-receipts/:id/attachments/:attId` | `financial-receipts:delete` |
| GET | `/api/v1/legacy-erp/financial-receipts/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/financial-receipts/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/financial-receipts/:id/items` | `financial-receipts:create` |
| DELETE | `/api/v1/legacy-erp/financial-receipts/:id/items/:itemId` | `financial-receipts:delete` |
| PUT | `/api/v1/legacy-erp/financial-receipts/:id/items/:itemId` | `financial-receipts:update` |
| GET | `/api/v1/legacy-erp/financial-receipts/by-receipt-no/:receiptNo` | Signed-in |
| GET | `/api/v1/legacy-erp/financial-receipts/next-receipt-no` | Signed-in |

## legacy-erp/inventory-card

Source: `nexuscore-backend/src/modules/legacy-erp/inventory-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/inventory-cards` | Signed-in |

## legacy-erp/inventory-receipt

Source: `nexuscore-backend/src/modules/legacy-erp/inventory-receipt.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/inventory-receipts` | Signed-in |
| POST | `/api/v1/legacy-erp/inventory-receipts` | `inventory-receipts:create` |
| DELETE | `/api/v1/legacy-erp/inventory-receipts/:id` | `inventory-receipts:delete` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/inventory-receipts/:id` | `inventory-receipts:update` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id/approval-status` | Signed-in |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/approve` | `approval:approve` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/attachments` | `inventory-receipts:create` |
| DELETE | `/api/v1/legacy-erp/inventory-receipts/:id/attachments/:attId` | `inventory-receipts:delete` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/items` | `inventory-receipts:create` |
| DELETE | `/api/v1/legacy-erp/inventory-receipts/:id/items/:itemId` | `inventory-receipts:delete` |
| PUT | `/api/v1/legacy-erp/inventory-receipts/:id/items/:itemId` | `inventory-receipts:update` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id/items/:itemId/variants` | Signed-in |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/items/:itemId/variants` | `inventory-receipts:create` |
| DELETE | `/api/v1/legacy-erp/inventory-receipts/:id/items/:itemId/variants/:variantLineId` | `inventory-receipts:delete` |
| PUT | `/api/v1/legacy-erp/inventory-receipts/:id/items/:itemId/variants/:variantLineId` | `inventory-receipts:update` |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/reject` | `approval:reject` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:id/related-receipts` | Signed-in |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/submit-for-approval` | `inventory-receipts:create` |
| POST | `/api/v1/legacy-erp/inventory-receipts/:id/unapprove` | `approval:approve` |
| GET | `/api/v1/legacy-erp/inventory-receipts/by-receipt-no/:receiptNo` | Signed-in |
| GET | `/api/v1/legacy-erp/inventory-receipts/item-variant-options/:inventoryId` | Signed-in |
| GET | `/api/v1/legacy-erp/inventory-receipts/next-receipt-no` | Signed-in |

## legacy-erp/invoice

Source: `nexuscore-backend/src/modules/legacy-erp/invoice.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/invoices/:receiptType` | Signed-in |
| POST | `/api/v1/legacy-erp/invoices/:receiptType` | `invoices:create` |
| DELETE | `/api/v1/legacy-erp/invoices/:receiptType/:id` | `invoices:delete` |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/invoices/:receiptType/:id` | `invoices:update` |
| POST | `/api/v1/legacy-erp/invoices/:receiptType/:id/approve` | `approval:approve` |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/invoices/:receiptType/:id/attachments` | `invoices:create` |
| DELETE | `/api/v1/legacy-erp/invoices/:receiptType/:id/attachments/:attId` | `invoices:delete` |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/:id/attachments/:attId/content` | Signed-in |
| POST | `/api/v1/legacy-erp/invoices/:receiptType/:id/unapprove` | `approval:approve` |
| POST | `/api/v1/legacy-erp/invoices/:receiptType/from-receipt/:receiptId` | `invoices:create` |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/next-code` | Signed-in |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/receipt-candidates` | Signed-in |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/source-receipt-types` | Signed-in |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/source-receipts` | Signed-in |
| GET | `/api/v1/legacy-erp/invoices/:receiptType/source-receipts/:receiptId` | Signed-in |

## legacy-erp/item-allocation

Source: `nexuscore-backend/src/modules/legacy-erp/item-allocation.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/item-allocations` | Signed-in |
| POST | `/api/v1/legacy-erp/item-allocations` | `item-allocation:create` |
| DELETE | `/api/v1/legacy-erp/item-allocations/:id` | `item-allocation:delete` |
| GET | `/api/v1/legacy-erp/item-allocations/available-receipts` | Signed-in |
| GET | `/api/v1/legacy-erp/item-allocations/receipt-items/:id` | Signed-in |

## legacy-erp/item-statement

Source: `nexuscore-backend/src/modules/legacy-erp/item-statement.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/inventory-items/:itemId/statement` | Signed-in |
| GET | `/api/v1/legacy-erp/inventory-items/:itemId/statement/detailed` | Signed-in |
| GET | `/api/v1/legacy-erp/inventory-items/ledger` | Signed-in |
| GET | `/api/v1/legacy-erp/inventory-items/ledger/detailed` | Signed-in |

## legacy-erp/legacy-master-lookup

Source: `nexuscore-backend/src/modules/legacy-erp/legacy-master-lookup.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/lookup/tables/:key` | Signed-in |
| GET | `/api/v1/legacy-erp/lookup/tables/:key/:id` | Signed-in |
| GET | `/api/v1/legacy-erp/lookup/tables/item-units/:inventoryId` | Signed-in |

## legacy-erp/lookup

Source: `nexuscore-backend/src/modules/legacy-erp/lookup.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/lookup/parameters/:group` | Signed-in |

## legacy-erp/master-lookup

Source: `nexuscore-backend/src/modules/legacy-erp/master-lookup.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/master-lookup/:key` | Signed-in |
| POST | `/api/v1/legacy-erp/master-lookup/:key` | `master-data:create` |
| DELETE | `/api/v1/legacy-erp/master-lookup/:key/:id` | `master-data:delete` |
| PUT | `/api/v1/legacy-erp/master-lookup/:key/:id` | `master-data:update` |
| GET | `/api/v1/legacy-erp/master-lookup/:key/meta` | Signed-in |

## legacy-erp/order-manufacturing

Source: `nexuscore-backend/src/modules/legacy-erp/order-manufacturing.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/order-manufacturing/context` | Signed-in |
| GET | `/api/v1/legacy-erp/order-manufacturing/entries` | Signed-in |
| PUT | `/api/v1/legacy-erp/order-manufacturing/entries` | `order-manufacturing:update` |
| GET | `/api/v1/legacy-erp/order-manufacturing/price-contracts` | Signed-in |
| PUT | `/api/v1/legacy-erp/order-manufacturing/price-contracts` | `order-manufacturing:update` |
| GET | `/api/v1/legacy-erp/order-manufacturing/processes` | Signed-in |

## legacy-erp/order-type

Source: `nexuscore-backend/src/modules/legacy-erp/order-type.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/orders/:receiptType` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType` | `orders:create` |
| DELETE | `/api/v1/legacy-erp/orders/:receiptType/:id` | `orders:delete` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/orders/:receiptType/:id` | `orders:update` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/approval-status` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/approve` | `approval:approve` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/attachments` | `orders:create` |
| DELETE | `/api/v1/legacy-erp/orders/:receiptType/:id/attachments/:attId` | `orders:delete` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/explanations` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/explanations` | `orders:create` |
| DELETE | `/api/v1/legacy-erp/orders/:receiptType/:id/explanations/:explanationId` | `orders:delete` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/items` | `orders:create` |
| DELETE | `/api/v1/legacy-erp/orders/:receiptType/:id/items/:itemId` | `orders:delete` |
| PUT | `/api/v1/legacy-erp/orders/:receiptType/:id/items/:itemId` | `orders:update` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/items/:itemId/variants` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/items/:itemId/variants` | `orders:create` |
| DELETE | `/api/v1/legacy-erp/orders/:receiptType/:id/items/:itemId/variants/:variantLineId` | `orders:delete` |
| PUT | `/api/v1/legacy-erp/orders/:receiptType/:id/items/:itemId/variants/:variantLineId` | `orders:update` |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/reject` | `approval:reject` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/:id/related-receipts` | Signed-in |
| POST | `/api/v1/legacy-erp/orders/:receiptType/:id/submit-for-approval` | `orders:create` |
| GET | `/api/v1/legacy-erp/orders/:receiptType/by-receipt-no/:receiptNo` | Signed-in |
| GET | `/api/v1/legacy-erp/orders/:receiptType/item-variant-options/:inventoryId` | Signed-in |
| GET | `/api/v1/legacy-erp/orders/:receiptType/next-receipt-no` | Signed-in |
| GET | `/api/v1/legacy-erp/orders/:receiptType/pending` | Signed-in |

## legacy-erp/packing-list

Source: `nexuscore-backend/src/modules/legacy-erp/packing-list.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/packing-lists` | Signed-in |
| POST | `/api/v1/legacy-erp/packing-lists` | `packing-lists:create` |
| DELETE | `/api/v1/legacy-erp/packing-lists/:id` | `packing-lists:delete` |
| GET | `/api/v1/legacy-erp/packing-lists/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/packing-lists/:id` | `packing-lists:update` |
| POST | `/api/v1/legacy-erp/packing-lists/:id/approve` | `approval:approve` |
| GET | `/api/v1/legacy-erp/packing-lists/:id/lines` | Signed-in |
| PUT | `/api/v1/legacy-erp/packing-lists/:id/lines` | `packing-lists:update` |
| GET | `/api/v1/legacy-erp/packing-lists/:id/summary` | Signed-in |
| POST | `/api/v1/legacy-erp/packing-lists/:id/unapprove` | `approval:approve` |
| GET | `/api/v1/legacy-erp/packing-lists/next-code` | Signed-in |
| GET | `/api/v1/legacy-erp/packing-lists/work-order-context/:workOrderId` | Signed-in |

## legacy-erp/purchase-order

Source: `nexuscore-backend/src/modules/legacy-erp/purchase-order.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/purchase-orders` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders` | `purchase-orders:create` |
| DELETE | `/api/v1/legacy-erp/purchase-orders/:id` | `purchase-orders:delete` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/purchase-orders/:id` | `purchase-orders:update` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/approval-status` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/approve` | `approval:approve` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/attachments` | `purchase-orders:create` |
| DELETE | `/api/v1/legacy-erp/purchase-orders/:id/attachments/:attId` | `purchase-orders:delete` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/explanations` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/explanations` | `purchase-orders:create` |
| DELETE | `/api/v1/legacy-erp/purchase-orders/:id/explanations/:explanationId` | `purchase-orders:delete` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/items` | `purchase-orders:create` |
| DELETE | `/api/v1/legacy-erp/purchase-orders/:id/items/:itemId` | `purchase-orders:delete` |
| PUT | `/api/v1/legacy-erp/purchase-orders/:id/items/:itemId` | `purchase-orders:update` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/items/:itemId/variants` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/items/:itemId/variants` | `purchase-orders:create` |
| DELETE | `/api/v1/legacy-erp/purchase-orders/:id/items/:itemId/variants/:variantLineId` | `purchase-orders:delete` |
| PUT | `/api/v1/legacy-erp/purchase-orders/:id/items/:itemId/variants/:variantLineId` | `purchase-orders:update` |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/reject` | `approval:reject` |
| GET | `/api/v1/legacy-erp/purchase-orders/:id/related-receipts` | Signed-in |
| POST | `/api/v1/legacy-erp/purchase-orders/:id/submit-for-approval` | `purchase-orders:create` |
| GET | `/api/v1/legacy-erp/purchase-orders/by-receipt-no/:receiptNo` | Signed-in |
| GET | `/api/v1/legacy-erp/purchase-orders/item-variant-options/:inventoryId` | Signed-in |
| GET | `/api/v1/legacy-erp/purchase-orders/next-receipt-no` | Signed-in |
| GET | `/api/v1/legacy-erp/purchase-orders/pending` | Signed-in |

## legacy-erp/receipt-type

Source: `nexuscore-backend/src/modules/legacy-erp/receipt-type.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/receipts/:receiptType` | Signed-in |
| POST | `/api/v1/legacy-erp/receipts/:receiptType` | `receipts:create` |
| DELETE | `/api/v1/legacy-erp/receipts/:receiptType/:id` | `receipts:delete` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/receipts/:receiptType/:id` | `receipts:update` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id/approval-status` | Signed-in |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/approve` | `approval:approve` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/attachments` | `receipts:create` |
| DELETE | `/api/v1/legacy-erp/receipts/:receiptType/:id/attachments/:attId` | `receipts:delete` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/items` | `receipts:create` |
| DELETE | `/api/v1/legacy-erp/receipts/:receiptType/:id/items/:itemId` | `receipts:delete` |
| PUT | `/api/v1/legacy-erp/receipts/:receiptType/:id/items/:itemId` | `receipts:update` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id/items/:itemId/variants` | Signed-in |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/items/:itemId/variants` | `receipts:create` |
| DELETE | `/api/v1/legacy-erp/receipts/:receiptType/:id/items/:itemId/variants/:variantLineId` | `receipts:delete` |
| PUT | `/api/v1/legacy-erp/receipts/:receiptType/:id/items/:itemId/variants/:variantLineId` | `receipts:update` |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/reject` | `approval:reject` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/:id/related-receipts` | Signed-in |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/submit-for-approval` | `receipts:create` |
| POST | `/api/v1/legacy-erp/receipts/:receiptType/:id/unapprove` | `approval:approve` |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/by-receipt-no/:receiptNo` | Signed-in |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/item-variant-options/:inventoryId` | Signed-in |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/next-receipt-no` | Signed-in |
| GET | `/api/v1/legacy-erp/receipts/:receiptType/related-lines` | Signed-in |

## legacy-erp/recipe-usage

Source: `nexuscore-backend/src/modules/legacy-erp/recipe-usage.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/recipe-usage` | Signed-in |

## legacy-erp/serial-card

Source: `nexuscore-backend/src/modules/legacy-erp/serial-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/inventory-receipts/:receiptId/items/:itemId/serial-cards` | Signed-in |
| PATCH | `/api/v1/legacy-erp/inventory-receipts/:receiptId/items/:itemId/serial-cards` | `serial-cards:update` |
| POST | `/api/v1/legacy-erp/inventory-receipts/:receiptId/items/:itemId/serial-cards` | `serial-cards:create` |
| GET | `/api/v1/legacy-erp/inventory-receipts/:receiptId/items/:itemId/serial-cards/context` | Signed-in |
| GET | `/api/v1/legacy-erp/serial-cards` | Signed-in |
| PATCH | `/api/v1/legacy-erp/serial-cards` | `serial-cards:update` |
| DELETE | `/api/v1/legacy-erp/serial-cards/:id` | `serial-cards:delete` |
| GET | `/api/v1/legacy-erp/serial-cards/:id/detail` | Signed-in |
| PATCH | `/api/v1/legacy-erp/serial-cards/assign-quantity` | `serial-cards:update` |
| GET | `/api/v1/legacy-erp/serial-cards/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/serial-cards/labels` | Signed-in |

## legacy-erp/size-set

Source: `nexuscore-backend/src/modules/legacy-erp/size-set.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/size-sets` | Signed-in |
| POST | `/api/v1/legacy-erp/size-sets` | `master-data:create` |
| DELETE | `/api/v1/legacy-erp/size-sets/:id` | `master-data:delete` |
| GET | `/api/v1/legacy-erp/size-sets/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/size-sets/:id` | `master-data:update` |
| GET | `/api/v1/legacy-erp/size-sets/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/size-sets/:id/items` | `master-data:create` |
| DELETE | `/api/v1/legacy-erp/size-sets/:id/items/:itemId` | `master-data:delete` |
| PUT | `/api/v1/legacy-erp/size-sets/:id/items/:itemId` | `master-data:update` |
| GET | `/api/v1/legacy-erp/size-sets/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/size-sets/next-code` | Signed-in |

## legacy-erp/trim-card

Source: `nexuscore-backend/src/modules/legacy-erp/trim-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/trim-cards` | Signed-in |
| POST | `/api/v1/legacy-erp/trim-cards` | `trim-cards:create` |
| DELETE | `/api/v1/legacy-erp/trim-cards/:id` | `trim-cards:delete` |
| GET | `/api/v1/legacy-erp/trim-cards/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/trim-cards/:id` | `trim-cards:update` |
| GET | `/api/v1/legacy-erp/trim-cards/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/trim-cards/:id/items` | `trim-cards:create` |
| DELETE | `/api/v1/legacy-erp/trim-cards/:id/items/:itemId` | `trim-cards:delete` |
| PUT | `/api/v1/legacy-erp/trim-cards/:id/items/:itemId` | `trim-cards:update` |
| GET | `/api/v1/legacy-erp/trim-cards/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/trim-cards/next-code` | Signed-in |

## legacy-erp/trim-inventory-card

Source: `nexuscore-backend/src/modules/legacy-erp/trim-inventory-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/trim-inventory-cards` | Signed-in |
| POST | `/api/v1/legacy-erp/trim-inventory-cards` | `trim-inventory-cards:create` |
| DELETE | `/api/v1/legacy-erp/trim-inventory-cards/:id` | `trim-inventory-cards:delete` |
| GET | `/api/v1/legacy-erp/trim-inventory-cards/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/trim-inventory-cards/:id` | `trim-inventory-cards:update` |
| GET | `/api/v1/legacy-erp/trim-inventory-cards/:id/:tab` | Signed-in |
| POST | `/api/v1/legacy-erp/trim-inventory-cards/:id/:tab` | `trim-inventory-cards:create` |
| DELETE | `/api/v1/legacy-erp/trim-inventory-cards/:id/:tab/:lineId` | `trim-inventory-cards:delete` |
| PUT | `/api/v1/legacy-erp/trim-inventory-cards/:id/:tab/:lineId` | `trim-inventory-cards:update` |
| GET | `/api/v1/legacy-erp/trim-inventory-cards/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/trim-inventory-cards/:id/attachments` | `trim-inventory-cards:create` |
| DELETE | `/api/v1/legacy-erp/trim-inventory-cards/:id/attachments/:attId` | `trim-inventory-cards:delete` |
| GET | `/api/v1/legacy-erp/trim-inventory-cards/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/trim-inventory-cards/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/trim-inventory-cards/next-code` | Signed-in |

## legacy-erp/trim-planning

Source: `nexuscore-backend/src/modules/legacy-erp/trim-planning.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/trim-planning` | Signed-in |

## legacy-erp/unified-grid

Source: `nexuscore-backend/src/modules/legacy-erp/unified-grid.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/unified-grid/:key` | Signed-in |
| GET | `/api/v1/legacy-erp/unified-grid/meta` | Signed-in |

## legacy-erp/unit-set

Source: `nexuscore-backend/src/modules/legacy-erp/unit-set.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/unit-sets` | Signed-in |
| POST | `/api/v1/legacy-erp/unit-sets` | `master-data:create` |
| DELETE | `/api/v1/legacy-erp/unit-sets/:id` | `master-data:delete` |
| GET | `/api/v1/legacy-erp/unit-sets/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/unit-sets/:id` | `master-data:update` |
| GET | `/api/v1/legacy-erp/unit-sets/:id/items` | Signed-in |
| POST | `/api/v1/legacy-erp/unit-sets/:id/items` | `master-data:create` |
| DELETE | `/api/v1/legacy-erp/unit-sets/:id/items/:itemId` | `master-data:delete` |
| PUT | `/api/v1/legacy-erp/unit-sets/:id/items/:itemId` | `master-data:update` |
| GET | `/api/v1/legacy-erp/unit-sets/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/unit-sets/next-code` | Signed-in |

## legacy-erp/warehouse

Source: `nexuscore-backend/src/modules/legacy-erp/warehouse.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/warehouses` | Signed-in |
| POST | `/api/v1/legacy-erp/warehouses` | `warehouses:create` |
| DELETE | `/api/v1/legacy-erp/warehouses/:id` | `warehouses:delete` |
| GET | `/api/v1/legacy-erp/warehouses/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/warehouses/:id` | `warehouses:update` |
| GET | `/api/v1/legacy-erp/warehouses/next-code` | Signed-in |

## legacy-erp/warehouse-parameter

Source: `nexuscore-backend/src/modules/legacy-erp/warehouse-parameter.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/warehouse-parameters` | Signed-in |
| PUT | `/api/v1/legacy-erp/warehouse-parameters` | `warehouses:update` |

## legacy-erp/work-order

Source: `nexuscore-backend/src/modules/legacy-erp/work-order.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/work-orders` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders` | `work-orders:create` |
| DELETE | `/api/v1/legacy-erp/work-orders/:id` | `work-orders:delete` |
| GET | `/api/v1/legacy-erp/work-orders/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/work-orders/:id` | `work-orders:update` |
| GET | `/api/v1/legacy-erp/work-orders/:id/:tab` | Signed-in |
| POST | `/api/v1/legacy-erp/work-orders/:id/:tab` | `work-orders:create` |
| DELETE | `/api/v1/legacy-erp/work-orders/:id/:tab/:lineId` | `work-orders:delete` |
| PUT | `/api/v1/legacy-erp/work-orders/:id/:tab/:lineId` | `work-orders:update` |
| GET | `/api/v1/legacy-erp/work-orders/:id/bom/:lineType` | Signed-in |
| PUT | `/api/v1/legacy-erp/work-orders/:id/bom/:lineType` | `work-orders:update` |
| GET | `/api/v1/legacy-erp/work-orders/:id/bom/style-card-transfer` | Signed-in |
| GET | `/api/v1/legacy-erp/work-orders/:id/items` | Signed-in |
| PUT | `/api/v1/legacy-erp/work-orders/:id/items` | `work-orders:update` |
| GET | `/api/v1/legacy-erp/work-orders/items/:itemId/variants` | Signed-in |
| PUT | `/api/v1/legacy-erp/work-orders/items/:itemId/variants` | `work-orders:update` |
| GET | `/api/v1/legacy-erp/work-orders/next-code` | Signed-in |

## legacy-erp/worklist-fields

Source: `nexuscore-backend/src/modules/legacy-erp/worklist-fields.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/worklist-fields` | Signed-in |
| POST | `/api/v1/legacy-erp/worklist-fields/resolve` | Signed-in |

## legacy-erp/yarn-card

Source: `nexuscore-backend/src/modules/legacy-erp/yarn-card.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/yarn-cards` | Signed-in |
| POST | `/api/v1/legacy-erp/yarn-cards` | `yarn-cards:create` |
| DELETE | `/api/v1/legacy-erp/yarn-cards/:id` | `yarn-cards:delete` |
| GET | `/api/v1/legacy-erp/yarn-cards/:id` | Signed-in |
| PUT | `/api/v1/legacy-erp/yarn-cards/:id` | `yarn-cards:update` |
| GET | `/api/v1/legacy-erp/yarn-cards/:id/:tab` | Signed-in |
| POST | `/api/v1/legacy-erp/yarn-cards/:id/:tab` | `yarn-cards:create` |
| DELETE | `/api/v1/legacy-erp/yarn-cards/:id/:tab/:lineId` | `yarn-cards:delete` |
| PUT | `/api/v1/legacy-erp/yarn-cards/:id/:tab/:lineId` | `yarn-cards:update` |
| GET | `/api/v1/legacy-erp/yarn-cards/:id/attachments` | Signed-in |
| POST | `/api/v1/legacy-erp/yarn-cards/:id/attachments` | `yarn-cards:create` |
| DELETE | `/api/v1/legacy-erp/yarn-cards/:id/attachments/:attId` | `yarn-cards:delete` |
| GET | `/api/v1/legacy-erp/yarn-cards/:id/attachments/:attId/content` | Signed-in |
| GET | `/api/v1/legacy-erp/yarn-cards/by-code/:code` | Signed-in |
| GET | `/api/v1/legacy-erp/yarn-cards/next-code` | Signed-in |

## legacy-erp/yarn-planning

Source: `nexuscore-backend/src/modules/legacy-erp/yarn-planning.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/legacy-erp/yarn-planning` | Signed-in |

## logs/logs

Source: `nexuscore-backend/src/modules/logs/logs.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/logs/exceptions` | `logs:read` |
| POST | `/api/v1/logs/exceptions` | Signed-in |
| DELETE | `/api/v1/logs/exceptions/clear` | `logs:delete` |
| GET | `/api/v1/logs/login-history` | `logs:read` |
| GET | `/api/v1/logs/login-history/me` | Signed-in |

## lookup/lookup

Source: `nexuscore-backend/src/modules/lookup/lookup.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/lookup/call-statuses` | Signed-in |
| POST | `/api/v1/lookup/call-statuses` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/call-statuses/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/call-statuses/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/company-types` | Signed-in |
| POST | `/api/v1/lookup/company-types` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/company-types/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/company-types/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/contact-types` | Signed-in |
| POST | `/api/v1/lookup/contact-types` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/contact-types/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/contact-types/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/currencies` | Signed-in |
| POST | `/api/v1/lookup/currencies` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/currencies/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/currencies/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/deal-types` | Signed-in |
| POST | `/api/v1/lookup/deal-types` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/deal-types/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/deal-types/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/document-stages` | Signed-in |
| POST | `/api/v1/lookup/document-stages` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/document-stages/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/document-stages/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/employees` | Signed-in |
| POST | `/api/v1/lookup/employees` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/employees/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/employees/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/estimate-stages` | Signed-in |
| POST | `/api/v1/lookup/estimate-stages` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/estimate-stages/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/estimate-stages/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/industries` | Signed-in |
| POST | `/api/v1/lookup/industries` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/industries/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/industries/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/invoice-stages` | Signed-in |
| POST | `/api/v1/lookup/invoice-stages` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/invoice-stages/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/invoice-stages/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/lead-stages` | Signed-in |
| POST | `/api/v1/lookup/lead-stages` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/lead-stages/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/lead-stages/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/locations` | Signed-in |
| POST | `/api/v1/lookup/locations` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/locations/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/locations/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/product-properties` | Signed-in |
| POST | `/api/v1/lookup/product-properties` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/product-properties/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/product-properties/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/salutations` | Signed-in |
| POST | `/api/v1/lookup/salutations` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/salutations/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/salutations/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/sources` | Signed-in |
| POST | `/api/v1/lookup/sources` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/sources/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/sources/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/taxes` | Signed-in |
| POST | `/api/v1/lookup/taxes` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/taxes/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/taxes/:id` | `crm-settings:update` |
| GET | `/api/v1/lookup/units` | Signed-in |
| POST | `/api/v1/lookup/units` | `crm-settings:create` |
| DELETE | `/api/v1/lookup/units/:id` | `crm-settings:delete` |
| PATCH | `/api/v1/lookup/units/:id` | `crm-settings:update` |

## menu-items/menu-items

Source: `nexuscore-backend/src/modules/menu-items/menu-items.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/menu-items` | Signed-in |
| POST | `/api/v1/menu-items` | `menu:create` |
| DELETE | `/api/v1/menu-items/:id` | `menu:delete` |
| PUT | `/api/v1/menu-items/:id` | `menu:update` |
| POST | `/api/v1/menu-items/reorder` | `menu:create` |

## notifications/notifications

Source: `nexuscore-backend/src/modules/notifications/notifications.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/notifications` | Signed-in |
| PATCH | `/api/v1/notifications/:id/read` | Signed-in |
| PATCH | `/api/v1/notifications/read-all` | Signed-in |
| GET | `/api/v1/notifications/unread-count` | Signed-in |

## pipeline/pipeline

Source: `nexuscore-backend/src/modules/pipeline/pipeline.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/pipeline` | Signed-in |
| POST | `/api/v1/pipeline` | `crm:create` |
| DELETE | `/api/v1/pipeline/:id` | `crm:delete` |
| GET | `/api/v1/pipeline/:id` | Signed-in |
| PATCH | `/api/v1/pipeline/:id` | `crm:update` |
| POST | `/api/v1/pipeline/:pipelineId/stages` | `crm:create` |
| POST | `/api/v1/pipeline/connections` | `crm:create` |
| DELETE | `/api/v1/pipeline/connections/:id` | `crm:delete` |
| POST | `/api/v1/pipeline/dashboards` | `crm:create` |
| DELETE | `/api/v1/pipeline/dashboards/:id` | `crm:delete` |
| GET | `/api/v1/pipeline/dashboards/:id` | Signed-in |
| PATCH | `/api/v1/pipeline/dashboards/:id` | `crm:update` |
| PATCH | `/api/v1/pipeline/dashboards/:id/prefs` | `crm:update` |
| GET | `/api/v1/pipeline/dashboards/list` | Signed-in |
| DELETE | `/api/v1/pipeline/stages/:id` | `crm:delete` |
| PATCH | `/api/v1/pipeline/stages/:id` | `crm:update` |

## plm/plm-cards

Source: `nexuscore-backend/src/modules/plm/plm-cards.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/plm/mood-boards` | Signed-in |
| POST | `/api/v1/plm/mood-boards` | `plm:create` |
| DELETE | `/api/v1/plm/mood-boards/:id` | `plm:delete` |
| GET | `/api/v1/plm/mood-boards/:id` | Signed-in |
| PUT | `/api/v1/plm/mood-boards/:id` | `plm:update` |
| POST | `/api/v1/plm/mood-boards/:id/images` | `plm:create` |
| GET | `/api/v1/plm/product-cards` | Signed-in |
| POST | `/api/v1/plm/product-cards` | `plm:create` |
| DELETE | `/api/v1/plm/product-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/product-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/product-cards/:id` | `plm:update` |
| POST | `/api/v1/plm/product-cards/:id/duplicate` | `plm:create` |
| GET | `/api/v1/plm/product-cards/:id/measurements` | Signed-in |
| POST | `/api/v1/plm/product-cards/:id/measurements` | `plm:create` |
| PUT | `/api/v1/plm/product-cards/:id/measurements` | `plm:update` |
| GET | `/api/v1/plm/product-cards/:id/samples` | Signed-in |
| PATCH | `/api/v1/plm/product-cards/:id/status` | `plm:update` |
| GET | `/api/v1/plm/product-cards/:id/swatches` | Signed-in |
| POST | `/api/v1/plm/product-cards/:id/swatches` | `plm:create` |
| DELETE | `/api/v1/plm/product-cards/:id/swatches/:swatchId` | `plm:delete` |
| GET | `/api/v1/plm/sample-cards` | Signed-in |
| POST | `/api/v1/plm/sample-cards` | `plm:create` |
| DELETE | `/api/v1/plm/sample-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/sample-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/sample-cards/:id` | `plm:update` |
| POST | `/api/v1/plm/sample-cards/:id/create-style-card` | `plm:create` |
| GET | `/api/v1/plm/sample-cards/:id/details` | Signed-in |
| PUT | `/api/v1/plm/sample-cards/:id/details` | `plm:update` |
| POST | `/api/v1/plm/sample-cards/:id/duplicate` | `plm:create` |
| GET | `/api/v1/plm/sample-cards/:id/history` | Signed-in |
| GET | `/api/v1/plm/sample-cards/:id/orders` | Signed-in |
| PATCH | `/api/v1/plm/sample-cards/:id/status` | `plm:update` |
| GET | `/api/v1/plm/style-cards` | Signed-in |
| POST | `/api/v1/plm/style-cards` | `plm:create` |
| DELETE | `/api/v1/plm/style-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/style-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/style-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/style-cards/:id/details` | Signed-in |
| POST | `/api/v1/plm/style-cards/:id/details` | `plm:create` |
| PUT | `/api/v1/plm/style-cards/:id/details` | `plm:update` |
| POST | `/api/v1/plm/style-cards/:id/duplicate` | `plm:create` |
| GET | `/api/v1/plm/style-cards/:id/orders` | Signed-in |
| GET | `/api/v1/plm/style-cards/:id/products` | Signed-in |
| GET | `/api/v1/plm/style-cards/:id/samples` | Signed-in |
| PATCH | `/api/v1/plm/style-cards/:id/status` | `plm:update` |
| GET | `/api/v1/plm/style-cards/next-code` | Signed-in |
| GET | `/api/v1/plm/swatch-cards` | Signed-in |
| POST | `/api/v1/plm/swatch-cards` | `plm:create` |
| DELETE | `/api/v1/plm/swatch-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/swatch-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/swatch-cards/:id` | `plm:update` |
| POST | `/api/v1/plm/swatch-cards/:id/link-product` | `plm:create` |

## plm/plm-definitions

Source: `nexuscore-backend/src/modules/plm/plm-definitions.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/plm/activity-type-cards` | Signed-in |
| POST | `/api/v1/plm/activity-type-cards` | `plm:create` |
| DELETE | `/api/v1/plm/activity-type-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/activity-type-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/activity-type-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/brand-cards` | Signed-in |
| POST | `/api/v1/plm/brand-cards` | `plm:create` |
| DELETE | `/api/v1/plm/brand-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/brand-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/brand-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/color-cards` | Signed-in |
| POST | `/api/v1/plm/color-cards` | `plm:create` |
| DELETE | `/api/v1/plm/color-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/color-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/color-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/company-cards` | Signed-in |
| POST | `/api/v1/plm/company-cards` | `plm:create` |
| DELETE | `/api/v1/plm/company-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/company-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/company-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/department-cards` | Signed-in |
| POST | `/api/v1/plm/department-cards` | `plm:create` |
| DELETE | `/api/v1/plm/department-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/department-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/department-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/department-cards/:id/employees` | Signed-in |
| GET | `/api/v1/plm/design-detail-types` | Signed-in |
| POST | `/api/v1/plm/design-detail-types` | `plm:create` |
| DELETE | `/api/v1/plm/design-detail-types/:id` | `plm:delete` |
| GET | `/api/v1/plm/design-detail-types/:id` | Signed-in |
| PUT | `/api/v1/plm/design-detail-types/:id` | `plm:update` |
| GET | `/api/v1/plm/employee-cards` | Signed-in |
| POST | `/api/v1/plm/employee-cards` | `plm:create` |
| DELETE | `/api/v1/plm/employee-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/employee-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/employee-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/gender-cards` | Signed-in |
| POST | `/api/v1/plm/gender-cards` | `plm:create` |
| DELETE | `/api/v1/plm/gender-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/gender-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/gender-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/measurement-charts` | Signed-in |
| POST | `/api/v1/plm/measurement-charts` | `plm:create` |
| DELETE | `/api/v1/plm/measurement-charts/:id` | `plm:delete` |
| GET | `/api/v1/plm/measurement-charts/:id` | Signed-in |
| PUT | `/api/v1/plm/measurement-charts/:id` | `plm:update` |
| PUT | `/api/v1/plm/measurement-charts/:id/lines` | `plm:update` |
| GET | `/api/v1/plm/measurement-definitions` | Signed-in |
| POST | `/api/v1/plm/measurement-definitions` | `plm:create` |
| DELETE | `/api/v1/plm/measurement-definitions/:id` | `plm:delete` |
| GET | `/api/v1/plm/measurement-definitions/:id` | Signed-in |
| PUT | `/api/v1/plm/measurement-definitions/:id` | `plm:update` |
| GET | `/api/v1/plm/process-cards` | Signed-in |
| POST | `/api/v1/plm/process-cards` | `plm:create` |
| DELETE | `/api/v1/plm/process-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/process-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/process-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/resource-cards` | Signed-in |
| POST | `/api/v1/plm/resource-cards` | `plm:create` |
| DELETE | `/api/v1/plm/resource-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/resource-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/resource-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/route-cards` | Signed-in |
| POST | `/api/v1/plm/route-cards` | `plm:create` |
| DELETE | `/api/v1/plm/route-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/route-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/route-cards/:id` | `plm:update` |
| POST | `/api/v1/plm/route-cards/:id/lines` | `plm:create` |
| DELETE | `/api/v1/plm/route-cards/:id/lines/:lineId` | `plm:delete` |
| PUT | `/api/v1/plm/route-cards/:id/lines/:lineId` | `plm:update` |
| GET | `/api/v1/plm/sample-task-types` | Signed-in |
| POST | `/api/v1/plm/sample-task-types` | `plm:create` |
| DELETE | `/api/v1/plm/sample-task-types/:id` | `plm:delete` |
| GET | `/api/v1/plm/sample-task-types/:id` | Signed-in |
| PUT | `/api/v1/plm/sample-task-types/:id` | `plm:update` |
| GET | `/api/v1/plm/season-cards` | Signed-in |
| POST | `/api/v1/plm/season-cards` | `plm:create` |
| DELETE | `/api/v1/plm/season-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/season-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/season-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/size-cards` | Signed-in |
| POST | `/api/v1/plm/size-cards` | `plm:create` |
| DELETE | `/api/v1/plm/size-cards/:id` | `plm:delete` |
| GET | `/api/v1/plm/size-cards/:id` | Signed-in |
| PUT | `/api/v1/plm/size-cards/:id` | `plm:update` |
| GET | `/api/v1/plm/study-templates` | Signed-in |
| POST | `/api/v1/plm/study-templates` | `plm:create` |
| DELETE | `/api/v1/plm/study-templates/:id` | `plm:delete` |
| GET | `/api/v1/plm/study-templates/:id` | Signed-in |
| PUT | `/api/v1/plm/study-templates/:id` | `plm:update` |
| PUT | `/api/v1/plm/study-templates/:id/lines` | `plm:update` |
| DELETE | `/api/v1/plm/study-templates/:id/lines/:lineId` | `plm:delete` |
| GET | `/api/v1/plm/style-sample-types` | Signed-in |
| POST | `/api/v1/plm/style-sample-types` | `plm:create` |
| DELETE | `/api/v1/plm/style-sample-types/:id` | `plm:delete` |
| GET | `/api/v1/plm/style-sample-types/:id` | Signed-in |
| PUT | `/api/v1/plm/style-sample-types/:id` | `plm:update` |
| GET | `/api/v1/plm/templates` | Signed-in |
| POST | `/api/v1/plm/templates` | `plm:create` |
| DELETE | `/api/v1/plm/templates/:id` | `plm:delete` |
| GET | `/api/v1/plm/templates/:id` | Signed-in |
| PUT | `/api/v1/plm/templates/:id` | `plm:update` |
| POST | `/api/v1/plm/templates/:id/duplicate` | `plm:create` |
| PUT | `/api/v1/plm/templates/:id/lines` | `plm:update` |
| DELETE | `/api/v1/plm/templates/:id/lines/:lineId` | `plm:delete` |

## plm/plm-operations

Source: `nexuscore-backend/src/modules/plm/plm-operations.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/plm/critical-path` | Signed-in |
| POST | `/api/v1/plm/critical-path` | `plm:create` |
| GET | `/api/v1/plm/critical-path/:id/gantt` | Signed-in |
| POST | `/api/v1/plm/critical-path/:id/tasks` | `plm:create` |
| DELETE | `/api/v1/plm/critical-path/:id/tasks/:taskId` | `plm:delete` |
| PUT | `/api/v1/plm/critical-path/:id/tasks/:taskId` | `plm:update` |
| PATCH | `/api/v1/plm/critical-path/:id/tasks/:taskId/status` | `plm:update` |
| GET | `/api/v1/plm/critical-path/:styleCardId` | Signed-in |
| POST | `/api/v1/plm/critical-path/:styleCardId` | `plm:create` |
| GET | `/api/v1/plm/documents` | Signed-in |
| POST | `/api/v1/plm/documents` | `plm:create` |
| DELETE | `/api/v1/plm/documents/:id` | `plm:delete` |
| GET | `/api/v1/plm/documents/:id` | Signed-in |
| POST | `/api/v1/plm/documents/:id/new-version` | `plm:create` |
| GET | `/api/v1/plm/documents/:id/versions` | Signed-in |
| POST | `/api/v1/plm/documents/upload` | `plm:create` |
| GET | `/api/v1/plm/orders` | Signed-in |
| POST | `/api/v1/plm/orders` | `plm:create` |
| DELETE | `/api/v1/plm/orders/:id` | `plm:delete` |
| GET | `/api/v1/plm/orders/:id` | Signed-in |
| PUT | `/api/v1/plm/orders/:id` | `plm:update` |
| PATCH | `/api/v1/plm/orders/:id/status` | `plm:update` |
| GET | `/api/v1/plm/orders/:id/tasks` | Signed-in |
| POST | `/api/v1/plm/orders/:id/tasks` | `plm:create` |
| GET | `/api/v1/plm/reports/analyse-cubes` | Signed-in |
| GET | `/api/v1/plm/reports/cancelled-tasks` | Signed-in |
| GET | `/api/v1/plm/reports/daily-tasks` | Signed-in |
| GET | `/api/v1/plm/reports/delayed-tasks` | Signed-in |
| GET | `/api/v1/plm/reports/sample-cost` | Signed-in |
| GET | `/api/v1/plm/reports/sample-history` | Signed-in |
| GET | `/api/v1/plm/tasks` | Signed-in |
| POST | `/api/v1/plm/tasks` | `plm:create` |
| DELETE | `/api/v1/plm/tasks/:id` | `plm:delete` |
| GET | `/api/v1/plm/tasks/:id` | Signed-in |
| PUT | `/api/v1/plm/tasks/:id` | `plm:update` |
| PATCH | `/api/v1/plm/tasks/:id/status` | `plm:update` |
| GET | `/api/v1/plm/tasks/my-tasks` | Signed-in |
| GET | `/api/v1/plm/tasks/overdue` | Signed-in |

## projects/projects

Source: `nexuscore-backend/src/modules/projects/projects.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/projects` | Signed-in |
| POST | `/api/v1/projects` | `collaboration:create` |
| DELETE | `/api/v1/projects/:id` | `collaboration:delete` |
| GET | `/api/v1/projects/:id` | Signed-in |
| PATCH | `/api/v1/projects/:id` | `collaboration:update` |
| POST | `/api/v1/projects/:id/members` | `collaboration:create` |
| DELETE | `/api/v1/projects/:id/members/:userId` | `collaboration:delete` |
| PATCH | `/api/v1/projects/:id/members/:userId` | `collaboration:update` |

## reports/report-builder

Source: `nexuscore-backend/src/modules/reports/report-builder.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/report-builder/docket/catalog` | Signed-in |
| POST | `/api/v1/report-builder/docket/preview` | `docket-reports:view` |
| GET | `/api/v1/report-builder/docket/reports` | `docket-reports:view` |
| POST | `/api/v1/report-builder/docket/reports` | `docket-reports:create` |
| DELETE | `/api/v1/report-builder/docket/reports/:id` | `docket-reports:delete` |
| GET | `/api/v1/report-builder/docket/reports/:id` | `docket-reports:view` |
| PATCH | `/api/v1/report-builder/docket/reports/:id` | `docket-reports:update` |
| POST | `/api/v1/report-builder/docket/reports/:id/export` | `docket-reports:export` |
| POST | `/api/v1/report-builder/docket/reports/:id/run` | `docket-reports:view` |
| POST | `/api/v1/report-builder/docket/source-fields` | `docket-reports:view` |
| POST | `/api/v1/report-builder/docket/validate` | `docket-reports:view` |
| GET | `/api/v1/report-builder/legacy-erp/catalog` | Signed-in |
| POST | `/api/v1/report-builder/legacy-erp/preview` | `legacy-erp-reports:view` |
| GET | `/api/v1/report-builder/legacy-erp/reports` | `legacy-erp-reports:view` |
| POST | `/api/v1/report-builder/legacy-erp/reports` | `legacy-erp-reports:create` |
| DELETE | `/api/v1/report-builder/legacy-erp/reports/:id` | `legacy-erp-reports:delete` |
| GET | `/api/v1/report-builder/legacy-erp/reports/:id` | `legacy-erp-reports:view` |
| PATCH | `/api/v1/report-builder/legacy-erp/reports/:id` | `legacy-erp-reports:update` |
| POST | `/api/v1/report-builder/legacy-erp/reports/:id/export` | `legacy-erp-reports:export` |
| POST | `/api/v1/report-builder/legacy-erp/reports/:id/run` | `legacy-erp-reports:view` |
| POST | `/api/v1/report-builder/legacy-erp/source-fields` | `legacy-erp-reports:view` |
| POST | `/api/v1/report-builder/legacy-erp/validate` | `legacy-erp-reports:view` |
| GET | `/api/v1/report-builder/plm/catalog` | Signed-in |
| POST | `/api/v1/report-builder/plm/preview` | `plm-reports:view` |
| GET | `/api/v1/report-builder/plm/reports` | `plm-reports:view` |
| POST | `/api/v1/report-builder/plm/reports` | `plm-reports:create` |
| DELETE | `/api/v1/report-builder/plm/reports/:id` | `plm-reports:delete` |
| GET | `/api/v1/report-builder/plm/reports/:id` | `plm-reports:view` |
| PATCH | `/api/v1/report-builder/plm/reports/:id` | `plm-reports:update` |
| POST | `/api/v1/report-builder/plm/reports/:id/export` | `plm-reports:export` |
| POST | `/api/v1/report-builder/plm/reports/:id/run` | `plm-reports:view` |
| POST | `/api/v1/report-builder/plm/source-fields` | `plm-reports:view` |
| POST | `/api/v1/report-builder/plm/validate` | `plm-reports:view` |

## reports/reports

Source: `nexuscore-backend/src/modules/reports/reports.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/reports/cutting/consumption` | Signed-in |
| GET | `/api/v1/reports/cutting/defects` | Signed-in |
| GET | `/api/v1/reports/cutting/productivity` | Signed-in |
| GET | `/api/v1/reports/cutting/shifts` | Signed-in |
| GET | `/api/v1/reports/cutting/wastage` | Signed-in |
| GET | `/api/v1/reports/sustainability` | Signed-in |

## roles/roles

Source: `nexuscore-backend/src/modules/roles/roles.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/permission-settings` | Signed-in |
| GET | `/api/v1/permission-settings/check` | Signed-in |
| POST | `/api/v1/permission-settings/check-batch` | Signed-in |
| GET | `/api/v1/permission-settings/hierarchical` | Signed-in |
| POST | `/api/v1/permission-settings/hierarchical/upsert` | `system:unclassified-write` |
| GET | `/api/v1/permission-settings/matrix` | Signed-in |
| POST | `/api/v1/permission-settings/upsert` | `system:unclassified-write` |
| GET | `/api/v1/permissions` | Signed-in |
| GET | `/api/v1/roles` | Signed-in |
| POST | `/api/v1/roles` | `system:unclassified-write` |
| DELETE | `/api/v1/roles/:id` | `system:unclassified-write` |
| GET | `/api/v1/roles/:id` | Signed-in |
| PUT | `/api/v1/roles/:id` | `system:unclassified-write` |
| GET | `/api/v1/roles/:id/permissions` | Signed-in |
| PUT | `/api/v1/roles/:id/permissions` | `system:unclassified-write` |

## style-extras/style-extras

Source: `nexuscore-backend/src/modules/style-extras/style-extras.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/plm/sample-cards/:id/bom-lines` | Signed-in |
| PUT | `/api/v1/plm/sample-cards/:id/bom-lines` | `plm:update` |
| GET | `/api/v1/plm/sample-cards/:id/wash-care` | Signed-in |
| PUT | `/api/v1/plm/sample-cards/:id/wash-care` | `plm:update` |
| GET | `/api/v1/plm/style-cards/:id/bom-lines` | Signed-in |
| PUT | `/api/v1/plm/style-cards/:id/bom-lines` | `plm:update` |
| GET | `/api/v1/plm/style-cards/:id/expense-lines` | Signed-in |
| PUT | `/api/v1/plm/style-cards/:id/expense-lines` | `plm:update` |
| GET | `/api/v1/plm/style-cards/:id/wash-care` | Signed-in |
| PUT | `/api/v1/plm/style-cards/:id/wash-care` | `plm:update` |

## tables/tables

Source: `nexuscore-backend/src/modules/tables/tables.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/tables` | Signed-in |
| POST | `/api/v1/tables` | `collaboration:create` |
| DELETE | `/api/v1/tables/:id` | `collaboration:delete` |
| GET | `/api/v1/tables/:id` | Signed-in |
| PATCH | `/api/v1/tables/:id` | `collaboration:update` |
| GET | `/api/v1/tables/categories` | Signed-in |
| POST | `/api/v1/tables/categories` | `collaboration:create` |
| DELETE | `/api/v1/tables/categories/:id` | `collaboration:delete` |
| PATCH | `/api/v1/tables/categories/:id` | `collaboration:update` |

## upload/upload

Source: `nexuscore-backend/src/modules/upload/upload.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/upload/:id` | Public |
| POST | `/api/v1/upload/single` | Signed-in |

## user-settings/user-settings

Source: `nexuscore-backend/src/modules/user-settings/user-settings.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/settings` | Signed-in |
| PATCH | `/api/v1/settings` | Signed-in |
| GET | `/api/v1/settings/:userId` | `users:read` |
| GET | `/api/v1/settings/notifications` | Signed-in |
| POST | `/api/v1/settings/password-reset/consume` | Public |
| POST | `/api/v1/settings/password-reset/request` | Public |
| PATCH | `/api/v1/settings/profile` | Signed-in |

## users/users

Source: `nexuscore-backend/src/modules/users/users.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/users` | Signed-in |
| POST | `/api/v1/users` | `users:create` |
| DELETE | `/api/v1/users/:id` | `users:delete` |
| GET | `/api/v1/users/:id` | Signed-in |
| PATCH | `/api/v1/users/:id` | `users:update` |
| POST | `/api/v1/users/:id/assign-role` | `roles:manage` |
| GET | `/api/v1/users/:id/permissions` | Signed-in |
| GET | `/api/v1/users/:id/profile` | Signed-in |
| DELETE | `/api/v1/users/:id/roles/:roleId` | `roles:manage` |
| GET | `/api/v1/users/by-branch/:branchId` | Signed-in |
| POST | `/api/v1/users/set-password/:id` | `users:update` |

## whatsapp/whatsapp

Source: `nexuscore-backend/src/modules/whatsapp/whatsapp.controller.ts`

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/whatsapp/callback` | Public |
| POST | `/api/v1/whatsapp/company-config` | `whatsapp:create` |
| POST | `/api/v1/whatsapp/send` | `whatsapp:create` |

## stubs/stubs

Source: `nexuscore-backend/src/modules/stubs/stubs.controller.ts`

> **Placeholder module.** Every handler in this file returns an empty list, `null` or nothing, and does not read or write the database. Screens that call these routes show no data and their saves have no effect.

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/access-controls` | Signed-in |
| POST | `/api/v1/access-controls` | `settings:create` |
| DELETE | `/api/v1/access-controls/:id` | `settings:delete` |
| GET | `/api/v1/access-controls/:id` | Signed-in |
| PUT | `/api/v1/access-controls/:id` | `settings:update` |
| POST | `/api/v1/access-controls/check-drag-drop` | Signed-in |
| POST | `/api/v1/access-controls/reorder` | `settings:create` |
| GET | `/api/v1/analytical-reports` | Signed-in |
| POST | `/api/v1/analytical-reports` | `settings:create` |
| DELETE | `/api/v1/analytical-reports/:id` | `settings:delete` |
| GET | `/api/v1/analytical-reports/:id` | Signed-in |
| PUT | `/api/v1/analytical-reports/:id` | `settings:update` |
| POST | `/api/v1/analytical-reports/reorder` | `settings:create` |
| GET | `/api/v1/auto-numbering` | Signed-in |
| POST | `/api/v1/auto-numbering` | `settings:create` |
| DELETE | `/api/v1/auto-numbering/:id` | `settings:delete` |
| GET | `/api/v1/auto-numbering/:id` | Signed-in |
| PUT | `/api/v1/auto-numbering/:id` | `settings:update` |
| GET | `/api/v1/auto-numbering/next/:entity` | Signed-in |
| GET | `/api/v1/business-processes` | Signed-in |
| POST | `/api/v1/business-processes` | `settings:create` |
| DELETE | `/api/v1/business-processes/:id` | `settings:delete` |
| GET | `/api/v1/business-processes/:id` | Signed-in |
| PUT | `/api/v1/business-processes/:id` | `settings:update` |
| PUT | `/api/v1/business-processes/:id/toggle` | `settings:update` |
| GET | `/api/v1/call-statuses` | Signed-in |
| POST | `/api/v1/call-statuses` | `crm-settings:create` |
| DELETE | `/api/v1/call-statuses/:id` | `crm-settings:delete` |
| GET | `/api/v1/call-statuses/:id` | Signed-in |
| PUT | `/api/v1/call-statuses/:id` | `crm-settings:update` |
| POST | `/api/v1/call-statuses/reorder` | `crm-settings:create` |
| GET | `/api/v1/company-types` | Signed-in |
| POST | `/api/v1/company-types` | `crm-settings:create` |
| DELETE | `/api/v1/company-types/:id` | `crm-settings:delete` |
| GET | `/api/v1/company-types/:id` | Signed-in |
| PUT | `/api/v1/company-types/:id` | `crm-settings:update` |
| POST | `/api/v1/company-types/reorder` | `crm-settings:create` |
| GET | `/api/v1/contact-types` | Signed-in |
| POST | `/api/v1/contact-types` | `crm-settings:create` |
| DELETE | `/api/v1/contact-types/:id` | `crm-settings:delete` |
| GET | `/api/v1/contact-types/:id` | Signed-in |
| PUT | `/api/v1/contact-types/:id` | `crm-settings:update` |
| POST | `/api/v1/contact-types/reorder` | `crm-settings:create` |
| GET | `/api/v1/currencies` | Signed-in |
| POST | `/api/v1/currencies` | `crm-settings:create` |
| DELETE | `/api/v1/currencies/:id` | `crm-settings:delete` |
| GET | `/api/v1/currencies/:id` | Signed-in |
| PUT | `/api/v1/currencies/:id` | `crm-settings:update` |
| POST | `/api/v1/currencies/reorder` | `crm-settings:create` |
| GET | `/api/v1/custom-fields` | Signed-in |
| POST | `/api/v1/custom-fields` | `settings:create` |
| DELETE | `/api/v1/custom-fields/:id` | `settings:delete` |
| GET | `/api/v1/custom-fields/:id` | Signed-in |
| PUT | `/api/v1/custom-fields/:id` | `settings:update` |
| POST | `/api/v1/custom-fields/reorder` | `settings:create` |
| GET | `/api/v1/deal-pipelines` | Signed-in |
| POST | `/api/v1/deal-pipelines` | `crm:create` |
| DELETE | `/api/v1/deal-pipelines/:id` | `crm:delete` |
| GET | `/api/v1/deal-pipelines/:id` | Signed-in |
| PUT | `/api/v1/deal-pipelines/:id` | `crm:update` |
| GET | `/api/v1/deal-pipelines/:id/connections` | Signed-in |
| POST | `/api/v1/deal-pipelines/:id/connections` | `crm:create` |
| DELETE | `/api/v1/deal-pipelines/:id/connections/:cid` | `crm:delete` |
| GET | `/api/v1/deal-pipelines/:id/stages` | Signed-in |
| POST | `/api/v1/deal-pipelines/:id/stages` | `crm:create` |
| DELETE | `/api/v1/deal-pipelines/:id/stages/:sid` | `crm:delete` |
| PUT | `/api/v1/deal-pipelines/:id/stages/:sid` | `crm:update` |
| POST | `/api/v1/deal-pipelines/:id/stages/reorder` | `crm:create` |
| POST | `/api/v1/deal-pipelines/reorder` | `crm:create` |
| GET | `/api/v1/deal-types` | Signed-in |
| POST | `/api/v1/deal-types` | `crm-settings:create` |
| DELETE | `/api/v1/deal-types/:id` | `crm-settings:delete` |
| GET | `/api/v1/deal-types/:id` | Signed-in |
| PUT | `/api/v1/deal-types/:id` | `crm-settings:update` |
| POST | `/api/v1/deal-types/reorder` | `crm-settings:create` |
| GET | `/api/v1/document-stages` | Signed-in |
| POST | `/api/v1/document-stages` | `crm-settings:create` |
| DELETE | `/api/v1/document-stages/:id` | `crm-settings:delete` |
| GET | `/api/v1/document-stages/:id` | Signed-in |
| PUT | `/api/v1/document-stages/:id` | `crm-settings:update` |
| POST | `/api/v1/document-stages/reorder` | `crm-settings:create` |
| GET | `/api/v1/drive-usage` | Signed-in |
| GET | `/api/v1/email-notifications` | Signed-in |
| POST | `/api/v1/email-notifications` | `settings:create` |
| DELETE | `/api/v1/email-notifications/:id` | `settings:delete` |
| GET | `/api/v1/email-notifications/:id` | Signed-in |
| PUT | `/api/v1/email-notifications/:id` | `settings:update` |
| POST | `/api/v1/email-notifications/:id/duplicate` | `settings:create` |
| PATCH | `/api/v1/email-notifications/:id/toggle` | `settings:update` |
| POST | `/api/v1/email-notifications/reorder` | `settings:create` |
| GET | `/api/v1/email-signatures` | Signed-in |
| POST | `/api/v1/email-signatures` | `settings:create` |
| DELETE | `/api/v1/email-signatures/:id` | `settings:delete` |
| GET | `/api/v1/email-signatures/:id` | Signed-in |
| PUT | `/api/v1/email-signatures/:id` | `settings:update` |
| POST | `/api/v1/email-signatures/:id/duplicate` | `settings:create` |
| PATCH | `/api/v1/email-signatures/:id/toggle` | `settings:update` |
| POST | `/api/v1/email-signatures/reorder` | `settings:create` |
| GET | `/api/v1/email-templates` | Signed-in |
| POST | `/api/v1/email-templates` | `settings:create` |
| DELETE | `/api/v1/email-templates/:id` | `settings:delete` |
| GET | `/api/v1/email-templates/:id` | Signed-in |
| PUT | `/api/v1/email-templates/:id` | `settings:update` |
| POST | `/api/v1/email-templates/:id/duplicate` | `settings:create` |
| PATCH | `/api/v1/email-templates/:id/toggle` | `settings:update` |
| GET | `/api/v1/employees` | Signed-in |
| POST | `/api/v1/employees` | `crm-settings:create` |
| DELETE | `/api/v1/employees/:id` | `crm-settings:delete` |
| GET | `/api/v1/employees/:id` | Signed-in |
| PUT | `/api/v1/employees/:id` | `crm-settings:update` |
| POST | `/api/v1/employees/reorder` | `crm-settings:create` |
| GET | `/api/v1/estimate-stages` | Signed-in |
| POST | `/api/v1/estimate-stages` | `crm-settings:create` |
| DELETE | `/api/v1/estimate-stages/:id` | `crm-settings:delete` |
| GET | `/api/v1/estimate-stages/:id` | Signed-in |
| PUT | `/api/v1/estimate-stages/:id` | `crm-settings:update` |
| POST | `/api/v1/estimate-stages/reorder` | `crm-settings:create` |
| GET | `/api/v1/exception-logs` | `logs:read` |
| POST | `/api/v1/exception-logs` | Signed-in |
| DELETE | `/api/v1/exception-logs/:id` | `logs:delete` |
| PUT | `/api/v1/exception-logs/:id` | `logs:update` |
| GET | `/api/v1/form-fields` | Signed-in |
| POST | `/api/v1/form-fields` | `settings:create` |
| DELETE | `/api/v1/form-fields/:id` | `settings:delete` |
| GET | `/api/v1/form-fields/:id` | Signed-in |
| PUT | `/api/v1/form-fields/:id` | `settings:update` |
| POST | `/api/v1/form-fields/reorder` | `settings:create` |
| GET | `/api/v1/form-permissions/fields/:id` | Signed-in |
| PUT | `/api/v1/form-permissions/fields/:id` | `settings:update` |
| POST | `/api/v1/form-permissions/fields/:id/bulk` | `settings:create` |
| GET | `/api/v1/form-permissions/sections/:id` | Signed-in |
| PUT | `/api/v1/form-permissions/sections/:id` | `settings:update` |
| POST | `/api/v1/form-permissions/sections/:id/bulk` | `settings:create` |
| GET | `/api/v1/form-sections` | Signed-in |
| POST | `/api/v1/form-sections` | `settings:create` |
| DELETE | `/api/v1/form-sections/:id` | `settings:delete` |
| GET | `/api/v1/form-sections/:id` | Signed-in |
| PUT | `/api/v1/form-sections/:id` | `settings:update` |
| GET | `/api/v1/form-templates` | Signed-in |
| POST | `/api/v1/form-templates` | `settings:create` |
| DELETE | `/api/v1/form-templates/:id` | `settings:delete` |
| GET | `/api/v1/form-templates/:id` | Signed-in |
| PUT | `/api/v1/form-templates/:id` | `settings:update` |
| POST | `/api/v1/form-templates/:id/duplicate` | `settings:create` |
| PATCH | `/api/v1/form-templates/:id/toggle` | `settings:update` |
| GET | `/api/v1/form-templates/models` | Signed-in |
| GET | `/api/v1/form-templates/models/:model/data` | Signed-in |
| GET | `/api/v1/form-templates/path/:path` | Signed-in |
| GET | `/api/v1/industries` | Signed-in |
| POST | `/api/v1/industries` | `crm-settings:create` |
| DELETE | `/api/v1/industries/:id` | `crm-settings:delete` |
| GET | `/api/v1/industries/:id` | Signed-in |
| PUT | `/api/v1/industries/:id` | `crm-settings:update` |
| POST | `/api/v1/industries/reorder` | `crm-settings:create` |
| GET | `/api/v1/invoice-stages` | Signed-in |
| POST | `/api/v1/invoice-stages` | `crm-settings:create` |
| DELETE | `/api/v1/invoice-stages/:id` | `crm-settings:delete` |
| GET | `/api/v1/invoice-stages/:id` | Signed-in |
| PUT | `/api/v1/invoice-stages/:id` | `crm-settings:update` |
| POST | `/api/v1/invoice-stages/reorder` | `crm-settings:create` |
| GET | `/api/v1/lead-stages` | Signed-in |
| POST | `/api/v1/lead-stages` | `crm-settings:create` |
| DELETE | `/api/v1/lead-stages/:id` | `crm-settings:delete` |
| GET | `/api/v1/lead-stages/:id` | Signed-in |
| PUT | `/api/v1/lead-stages/:id` | `crm-settings:update` |
| POST | `/api/v1/lead-stages/reorder` | `crm-settings:create` |
| GET | `/api/v1/locations` | Signed-in |
| POST | `/api/v1/locations` | `crm-settings:create` |
| DELETE | `/api/v1/locations/:id` | `crm-settings:delete` |
| GET | `/api/v1/locations/:id` | Signed-in |
| PUT | `/api/v1/locations/:id` | `crm-settings:update` |
| POST | `/api/v1/locations/reorder` | `crm-settings:create` |
| GET | `/api/v1/login-history` | Signed-in |
| GET | `/api/v1/mail` | Signed-in |
| DELETE | `/api/v1/mail/:id` | `communication:delete` |
| GET | `/api/v1/mail/:id` | Signed-in |
| PUT | `/api/v1/mail/:id` | `communication:update` |
| GET | `/api/v1/mail/accounts` | Signed-in |
| POST | `/api/v1/mail/bulk-update` | `communication:create` |
| GET | `/api/v1/mail/counts` | Signed-in |
| POST | `/api/v1/mail/draft` | `communication:create` |
| POST | `/api/v1/mail/fetch` | `communication:create` |
| POST | `/api/v1/mail/send` | `communication:create` |
| POST | `/api/v1/mail/test-imap` | `communication:create` |
| GET | `/api/v1/note-labels` | Signed-in |
| POST | `/api/v1/note-labels` | `collaboration:create` |
| DELETE | `/api/v1/note-labels/:id` | `collaboration:delete` |
| PUT | `/api/v1/note-labels/:id` | `collaboration:update` |
| GET | `/api/v1/notes` | Signed-in |
| POST | `/api/v1/notes` | `collaboration:create` |
| DELETE | `/api/v1/notes/:id` | `collaboration:delete` |
| GET | `/api/v1/notes/:id` | Signed-in |
| PUT | `/api/v1/notes/:id` | `collaboration:update` |
| GET | `/api/v1/pricing-plans` | Signed-in |
| POST | `/api/v1/pricing-plans` | `settings:create` |
| DELETE | `/api/v1/pricing-plans/:id` | `settings:delete` |
| GET | `/api/v1/pricing-plans/:id` | Signed-in |
| PUT | `/api/v1/pricing-plans/:id` | `settings:update` |
| GET | `/api/v1/pricing-plans/industry/:industry` | Signed-in |
| GET | `/api/v1/product-properties` | Signed-in |
| POST | `/api/v1/product-properties` | `crm-settings:create` |
| DELETE | `/api/v1/product-properties/:id` | `crm-settings:delete` |
| GET | `/api/v1/product-properties/:id` | Signed-in |
| PUT | `/api/v1/product-properties/:id` | `crm-settings:update` |
| POST | `/api/v1/product-properties/reorder` | `crm-settings:create` |
| GET | `/api/v1/salutations` | Signed-in |
| POST | `/api/v1/salutations` | `crm-settings:create` |
| DELETE | `/api/v1/salutations/:id` | `crm-settings:delete` |
| GET | `/api/v1/salutations/:id` | Signed-in |
| PUT | `/api/v1/salutations/:id` | `crm-settings:update` |
| POST | `/api/v1/salutations/reorder` | `crm-settings:create` |
| GET | `/api/v1/securities` | Signed-in |
| POST | `/api/v1/securities` | `settings:create` |
| DELETE | `/api/v1/securities/:id` | `settings:delete` |
| GET | `/api/v1/securities/:id` | Signed-in |
| PUT | `/api/v1/securities/:id` | `settings:update` |
| POST | `/api/v1/securities/reorder` | `settings:create` |
| GET | `/api/v1/smtp-settings` | Signed-in |
| POST | `/api/v1/smtp-settings` | `settings:create` |
| DELETE | `/api/v1/smtp-settings/:id` | `settings:delete` |
| GET | `/api/v1/smtp-settings/:id` | Signed-in |
| PUT | `/api/v1/smtp-settings/:id` | `settings:update` |
| POST | `/api/v1/smtp-settings/:id/test` | `settings:create` |
| PATCH | `/api/v1/smtp-settings/:id/toggle` | `settings:update` |
| POST | `/api/v1/smtp-settings/reorder` | `settings:create` |
| GET | `/api/v1/sources` | Signed-in |
| POST | `/api/v1/sources` | `crm-settings:create` |
| DELETE | `/api/v1/sources/:id` | `crm-settings:delete` |
| GET | `/api/v1/sources/:id` | Signed-in |
| PUT | `/api/v1/sources/:id` | `crm-settings:update` |
| POST | `/api/v1/sources/reorder` | `crm-settings:create` |
| GET | `/api/v1/system-settings` | Signed-in |
| PUT | `/api/v1/system-settings` | `settings:update` |
| GET | `/api/v1/taxes` | Signed-in |
| POST | `/api/v1/taxes` | `crm-settings:create` |
| DELETE | `/api/v1/taxes/:id` | `crm-settings:delete` |
| GET | `/api/v1/taxes/:id` | Signed-in |
| PUT | `/api/v1/taxes/:id` | `crm-settings:update` |
| POST | `/api/v1/taxes/reorder` | `crm-settings:create` |
| GET | `/api/v1/todos` | Signed-in |
| POST | `/api/v1/todos` | `collaboration:create` |
| DELETE | `/api/v1/todos/:id` | `collaboration:delete` |
| GET | `/api/v1/todos/:id` | Signed-in |
| PUT | `/api/v1/todos/:id` | `collaboration:update` |
| POST | `/api/v1/todos/:id/comments` | `collaboration:create` |
| DELETE | `/api/v1/todos/:id/comments/:cid` | `collaboration:delete` |
| POST | `/api/v1/todos/:id/files` | `collaboration:create` |
| DELETE | `/api/v1/todos/:id/files/:fid` | `collaboration:delete` |
| POST | `/api/v1/todos/:id/subtasks` | `collaboration:create` |
| DELETE | `/api/v1/todos/:id/subtasks/:sid` | `collaboration:delete` |
| PUT | `/api/v1/todos/:id/subtasks/:sid` | `collaboration:update` |
| POST | `/api/v1/todos/reorder` | `collaboration:create` |
| GET | `/api/v1/units` | Signed-in |
| POST | `/api/v1/units` | `crm-settings:create` |
| DELETE | `/api/v1/units/:id` | `crm-settings:delete` |
| GET | `/api/v1/units/:id` | Signed-in |
| PUT | `/api/v1/units/:id` | `crm-settings:update` |
| POST | `/api/v1/units/reorder` | `crm-settings:create` |
| GET | `/api/v1/user-roles` | Signed-in |
| POST | `/api/v1/user-roles` | `settings:create` |
| DELETE | `/api/v1/user-roles/:id` | `settings:delete` |
| GET | `/api/v1/user-roles/:id` | Signed-in |
| PUT | `/api/v1/user-roles/:id` | `settings:update` |
| POST | `/api/v1/user-roles/reorder` | `settings:create` |

