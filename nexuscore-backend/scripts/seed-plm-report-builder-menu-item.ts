// Idempotent nav seed for the PLM Report Builder's "Manage Reports" screen
// (frontend/app/[company]/(auth)/plm/reports/page.tsx, src/modules/reports/report-builder.*).
//
// Placed first under the existing PLM › Reports expander, next to the fixed PLM reports. Each
// user-defined report adds its own entry to the same expander when it is created (see
// ReportBuilderService.createMenuItem), so this script only ensures the expander and the
// management screen exist. Safe to re-run: skips anything that already exists.
//
// Run manually: npx ts-node scripts/seed-plm-report-builder-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/plm/reports';
  let parent = await prisma.menuItem.findFirst({ where: { group: 'PLM', parentId: null, title: 'Reports' } });
  if (!parent) {
    const last = await prisma.menuItem.aggregate({ where: { group: 'PLM', parentId: null }, _max: { order: true } });
    parent = await prisma.menuItem.create({
      data: { title: 'Reports', href: '#', icon: 'BarChart3', group: 'PLM', order: (last._max.order ?? 0) + 1, isActive: true },
    });
    console.log(`+ created: PLM › ${parent.title}`);
  }

  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    if (found.order !== -1 || found.parentId !== parent.id) {
      await prisma.menuItem.update({ where: { id: found.id }, data: { order: -1, parentId: parent.id } });
      console.log(`~ moved first under PLM › Reports: ${found.title}`);
    } else {
      console.log(`- skip (exists): ${found.title} -> ${href}`);
    }
  } else {
    const created = await prisma.menuItem.create({
      data: { title: 'Manage Reports', href, icon: 'SlidersHorizontal', parentId: parent.id, order: -1, isActive: true },
    });
    console.log(`+ created: ${created.title} -> ${created.href} (under PLM › Reports)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
