// Seeds the standard PLM reports (src/modules/reports/standard-reports.ts) for every company.
//
// Reports belong to a company and are listed in the PLM menu for all of its branches; when a
// report runs it shows the data of the user's own branch, so one set per company serves every
// branch. Goes through ReportBuilderService itself, so each report is validated exactly like one
// saved from the designer and gets its menu entry under PLM › "<Source> Reports".
//
// Safe to re-run: reports a company already has (matched by name) are skipped, so edits made to a
// standard report are kept. Companies added later get the set the next time setup runs.
//
// Run manually: npx ts-node scripts/seed-plm-standard-reports.ts
import { PrismaClient } from '@prisma/client';
import { ReportBuilderService } from '../src/modules/reports/report-builder.service';

const prisma = new PrismaClient();

async function main() {
  // No audit entries for seeded reports — the AuditService is only needed for user actions.
  const reports = new ReportBuilderService(prisma as any, { recordSafe: async () => undefined } as any);
  const companies = await prisma.company.findMany({ select: { id: true, name: true, _count: { select: { branches: true } } } });
  for (const company of companies) {
    const admin = await prisma.user.findFirst({
      where: { companyId: company.id, userRoles: { some: { role: { name: 'Admin' } } } },
      select: { id: true },
    });
    const { created, skipped } = await reports.ensureStandardReports('plm', company.id, admin?.id ?? null);
    console.log(`${created ? '+' : '-'} ${company.name}: ${created} standard reports created, ${skipped} already present (${company._count.branches} branch(es))`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
