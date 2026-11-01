-- NexusCore company → legacy ERP company: an explicit, optional link (company isolation, phase 1).
-- The legacy ERP stores every record under MD_Company.RecId ("CompanyId" on 170 legacy tables);
-- this column says which legacy company a NexusCore company's users work in. Resolved server-side
-- from the authenticated user's company only (legacy-company-context.service.ts) — never from
-- client input, and not writable through any company API (UpdateCompanyDto does not include it).
--
-- Additive and nullable; no existing row changes. One legacy company per NexusCore company
-- (unique). The foreign key is added only where the legacy schema exists (same guard as every
-- other link to a legacy table), and is VALID: the column is new and empty, so validation scans
-- nothing. MD_Company rows can't be deleted while a company points at them.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "legacyCompanyId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Company_legacyCompanyId_key" ON "Company"("legacyCompanyId");

DO $company_legacy_company_fk$
BEGIN
  IF to_regclass('"MD_Company"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Company_legacyCompanyId_fkey') THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_legacyCompanyId_fkey"
      FOREIGN KEY ("legacyCompanyId") REFERENCES "MD_Company"("RecId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$company_legacy_company_fk$;
