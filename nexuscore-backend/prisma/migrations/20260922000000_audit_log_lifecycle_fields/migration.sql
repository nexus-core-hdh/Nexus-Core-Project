-- Extend the existing AuditLog table (already written to by ApprovalService/plm-cards.service.ts/
-- cutting.service.ts) with the fields the centralized, project-wide Audit framework needs.
-- Every new column is nullable -- existing rows and existing readers/writers are unaffected.
ALTER TABLE "AuditLog" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "screenKey" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "moduleName" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "menuTitle" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "documentNo" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "parentEntityType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "parentEntityId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "parentDocumentNo" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "correlationId" TEXT;

CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_screenKey_idx" ON "AuditLog"("screenKey");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");
CREATE INDEX "AuditLog_documentNo_idx" ON "AuditLog"("documentNo");
CREATE INDEX "AuditLog_changedBy_idx" ON "AuditLog"("changedBy");

-- Real navigation entry for the new Log Tracking screen, under the existing "Administration"
-- sidebar group (see frontend/components/layout/sidebar/nav-main.tsx's own
-- mergeAdministrationExtras -- it already merges into a real DB-driven "Administration" MenuItem
-- group if one exists, rather than appending a duplicate). companyId/branchId NULL matches every
-- other seeded MenuItem row (menu-items.service.ts's own getMenuItems query always includes
-- {companyId: null, branchId: null} rows for every company) -- global, not a per-tenant row.
INSERT INTO "MenuItem" ("id", "title", "href", "icon", "group", "parentId", "order", "isActive", "isComing", "isNew", "newTab", "companyId", "branchId", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Log Tracking', '/dashboard/administration/log-tracking', 'ScrollText', 'Administration', NULL, 0, true, false, false, false, NULL, NULL, now(), now());
