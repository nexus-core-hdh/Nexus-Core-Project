// One-off, idempotent nav seed for the already-existing "Cutting Card" screen
// (frontend/app/[company]/(auth)/legacy-erp/cutting-card/page.tsx — Work Order search + Color x
// Size matrix, which opens ./entry for one Production Color;
// nexuscore-backend/src/modules/legacy-erp/cutting-card.{controller,service}.ts). The screen was
// added in 02f2eda as "a proper, independently-searchable workspace screen", but no MenuItem was
// ever created for it, so it was missing from the sidebar and from "Search screens…" (both read
// GET /menu-items) and reachable only through the Work Order's Cutting button. This script ONLY
// adds its menu entry, no new screen/API/table.
//
// Placed as a top-level "Legacy ERP" item, the same level as Work Order / Order Manufacturing Entry /
// Serial Cards (the production screens it sits alongside). Cutting Entry itself
// (/legacy-erp/cutting-card/entry) is not a menu item: it always needs a Work Order + Production
// Color, which this screen (or the Work Order's Cutting button) supplies.
//
// Same pattern as seed-serial-cards-menu-item.ts. Safe to re-run: skips if a MenuItem with this
// href already exists anywhere. MenuItem has no permission field; access stays enforced by the
// API's own @PermissionModule('cutting-cards').
//
// Run manually: npx ts-node scripts/seed-cutting-card-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/legacy-erp/cutting-card';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Cutting Card -> ${href}`);
    await prisma.$disconnect();
    return;
  }

  const existingMax = await prisma.menuItem.aggregate({
    where: { group: 'Legacy ERP', parentId: null },
    _max: { order: true },
  });
  const order = (existingMax._max.order ?? -1) + 1;

  const created = await prisma.menuItem.create({
    data: {
      title: 'Cutting Card',
      href,
      icon: 'Scissors',
      group: 'Legacy ERP',
      parentId: null,
      order,
      isActive: true,
    },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (group "${created.group}", order ${created.order})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
