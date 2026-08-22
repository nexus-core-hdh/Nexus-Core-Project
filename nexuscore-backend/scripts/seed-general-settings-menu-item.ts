// One-off, idempotent nav seed for the new "General Settings" screen (Approval Configuration).
// Same pattern as seed-financial-receipt-menu-item.ts — plain Prisma Client write into the
// existing `MenuItem` table, same "Legacy ERP" group. Safe to re-run.
//
// Run manually: npx ts-node scripts/seed-general-settings-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/general-settings';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): General Settings -> ${href}`);
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
      title: 'General Settings',
      href,
      icon: 'Settings',
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
