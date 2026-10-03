-- User Defined Fields administration (Administration > User Defined Fields).
-- Additive only: new columns on the existing CustomField table, one unique index, one index and
-- one navigation entry. No DROP, no TRUNCATE, no DELETE; CustomFieldValue is untouched.

ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "controlType" TEXT;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "defaultValue" JSONB;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "config" JSONB;

-- A database that already holds CustomField rows (none were ever saved through the UI, which
-- wrote to a no-op stub) gets a stable, unique code for each before the column becomes required.
UPDATE "CustomField" SET "code" = 'UD_' || replace("id", '-', '') WHERE "code" IS NULL;
ALTER TABLE "CustomField" ALTER COLUMN "code" SET NOT NULL;

-- Field codes are unique per entity within one exact scope: global (companyId and branchId both
-- NULL), company (branchId NULL) or branch. NULLS NOT DISTINCT (PostgreSQL 15+) makes two global
-- or two company-level rows with the same code collide, which a plain unique index would allow.
-- Same name/columns as the schema's @@unique([entity, code, companyId, branchId]).
CREATE UNIQUE INDEX IF NOT EXISTS "CustomField_entity_code_companyId_branchId_key"
  ON "CustomField"("entity", "code", "companyId", "branchId") NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "CustomField_entity_sortOrder_idx" ON "CustomField"("entity", "sortOrder");

-- Navigation entry under the existing "Administration" sidebar group — same global (companyId/
-- branchId NULL) shape as the Log Tracking entry (20260922000000_audit_log_lifecycle_fields).
INSERT INTO "MenuItem" ("id", "title", "href", "icon", "group", "parentId", "order", "isActive", "isComing", "isNew", "newTab", "companyId", "branchId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'User Defined Fields', '/dashboard/administration/user-defined-fields', 'ListPlus', 'Administration', NULL, 0, true, false, false, false, NULL, NULL, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "MenuItem" WHERE "href" = '/dashboard/administration/user-defined-fields');
