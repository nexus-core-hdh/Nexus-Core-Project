// Idempotent nav seed for the Purchase Receipt list (ReceiptType 2). seed-receipt-type-menu-items.ts
// deliberately skips type 2 — "Purchase Receipt already has its own MenuItem row" — but nothing in
// the repository ever created that row (the development database got one by hand), so a fresh
// installation had no sidebar entry for Purchase Receipts at all.
//
// Uses the parameter-free list href, which is Purchase Receipt's canonical address (the list screen
// defaults to ReceiptType 2 without a parameter, and seed-receipt-type-menu-items.ts treats the
// "?receiptType=2" form as stale and removes it). Placed first under the existing "Inventory
// Receipts" expander, titled like its siblings ("<type>-<label>"). Safe to re-run: skips if a
// Purchase Receipt entry (either href form) already exists.
//
// Run manually: npx ts-node scripts/seed-purchase-receipt-menu-item.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const href = '/dashboard/legacy-erp/inventory-receipts-list';
  const found = await prisma.menuItem.findFirst({ where: { href: { in: [href, `${href}?receiptType=2`] } } });
  if (found) {
    console.log(`- skip (exists): ${found.title} -> ${found.href}`);
    await prisma.$disconnect();
    return;
  }

  const parent = await prisma.menuItem.findFirst({ where: { title: 'Inventory Receipts', group: 'Legacy ERP', parentId: null } });
  if (!parent) {
    console.error('! "Inventory Receipts" parent MenuItem not found. Aborting without creating an orphaned item.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const existingMin = await prisma.menuItem.aggregate({ where: { parentId: parent.id }, _min: { order: true } });
  const created = await prisma.menuItem.create({
    data: { title: '2-Purchase Receipt', href, icon: 'Truck', group: null, parentId: parent.id, order: (existingMin._min.order ?? 1) - 1, isActive: true },
  });
  console.log(`+ created: ${created.title} -> ${created.href} (parent "${parent.title}", order ${created.order})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
