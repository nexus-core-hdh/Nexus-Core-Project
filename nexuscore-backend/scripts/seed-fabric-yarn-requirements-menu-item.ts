// One-off, idempotent nav seed for the already-existing "Fabric/Trim/Yarn Requirements" parent +
// its 3 leaves (fabric-yarn-requirements.service.ts / page.tsx, built in an earlier task). This
// exact node is already defined in prisma/seed.ts (~line 704), but seed.ts only ever runs against
// an empty MenuItem table (see `if (existingMenus === 0)` guard) — this DB was already populated
// before that block was added, so it was never applied here. Same class of gap that
// seed-fabric-planning-menu-item.ts / seed-yarn-planning-menu-item.ts / seed-yarn-recipes-menu-
// item.ts all depend on this parent existing and fail without it.
//
// Safe to re-run: skips if a MenuItem with this exact href already exists.
//
// Run manually: npx ts-node scripts/seed-fabric-yarn-requirements-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const parentHref = '#';
  const parentTitle = 'Fabric/Trim/Yarn Requirements';

  let parent = await prisma.menuItem.findFirst({
    where: { title: parentTitle, group: 'Legacy ERP', parentId: null },
  });

  if (parent) {
    console.log(`- skip (exists): ${parentTitle} (id ${parent.id})`);
  } else {
    const existingMax = await prisma.menuItem.aggregate({
      where: { group: 'Legacy ERP', parentId: null },
      _max: { order: true },
    });
    const order = (existingMax._max.order ?? 0) + 1;
    parent = await prisma.menuItem.create({
      data: {
        title: parentTitle,
        href: parentHref,
        icon: 'ClipboardList',
        isNew: true,
        group: 'Legacy ERP',
        parentId: null,
        order,
        isActive: true,
      },
    });
    console.log(`+ created: ${parent.title} (order ${parent.order})`);
  }

  const children = [
    { title: 'Fabric Requirements', href: '/dashboard/legacy-erp/fabric-yarn-requirements?type=fabric' },
    { title: 'Trim Requirements', href: '/dashboard/legacy-erp/fabric-yarn-requirements?type=trim' },
    { title: 'Yarn Requirements', href: '/dashboard/legacy-erp/fabric-yarn-requirements?type=yarn' },
  ];

  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const found = await prisma.menuItem.findFirst({ where: { href: c.href } });
    if (found) {
      console.log(`- skip (exists): ${c.title} -> ${c.href}`);
      continue;
    }
    const created = await prisma.menuItem.create({
      data: {
        title: c.title,
        href: c.href,
        icon: null,
        group: null,
        parentId: parent.id,
        order: i,
        isActive: true,
      },
    });
    console.log(`+ created: ${created.title} -> ${created.href} (parent "${parentTitle}")`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
