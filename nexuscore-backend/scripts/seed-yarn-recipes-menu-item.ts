// One-off, idempotent nav seed for the new "Yarn Recipe" list/management screen
// (frontend/app/dashboard/(auth)/legacy-erp/yarn-recipes/page.tsx — a browsing screen over the
// existing FabricYarnRecipeLine/FabricYarnRecipeService data, no new table/API beyond the
// additive getYarnRecipeSummary endpoint). This script ONLY adds its menu entry, no new
// screen/API/table of its own.
//
// Nested under the same "Fabric/Trim/Yarn Requirements" parent MenuItem
// seed-fabric-planning-menu-item.ts already nests Fabric Planning under — the appropriate
// existing Fabric/Yarn-adjacent module/menu section, kept consistent with that sibling screen
// rather than inventing a new parent. Looked up by its own title+href, not a hardcoded id.
//
// Same pattern as seed-fabric-planning-menu-item.ts/seed-financial-receipt-menu-item.ts/
// seed-general-settings-menu-item.ts — plain Prisma Client write into the existing `MenuItem`
// table. Safe to re-run: skips if a MenuItem with this href already exists anywhere.
//
// Run manually: npx ts-node scripts/seed-yarn-recipes-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/yarn-recipes';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Yarn Recipe -> ${href}`);
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
      title: 'Yarn Recipe',
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
