// One-off, idempotent nav seed for the "Cutting Card" screen
// (frontend/app/[company]/(auth)/legacy-erp/cutting-card/page.tsx,
// nexuscore-backend/src/modules/legacy-erp/cutting.{controller,service}.ts). The screen already
// existed and worked (linked from Work Order), it just had zero MenuItem rows, so it never
// appeared in the sidebar. ONLY adds its menu entry — the screen/API/tables are untouched.
//
// Placed as a top-level "Legacy ERP" item directly after the existing "Fabric/Trim/Yarn
// Requirements" expander (the last currently-seeded top-level item) — same pattern as
// seed-order-manufacturing-menu-item.ts / seed-fabric-planning-menu-item.ts: plain Prisma Client
// write into the existing `MenuItem` table; safe to re-run (skips if a MenuItem with this href
// already exists).
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

  const anchor = await prisma.menuItem.findFirst({
    where: { title: 'Fabric/Trim/Yarn Requirements', group: 'Legacy ERP', parentId: null },
  });
  const maxOrder = await prisma.menuItem.aggregate({ where: { parentId: null, group: 'Legacy ERP' }, _max: { order: true } });
  const order = (anchor?.order ?? maxOrder._max.order ?? 0) + 1;

  const created = await prisma.menuItem.create({
    data: { title: 'Cutting Card', href, icon: 'Scissors', group: 'Legacy ERP', parentId: null, order, isActive: true },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (top-level, group "Legacy ERP", order ${created.order})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
