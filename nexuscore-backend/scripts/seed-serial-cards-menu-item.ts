// One-off, idempotent nav seed for the already-existing "Serial Cards" screen
// (frontend/app/dashboard/(auth)/legacy-erp/serial-cards/page.tsx,
// nexuscore-backend/src/modules/legacy-erp/serial-card.{controller,service}.ts — built in an
// earlier task; this script ONLY adds its menu entry, no new screen/API/table).
//
// Placed as a top-level "Legacy ERP" item — the same level "Item Statement" already sits at
// (a standalone report/list screen, not nested under a parent expander), since Serial Cards is
// likewise its own browsable list, not a child of "Fabric/Trim/Yarn Requirements" or any other
// existing expander.
//
// Same pattern as seed-fabric-planning-menu-item.ts — plain Prisma Client write into the
// existing `MenuItem` table. Safe to re-run: skips if a MenuItem with this href already exists
// anywhere. No `permission`/RBAC field exists on MenuItem (confirmed via schema.prisma) and
// MenuItemsService.getMenuItems() filters only on isActive + company/branch, so none is added
// here (matching every sibling top-level Legacy ERP item).
//
// Run manually: npx ts-node scripts/seed-serial-cards-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/serial-cards';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Serial Cards -> ${href}`);
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
      title: 'Serial Cards',
      href,
      icon: 'Layers',
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
