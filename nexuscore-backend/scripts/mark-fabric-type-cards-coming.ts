// One-off, idempotent menu fix for "PLM > General Definitions > Fabric Type Cards".
//
// Its href, /plm/general-definitions/fabric-type-cards, has never had a page: the entry dates from the
// initial commit, no frontend screen uses the fabric-types API (src/modules/fabric), and Legacy ERP's
// Fabric Card picks its Fabric Type from the legacy lookup tables instead. Clicking it opened Next.js's
// "404 Page not found". This marks the entry isComing — the menu's existing "not built yet" flag:
// the module launcher and "Search screens…" skip such entries, so nothing links to the missing page.
// The row itself is kept (no delete). When the screen is built, set isComing back to false (and
// remove the href from KNOWN_MISSING_PAGES in frontend/scripts/route-integrity.test.mjs).
//
// prisma/seed.ts and the frontend fallback menu (components/layout/sidebar/nav-main.tsx) carry the
// same flag. Safe to re-run: only rows with this href that are not yet isComing are updated.
//
// Run manually: npx ts-node scripts/mark-fabric-type-cards-coming.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/plm/general-definitions/fabric-type-cards';
  const rows = await prisma.menuItem.findMany({ where: { href }, select: { id: true, title: true, isComing: true, companyId: true } });
  if (!rows.length) {
    console.log(`- skip: no MenuItem with href ${href}`);
    return;
  }
  for (const row of rows) {
    if (row.isComing) {
      console.log(`- skip (already coming soon): ${row.title} [${row.id}]`);
      continue;
    }
    await prisma.menuItem.update({ where: { id: row.id }, data: { isComing: true } });
    console.log(`~ marked coming soon: ${row.title} [${row.id}]${row.companyId ? ` (company ${row.companyId})` : ''}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
