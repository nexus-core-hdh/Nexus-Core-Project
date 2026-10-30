// Installs ONLY the standard "Order Manufacturing Entry" report (standard-legacy-reports.ts) for every
// company that does not have it yet — unlike seed-legacy-standard-reports.ts, which also re-adds any
// other standard report a company has deleted. Goes through ReportBuilderService.create, so the
// report is validated exactly like one saved from the designer and gets its menu entry under
// Legacy ERP › Production Reports. Matching is by name: a company that already has it is skipped.
//
// Dry run by default (read-only). Run:
//   npx ts-node scripts/install-order-manufacturing-entry-report.ts            (dry run)
//   npx ts-node scripts/install-order-manufacturing-entry-report.ts --apply
import { PrismaClient } from '@prisma/client';
import { ReportBuilderService } from '../src/modules/reports/report-builder.service';
import { standardLegacyReportInputs } from '../src/modules/reports/standard-legacy-reports';
import { OM_ENTRY_REPORT_NAME } from '../src/modules/reports/order-manufacturing-entry.report';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const input = standardLegacyReportInputs().find((r) => r.name === OM_ENTRY_REPORT_NAME);
  if (!input) throw new Error(`Standard report "${OM_ENTRY_REPORT_NAME}" not found`);
  // No audit entries for installed standard reports — same as the standard-report seed.
  const reports = new ReportBuilderService(prisma as any, { recordSafe: async () => undefined } as any);
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`${apply ? 'APPLY' : 'dry run (read-only)'} — "${OM_ENTRY_REPORT_NAME}" for ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}`);
  for (const company of companies) {
    const existing = await prisma.reportDefinition.findFirst({
      where: { companyId: company.id, module: 'legacy-erp', name: { equals: OM_ENTRY_REPORT_NAME, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) { console.log(`  - ${company.name}: already has it (${existing.id})`); continue; }
    if (!apply) { console.log(`  + ${company.name}: would create it (Legacy ERP › Production Reports)`); continue; }
    const admin = await prisma.user.findFirst({
      where: { companyId: company.id, userRoles: { some: { role: { name: 'Admin' } } } },
      select: { id: true },
    });
    const created: any = await reports.create('legacy-erp', input, { id: admin?.id ?? (undefined as unknown as string), companyId: company.id });
    console.log(`  + ${company.name}: created ${created.id}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
