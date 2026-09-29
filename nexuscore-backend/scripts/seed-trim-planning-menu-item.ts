// Idempotent nav seed for the already-existing "Trim Planning" screen
// (frontend/app/dashboard/(auth)/legacy-erp/trim-planning/page.tsx,
// nexuscore-backend/src/modules/legacy-erp/trim-planning.{controller,service}.ts). This script ONLY
// adds its menu entry — the development database got it by hand, with no script, so a fresh
// installation had no way to reach the screen from the sidebar.
//
// Same pattern as seed-fabric-planning-menu-item.ts: a child of the existing
// "Fabric/Trim/Yarn Requirements" expander (looked up by title, never a hard-coded id), after its
// existing children. Safe to re-run: skips if a MenuItem with this href already exists anywhere.
//
// Run manually: npx ts-node scripts/seed-trim-planning-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/trim-planning';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Trim Planning -> ${href}`);
    await prisma.$disconnect();
    return;
  }

  const parent = await prisma.menuItem.findFirst({
    where: { title: 'Fabric/Trim/Yarn Requirements', group: 'Legacy ERP', parentId: null },
  });
  if (!parent) {
    console.error('! "Fabric/Trim/Yarn Requirements" parent MenuItem not found. Aborting without creating an orphaned item.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const existingMax = await prisma.menuItem.aggregate({ where: { parentId: parent.id }, _max: { order: true } });
  const created = await prisma.menuItem.create({
    data: { title: 'Trim Planning', href, icon: null, group: null, parentId: parent.id, order: (existingMax._max.order ?? -1) + 1, isActive: true },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (parent "${parent.title}", order ${created.order})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
