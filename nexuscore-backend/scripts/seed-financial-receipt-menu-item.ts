// One-off, idempotent nav seed for the new "Financial Receipt & Master Data" screen (see
// frontend/app/dashboard/(auth)/legacy-erp/financial-receipt-master-data/page.tsx). Not a
// schema migration — plain Prisma Client data write into the existing `MenuItem` table, same
// shape/group as the other "Legacy ERP" rows. Safe to re-run: skips if the href already exists.
//
// Run manually: npx ts-node scripts/seed-financial-receipt-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/financial-receipt-master-data';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Financial Receipt & Master Data -> ${href}`);
    await prisma.$disconnect();
    return;
  }

  const existingMax = await prisma.menuItem.aggregate({
    where: { group: 'Legacy ERP', parentId: null },
    _max: { order: true },
  });
  const order = (existingMax._max.order ?? 0) + 1;

  const created = await prisma.menuItem.create({
    data: {
      title: 'Financial Receipt & Master Data',
      href,
      icon: 'Landmark',
      group: 'Legacy ERP',
      parentId: null,
      order,
      isActive: true,
    },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (order ${created.order})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
