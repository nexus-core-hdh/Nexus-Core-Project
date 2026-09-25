// One-off, idempotent nav seed for the "Order Manufacturing Entry" screen
// (frontend/app/dashboard/(auth)/legacy-erp/order-manufacturing-entry/page.tsx,
// nexuscore-backend/src/modules/legacy-erp/order-manufacturing.{controller,service}.ts). ONLY adds
// its menu entry — the screen/API/tables (MA_WorkOrderProduction et al.) are separate.
//
// Placed as a top-level "Legacy ERP" item directly after the existing "Fabric/Trim/Yarn
// Requirements" expander, the same level as "Work Order" — the screen belongs to the Work Order
// family. AuditService.resolveScreen() looks this MenuItem up by href to fill Log Tracking's
// module/menu columns for every manufacturing audit row.
//
// Same pattern as seed-fabric-planning-menu-item.ts — plain Prisma Client write into the existing
// `MenuItem` table; safe to re-run (skips if a MenuItem with this href already exists).
//
// Run manually: npx ts-node scripts/seed-order-manufacturing-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/order-manufacturing-entry';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Order Manufacturing Entry -> ${href}`);
    await prisma.$disconnect();
    return;
  }

  const anchor = await prisma.menuItem.findFirst({
    where: { title: 'Fabric/Trim/Yarn Requirements', group: 'Legacy ERP', parentId: null },
  });
  const maxOrder = await prisma.menuItem.aggregate({ where: { parentId: null, group: 'Legacy ERP' }, _max: { order: true } });
  const order = (anchor?.order ?? maxOrder._max.order ?? 0) + 1;

  const created = await prisma.menuItem.create({
    data: { title: 'Order Manufacturing Entry', href, icon: null, group: 'Legacy ERP', parentId: null, order, isActive: true },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (top-level, group "Legacy ERP", order ${created.order})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
