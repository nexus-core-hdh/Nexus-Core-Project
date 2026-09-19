// One-off, idempotent nav seed for the new "Yarn Planning" screen
// (frontend/app/dashboard/(auth)/legacy-erp/yarn-planning/page.tsx,
// nexuscore-backend/src/modules/legacy-erp/yarn-planning.{controller,service}.ts). This script
// ONLY adds its menu entry, no new screen/API/table of its own.
//
// Nested under the same "Fabric/Trim/Yarn Requirements" parent MenuItem
// seed-fabric-planning-menu-item.ts/seed-yarn-recipes-menu-item.ts already nest their own
// siblings under — the same "Legacy ERP" Fabric/Yarn-adjacent module/menu section Fabric Planning
// itself lives in, kept consistent rather than inventing a new parent.
//
// Same pattern as seed-fabric-planning-menu-item.ts. Safe to re-run: skips if a MenuItem with this
// href already exists anywhere.
//
// Run manually: npx ts-node scripts/seed-yarn-planning-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/yarn-planning';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Yarn Planning -> ${href}`);
    await prisma.$disconnect();
    return;
  }

  const parent = await prisma.menuItem.findFirst({
    where: { title: 'Fabric/Trim/Yarn Requirements', group: 'Legacy ERP', parentId: null },
  });
  if (!parent) {
    console.error('! "Fabric/Trim/Yarn Requirements" parent MenuItem not found — expected it to already exist. Aborting without creating an orphaned/top-level item.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const existingMax = await prisma.menuItem.aggregate({
    where: { parentId: parent.id },
    _max: { order: true },
  });
  const order = (existingMax._max.order ?? -1) + 1;

  const created = await prisma.menuItem.create({
    data: {
      title: 'Yarn Planning',
      href,
      icon: null,
      group: null,
      parentId: parent.id,
      order,
      isActive: true,
    },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (parent "${parent.title}", order ${created.order})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
