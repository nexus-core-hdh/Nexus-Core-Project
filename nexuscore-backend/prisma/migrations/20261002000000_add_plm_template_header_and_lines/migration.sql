-- PLM Template screen redesign (TAO-style Merchandising reference screenshot): the generic
-- PlmTemplate registry (name/type/description/structure JSON) had none of the header fields the
-- reference screen needs, and no detail/line table at all. Hand-written (not `prisma migrate diff`,
-- which would also try to drop ~500 unrelated legacy raw-SQL tables this schema never modeled) —
-- additive only, IF NOT EXISTS guards throughout so this is safe to re-run.

-- "No" on the screenshot — fills the one real gap against every other *Card master's code+name
-- convention already used in this schema (FabricCard, ActivityTypeCard, BrandCard, ...).
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "styleCardId" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "styleGroup" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "styleDepartmentId" TEXT;
ALTER TABLE "PlmTemplate" ADD COLUMN IF NOT EXISTS "styleSpecialCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PlmTemplate_code_key" ON "PlmTemplate"("code");

DO $$ BEGIN
  ALTER TABLE "PlmTemplate" ADD CONSTRAINT "PlmTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "DepartmentCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlmTemplate" ADD CONSTRAINT "PlmTemplate_styleDepartmentId_fkey" FOREIGN KEY ("styleDepartmentId") REFERENCES "DepartmentCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlmTemplate" ADD CONSTRAINT "PlmTemplate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlmTemplate" ADD CONSTRAINT "PlmTemplate_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Detail grid rows — grouped visually by Sample Type on the frontend (consecutive rows sharing
-- the same sampleTypeId), no separate grouping entity invented. One line = one picked
-- ActivityTypeCard (carries its own Process + default Duration/Resource) plus this template's own
-- overrides. resourceEmployeeId -> EmployeeCard (not ActivityTypeCard's own equipment-type
-- ResourceCard) because the reference screenshot's Resource/Resource Explanation columns show
-- actual staff numbers and names.
CREATE TABLE IF NOT EXISTS "PlmTemplateLine" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "previousOrderNo" TEXT,
    "sampleTypeId" TEXT,
    "activityTypeId" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "selectSampleType" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER,
    "resourceEmployeeId" TEXT,
    "quantity" DECIMAL(10,2),
    "explanation" TEXT,
    "specialCode" TEXT,
    "inUse" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlmTemplateLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlmTemplateLine_templateId_idx" ON "PlmTemplateLine"("templateId");
CREATE INDEX IF NOT EXISTS "PlmTemplateLine_sampleTypeId_idx" ON "PlmTemplateLine"("sampleTypeId");
CREATE INDEX IF NOT EXISTS "PlmTemplateLine_activityTypeId_idx" ON "PlmTemplateLine"("activityTypeId");
CREATE INDEX IF NOT EXISTS "PlmTemplateLine_resourceEmployeeId_idx" ON "PlmTemplateLine"("resourceEmployeeId");

DO $$ BEGIN
  ALTER TABLE "PlmTemplateLine" ADD CONSTRAINT "PlmTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlmTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlmTemplateLine" ADD CONSTRAINT "PlmTemplateLine_sampleTypeId_fkey" FOREIGN KEY ("sampleTypeId") REFERENCES "StyleSampleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlmTemplateLine" ADD CONSTRAINT "PlmTemplateLine_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityTypeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlmTemplateLine" ADD CONSTRAINT "PlmTemplateLine_resourceEmployeeId_fkey" FOREIGN KEY ("resourceEmployeeId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
