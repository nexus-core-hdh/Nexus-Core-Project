// One-off, idempotent nav seed for the Invoice screens (frontend legacy-erp/receipt-invoices —
// the legacy IM_Invoice header linked to an Inventory Receipt, one screen per receipt type; see
// nexuscore-backend/src/modules/legacy-erp/invoice.service.ts). Adds a "Invoices" group under
// Legacy ERP with one leaf per receipt type (receipt-types.config.ts RECEIPT_TYPES), the same
// shape prisma/seed.ts gives fresh databases. Menu rows only — no screen, API or business record.
// MenuItem has no permission field; access stays enforced by the API's @PermissionModule('invoices').
//
// Each leaf opens that type's invoice LIST (receipt-invoices-list); leaves created earlier pointing at
// the invoice screen itself (receipt-invoices?receiptType=N) are re-pointed to the list — href only.
// Safe to re-run: the group and each leaf are skipped when their href already exists.
// Dry run by default (read-only):   npx ts-node scripts/seed-invoice-menu-items.ts
// Apply:                            npx ts-node scripts/seed-invoice-menu-items.ts --apply
import { PrismaClient } from '@prisma/client';
import { RECEIPT_TYPES } from '../src/modules/legacy-erp/receipt-types.config';

const prisma = new PrismaClient();
const GROUP_TITLE = 'Invoices';
export const invoiceMenuHref = (receiptType: number) => `/legacy-erp/receipt-invoices-list?receiptType=${receiptType}`;
/** The href the leaves had before the invoice lists existed (straight to the invoice screen). */
const formMenuHref = (receiptType: number) => `/legacy-erp/receipt-invoices?receiptType=${receiptType}`;
export const invoiceMenuTitle = (receiptType: number, label: string) => `${receiptType} - ${label} Invoice`;

async function main() {
  const apply = process.argv.includes('--apply');
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  console.log(`database: ${db} — ${apply ? 'APPLY' : 'dry run (read-only)'}`);

  let group = await prisma.menuItem.findFirst({ where: { group: 'Legacy ERP', parentId: null, title: GROUP_TITLE, href: '#' } });
  if (group) console.log(`- skip (exists): ${GROUP_TITLE}`);
  else if (apply) {
    const max = await prisma.menuItem.aggregate({ where: { group: 'Legacy ERP', parentId: null }, _max: { order: true } });
    group = await prisma.menuItem.create({ data: { title: GROUP_TITLE, href: '#', icon: 'Receipt', isNew: true, group: 'Legacy ERP', parentId: null, order: (max._max.order ?? -1) + 1, isActive: true } });
    console.log(`+ created group: ${GROUP_TITLE}`);
  } else console.log(`+ would create group: ${GROUP_TITLE} (Legacy ERP)`);

  for (const [i, t] of RECEIPT_TYPES.entries()) {
    const href = invoiceMenuHref(t.receiptType);
    const title = invoiceMenuTitle(t.receiptType, t.label);
    if (await prisma.menuItem.findFirst({ where: { href } })) { console.log(`- skip (exists): ${title}`); continue; }
    const old = await prisma.menuItem.findFirst({ where: { href: formMenuHref(t.receiptType), group: 'Legacy ERP' } });
    if (old) {
      if (apply) await prisma.menuItem.update({ where: { id: old.id }, data: { href } });
      console.log(`${apply ? '~ re-pointed' : '~ would re-point'}: ${old.title} -> ${href}`);
      continue;
    }
    if (!apply || !group) { console.log(`+ would create: ${title} -> ${href}`); continue; }
    await prisma.menuItem.create({ data: { title, href, group: 'Legacy ERP', parentId: group.id, order: i, isActive: true } });
    console.log(`+ created: ${title} -> ${href}`);
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
