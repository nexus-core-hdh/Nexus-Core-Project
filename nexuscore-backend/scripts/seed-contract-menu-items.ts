// One-off, idempotent nav seed for "00-Purchase Contract" / "00-Sale Contract" — plain Prisma
// Client data writes into the existing MenuItem table, same shape as the other Legacy ERP rows
// (global, companyId/branchId null, group "Legacy ERP", parentId null). The "00-" title prefix
// is a fixed display convention (per spec), independent of each screen's actual ReceiptType
// (1/2 — see contract-types.config.ts) the way every other MenuItem.title has always been
// independent of its href's query param value. Safe to re-run: skips/updates by href match,
// never creates a duplicate.
//
// Run manually: npx ts-node scripts/seed-contract-menu-items.ts
import { PrismaClient } from '@prisma/client';
import { CONTRACT_TYPES } from '../src/modules/legacy-erp/contract-types.config';

const prisma = new PrismaClient();

async function main() {
  const existingMax = await prisma.menuItem.aggregate({
    where: { group: 'Legacy ERP', parentId: null },
    _max: { order: true },
  });
  let nextOrder = (existingMax._max.order ?? 0) + 1;

  for (const t of CONTRACT_TYPES) {
    const href = `/dashboard/legacy-erp/contracts-list?receiptType=${t.receiptType}`;
    const desiredTitle = `00-${t.label}`;
    const found = await prisma.menuItem.findFirst({ where: { href } });
    if (found) {
      if (found.title !== desiredTitle) {
        await prisma.menuItem.update({ where: { id: found.id }, data: { title: desiredTitle } });
        console.log(`~ relabeled: "${found.title}" -> "${desiredTitle}" (${href})`);
      } else {
        console.log(`- skip (already correct): ${desiredTitle} -> ${href}`);
      }
      continue;
    }
    const created = await prisma.menuItem.create({
      data: {
        title: desiredTitle,
        href,
        icon: 'FileSignature',
        group: 'Legacy ERP',
        parentId: null,
        order: nextOrder++,
        isActive: true,
      },
    });
    console.log(`+ created: ${created.title} -> ${created.href} (order ${created.order})`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
