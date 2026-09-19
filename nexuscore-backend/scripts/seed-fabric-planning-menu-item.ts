// One-off, idempotent nav seed for the already-existing "Fabric Planning" screen
// (frontend/app/dashboard/(auth)/legacy-erp/fabric-planning/page.tsx,
// nexuscore-backend/src/modules/legacy-erp/fabric-planning.{controller,service}.ts — all built in
// an earlier task; this script ONLY adds its menu entry, no new screen/API/table).
//
// Placed as a 4th child under the real, already-existing "Fabric/Trim/Yarn Requirements" parent
// MenuItem (href "#", a pure expander node, group "Legacy ERP") — the same parent Fabric/Trim/Yarn
// Requirements already nest under, i.e. "the appropriate existing module/menu section used for
// Requirements/Planning". Looked up by its own title+href rather than a hardcoded id, so this
// script stays correct even if the parent's id differs across environments/seed runs.
//
// Same pattern as seed-financial-receipt-menu-item.ts/seed-general-settings-menu-item.ts — plain
// Prisma Client write into the existing `MenuItem` table. Safe to re-run: skips if a MenuItem with
// this href already exists anywhere (so it can never be duplicated even if re-run after a manual
// edit). No `permission`/RBAC field exists on MenuItem (confirmed via schema.prisma) and
// MenuItemsService.getMenuItems() filters only on isActive + company/branch — menu visibility is
// not permission-gated in this app, so none is added here (none of the sibling Requirements items
// have one either).
//
// Run manually: npx ts-node scripts/seed-fabric-planning-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/fabric-planning';
  const found = await prisma.menuItem.findFirst({ where: { href } });
  if (found) {
    console.log(`- skip (exists): Fabric Planning -> ${href}`);
    await prisma.$disconnect();
    return;
  }

  const parent = await prisma.menuItem.findFirst({
    where: { title: 'Fabric/Trim/Yarn Requirements', group: 'Legacy ERP', parentId: null },
  });
  if (!parent) {
    console.error('! "Fabric/Trim/Yarn Requirements" parent MenuItem not found — expected it to already exist (Fabric/Trim/Yarn Requirements children are seeded there). Aborting without creating an orphaned/top-level item.');
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
      title: 'Fabric Planning',
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
