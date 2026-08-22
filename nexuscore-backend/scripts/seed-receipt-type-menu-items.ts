// One-off, idempotent nav seed/fix-up for the receipt-type screens (Receipt Screen
// Replication), updated for the confirmed ReceiptType numbering in receipt-types.config.ts
// (previous revision of that config used provisional placeholder numbers). Not a schema
// migration — plain Prisma Client data writes into the existing `MenuItem` table, matching the
// shape of its existing "Legacy ERP" rows exactly (global, companyId/branchId null, group
// "Legacy ERP", parentId null, icon "Truck" to match Purchase Receipt's own icon).
//
// Safe to re-run:
//  - hrefs whose ReceiptType still means the same thing under the new mapping are left alone
//    (skip-if-exists), never duplicated.
//  - hrefs whose ReceiptType now means something ELSE (e.g. old receiptType=11 was "Outside
//    Process (Sent) Inflow Return Receipt", new receiptType=11 is "Outside Process Receive
//    Receipt") have their title corrected in place — the href/number is unchanged, only the
//    label was wrong.
//  - hrefs for ReceiptType values that no longer appear anywhere in the new 19-value mapping
//    (old placeholders 2, 4, 5, 6, 7, 8, 9, 13, 20, 136 — none of which ever had any real
//    IM_Receipt data under them) are removed — these are stale nav shortcuts, not business
//    records, so deleting them is safe and keeps the menu from offering dead/mislabeled links.
//  - Purchase Receipt's own MenuItem (parameter-free href, ReceiptType now 2) and Purchase
//    Order's MenuItem (separate IM_OrderReceipt-backed module, already ReceiptType=1, untouched
//    by this feature) are both left exactly as they are.
//
// Run manually: npx ts-node scripts/seed-receipt-type-menu-items.ts
import { PrismaClient } from '@prisma/client';
import { RECEIPT_TYPES } from '../src/modules/legacy-erp/receipt-types.config';

const prisma = new PrismaClient();

const hrefFor = (receiptType: number) => `/dashboard/legacy-erp/inventory-receipts-list?receiptType=${receiptType}`;

// ReceiptType values that had a MenuItem row under the old placeholder mapping but do not
// appear anywhere in the new 19-value mapping (checked against RECEIPT_TYPES + the untouched
// Purchase Order value of 1).
const STALE_OLD_RECEIPT_TYPES = [2, 4, 5, 6, 7, 8, 9, 13, 20, 136];

async function main() {
  for (const rt of STALE_OLD_RECEIPT_TYPES) {
    const href = hrefFor(rt);
    const found = await prisma.menuItem.findFirst({ where: { href } });
    if (found) {
      await prisma.menuItem.delete({ where: { id: found.id } });
      console.log(`- removed (stale, no longer part of the confirmed mapping): ${found.title} -> ${href}`);
    }
  }

  const existingMax = await prisma.menuItem.aggregate({
    where: { group: 'Legacy ERP', parentId: null },
    _max: { order: true },
  });
  let nextOrder = (existingMax._max.order ?? 0) + 1;

  for (const t of RECEIPT_TYPES) {
    if (t.receiptType === 2) continue; // Purchase Receipt already has its own MenuItem row
    const href = hrefFor(t.receiptType);
    const desiredTitle = `${t.receiptType}-${t.label}`;
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
        icon: 'Truck',
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
