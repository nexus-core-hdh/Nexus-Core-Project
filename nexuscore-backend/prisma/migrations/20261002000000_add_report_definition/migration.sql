-- User-defined reports (Report Builder). Each definition references a whitelisted data source
-- by key (src/modules/reports/report-sources.ts) and owns one menu item (menuItemId).
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataSource" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '[]',
    "sorting" JSONB NOT NULL DEFAULT '[]',
    "menuItemId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportDefinition_companyId_module_idx" ON "ReportDefinition"("companyId", "module");
