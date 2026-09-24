// One-off, idempotent menu reorganization: moves/relabels existing MenuItem rows into new
// top-level groups (Sales Module, Purchase, Inventory Management, Finance Module) plus targeted
// additions to PLM and Administration, per the approved menu-reorg plan. Every row is targeted by
// its known id, so re-running this script is safe — updates are pure overwrites, and new-row
// creation is guarded by an existence check (title+group) so it never duplicates on a second run.
// No hrefs change, no pages/routes/permissions are touched — only group/parentId/order/title.
//
// Run manually: npx ts-node scripts/reorganize-menu-modules.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateById(id: string, data: Record<string, any>, label: string) {
  const before = await prisma.menuItem.findUnique({ where: { id } });
  if (!before) {
    console.log(`! skip (id not found): ${label} (${id})`);
    return;
  }
  await prisma.menuItem.update({ where: { id }, data });
  console.log(`~ updated: ${label} (was "${before.title}", group "${before.group}")`);
}

async function ensureCreated(
  match: { title: string; group: string; parentId: string | null },
  data: { href: string; icon?: string; order: number; isActive: boolean },
): Promise<string> {
  const found = await prisma.menuItem.findFirst({ where: match });
  if (found) {
    console.log(`- skip (already exists): ${match.title} in ${match.group}`);
    return found.id;
  }
  const created = await prisma.menuItem.create({ data: { ...match, ...data } });
  console.log(`+ created: ${created.title} -> ${created.href} (group ${created.group})`);
  return created.id;
}

async function main() {
  // ── Sales Module ──────────────────────────────────────────────────────────
  await updateById('7309464a-2809-447f-b0b0-e12d9ad3a195', { group: 'Sales Module', order: 10 }, 'Dashboard');
  await updateById(
    '5ad23938-cbee-4ecf-b9d4-875a1415acc1',
    { group: 'Sales Module', parentId: null, title: 'Return Wholesale Module', order: 20 },
    'Return Wholesale Module',
  );
  await updateById(
    'bed7e730-9fc4-41e4-9c19-c43f135b75c0',
    { group: 'Sales Module', parentId: null, title: 'Sale Contract', order: 30 },
    'Sale Contract',
  );
  await updateById('0fe729b6-cba5-4588-896f-43983022d926', { group: 'Sales Module', order: 50 }, 'Orders');
  await updateById('eff78fd9-23c0-4fa1-be36-ac24f85a0737', { group: 'Sales Module', order: 60 }, 'Customers');
  await updateById('ad7be964-aed6-4535-ac15-eab6659cb6c9', { group: 'Sales Module', order: 70 }, 'Returns');

  const contractReceiptsId = await ensureCreated(
    { title: 'Contract Receipts', group: 'Sales Module', parentId: null },
    { href: '#', icon: 'FileText', order: 40, isActive: true },
  );
  await ensureCreated(
    { title: 'Subcontract Order', group: 'Sales Module', parentId: contractReceiptsId },
    { href: '/dashboard/legacy-erp/subcontract-orders-list', icon: 'Factory', order: 0, isActive: true },
  );
  await ensureCreated(
    { title: 'Sub Contract Receipt', group: 'Sales Module', parentId: contractReceiptsId },
    { href: '/dashboard/legacy-erp/subcontract-receipts-list', icon: 'Factory', order: 1, isActive: true },
  );

  // ── Purchase ──────────────────────────────────────────────────────────────
  await updateById(
    'a2447697-4226-47c4-91fb-b928403833e6',
    { group: 'Purchase', parentId: null, title: 'Purchase Receipt', order: 10 },
    'Purchase Receipt',
  );
  await updateById(
    '33b68a0d-643f-4f7b-98a2-60cc0c8d5140',
    { group: 'Purchase', parentId: null, title: 'Purchase Return Receipt', order: 20 },
    'Purchase Return Receipt',
  );
  await updateById(
    '0252c056-1f16-41c3-8960-98e6ff72ddc2',
    { group: 'Purchase', parentId: null, title: 'Purchase Order', order: 30 },
    'Purchase Order',
  );
  await updateById(
    '0e479cd8-5d50-467b-a724-21cca57987f8',
    { group: 'Purchase', parentId: null, title: 'Service Purchase Receipt', order: 40 },
    'Service Purchase Receipt',
  );
  await updateById(
    '75bcd5dc-b80f-4fde-872e-45203bf6b98b',
    { group: 'Purchase', parentId: null, title: 'Manufacture Sent Receipt', order: 50 },
    'Manufacture Sent Receipt',
  );
  await updateById(
    '58746f88-18cb-44ff-b7b1-9132a3a37916',
    { group: 'Purchase', parentId: null, title: 'Service Purchase Return Receipt', order: 60 },
    'Service Purchase Return Receipt',
  );

  // ── Inventory Management ─────────────────────────────────────────────────
  await updateById(
    '6f4cc2bb-35ae-40ce-aff3-9d1b8320ae1e',
    { group: 'Inventory Management', parentId: null, title: 'Subcontract Order', order: 10 },
    'Subcontract Order',
  );
  await updateById(
    '899cd00e-5889-4c9e-998c-1d5fd7639360',
    { group: 'Inventory Management', parentId: null, title: 'Sub Contract Receipt', order: 20 },
    'Sub Contract Receipt',
  );
  await updateById(
    '2931f526-893e-469b-9e8f-04a0c81fc686',
    { group: 'Inventory Management', parentId: null, title: 'Outside Manufacture Receipt', order: 30 },
    'Outside Manufacture Receipt',
  );
  await updateById(
    '3504aedf-e5de-4df5-8698-36afb66ba572',
    { group: 'Inventory Management', parentId: null, title: 'Manufacturing Return Receipt', order: 40 },
    'Manufacturing Return Receipt',
  );
  await updateById(
    'e71e8dd7-a28a-45ee-b502-7db611c8e59c',
    { group: 'Inventory Management', parentId: null, title: 'Special Purpose Outflow Receipt', order: 50 },
    'Special Purpose Outflow Receipt',
  );
  await updateById(
    'ee4a3bc9-4201-4dd2-aed2-a7b31c565330',
    { group: 'Inventory Management', parentId: null, title: 'Special Purpose Inflow Receipt', order: 60 },
    'Special Purpose Inflow Receipt',
  );

  // ── Finance Module ────────────────────────────────────────────────────────
  await updateById(
    'e6f3b74b-4aa0-458b-9772-c372cd2807e2',
    { group: 'Finance Module', parentId: null, title: 'Current Account', order: 10 },
    'Current Account',
  );

  // ── PLM (additive duplicates, everything else in PLM untouched) ────────────
  await ensureCreated(
    { title: 'Manufacture Sent Receipt', group: 'PLM', parentId: null },
    {
      href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=140',
      icon: 'Truck',
      order: 505,
      isActive: true,
    },
  );
  await ensureCreated(
    { title: 'Service Purchase Return Receipt', group: 'PLM', parentId: null },
    {
      href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=139',
      icon: 'Truck',
      order: 506,
      isActive: true,
    },
  );

  // ── Administration (existing 10 items untouched, these 7 appended after) ──
  await updateById(
    '6a1dcd2d-1ec4-471b-8aca-7344c24cb328',
    { group: 'Administration', parentId: null, title: 'General Setting', order: 910 },
    'General Setting',
  );
  await updateById(
    'aa563eae-cbc2-4232-b876-ee187b5e2e67',
    { group: 'Administration', parentId: null, title: 'Screen Parameter', order: 920 },
    'Screen Parameter',
  );
  await updateById(
    'a150168a-51b5-4337-9dde-5ef2fdf828ec',
    { group: 'Administration', parentId: null, order: 930 },
    'Fab Type Master',
  );
  await updateById(
    'c781b459-4e97-4dec-a2c6-bfcc21fbdff1',
    { group: 'Administration', parentId: null, order: 940 },
    'Group Code Master',
  );
  await updateById(
    '31137941-f694-443a-b4b3-e1077c083d37',
    { group: 'Administration', parentId: null, order: 950 },
    'Finish GSM Master',
  );
  await updateById(
    'b183ea9f-3c17-4585-813d-9c8db6bebc24',
    { group: 'Administration', parentId: null, order: 960 },
    'Dye Type Master',
  );
  await updateById(
    'd9489a19-a0da-4e7c-9d09-1d350d099de7',
    { group: 'Administration', parentId: null, order: 970 },
    'Composition Master',
  );

  // ── Cleanup: deactivate now-empty Legacy ERP sub-headers ───────────────────
  for (const id of [
    '765e6df5-f2e4-4a04-9708-e137a37f6fde', // Purchase (Legacy ERP)
    '7d308ce4-e65a-4bb9-bd75-1c30907449d6', // Subcontract (Legacy ERP)
    'e5995e62-53e7-43e8-9a58-c67f5629bc54', // Master Data / Lookups (Legacy ERP)
  ]) {
    const remaining = await prisma.menuItem.count({ where: { parentId: id } });
    if (remaining === 0) {
      await updateById(id, { isActive: false }, 'deactivate empty Legacy ERP header');
    } else {
      console.log(`! not deactivating ${id} — still has ${remaining} children`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
