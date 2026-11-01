// Company isolation across the remaining Legacy ERP modules — masters and dropdowns, Work Orders
// (lines, quantities, BOM), Purchase / Subcontract Orders, Contracts, Financial Receipts, item cards
// and their tabs / attachments, Trim Cards, Serial Cards, Packing Lists, Cutting, Order
// Manufacturing, Item Allocation, planning, the follow-up / requirement reports, recipe usage, the
// generic grids and worklists, "table:" report sources, custom-field records and the dashboard —
// between two real legacy companies on the throwaway test database (`npm run test:company-isolation`).
// Company A = legacy company 1, company B = a legacy company created here. For each module: new
// records are stamped with the creating company, the other company's records are "not found"
// (never 403) or simply absent from lists, and another company's records can't be linked.
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ApprovalService } from '../../src/modules/approval/approval.service';
import { LegacyMasterLookupService } from '../../src/modules/legacy-erp/legacy-master-lookup.service';
import { DeleteDependencyService } from '../../src/modules/legacy-erp/delete-dependency.service';
import { ReceiptTraceabilityService } from '../../src/modules/legacy-erp/receipt-traceability.service';
import { InventoryReceiptService } from '../../src/modules/legacy-erp/inventory-receipt.service';
import { AccountService } from '../../src/modules/legacy-erp/account.service';
import { WarehouseService } from '../../src/modules/legacy-erp/warehouse.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { PurchaseOrderService } from '../../src/modules/legacy-erp/purchase-order.service';
import { ContractService } from '../../src/modules/legacy-erp/contract.service';
import { FiReceiptService } from '../../src/modules/legacy-erp/fi-receipt.service';
import { YarnCardService } from '../../src/modules/legacy-erp/yarn-card.service';
import { FabricCardService } from '../../src/modules/legacy-erp/fabric-card.service';
import { TrimCardService } from '../../src/modules/legacy-erp/trim-card.service';
import { YarnCardSatellitesService } from '../../src/modules/legacy-erp/yarn-card-satellites.service';
import { AccountSatellitesService } from '../../src/modules/legacy-erp/account-satellites.service';
import { AccountAttachmentsService } from '../../src/modules/legacy-erp/account-attachments.service';
import { SerialCardService } from '../../src/modules/legacy-erp/serial-card.service';
import { PackingListService } from '../../src/modules/legacy-erp/packing-list.service';
import { CuttingCardService } from '../../src/modules/legacy-erp/cutting-card.service';
import { OrderManufacturingService } from '../../src/modules/legacy-erp/order-manufacturing.service';
import { ItemAllocationService } from '../../src/modules/legacy-erp/item-allocation.service';
import { FabricPlanningService } from '../../src/modules/legacy-erp/fabric-planning.service';
import { FabricYarnRequirementsService } from '../../src/modules/legacy-erp/fabric-yarn-requirements.service';
import { ProcessFollowUpService } from '../../src/modules/legacy-erp/process-follow-up.service';
import { DyeingFollowUpService } from '../../src/modules/legacy-erp/dyeing-follow-up.service';
import { RecipeUsageService } from '../../src/modules/legacy-erp/recipe-usage.service';
import { UnifiedGridService } from '../../src/modules/legacy-erp/unified-grid.service';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';
import { ReportBuilderService } from '../../src/modules/reports/report-builder.service';
import { LegacyCompanyContext } from '../../src/modules/legacy-erp/legacy-company-context.service';
import { runAsLegacyCompany, setNonHttpLegacyCompanyDefault } from '../../src/modules/legacy-erp/legacy-company-scope';

let prisma: PrismaService;
let A: LegacyCompanyContext;
let B: LegacyCompanyContext;
const USER = 7;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
let seq = 0;
const uniq = (p: string) => `${p}${RUN}${++seq}`;
const one = async (sql: Prisma.Sql) => Number((await prisma.$queryRaw<any[]>(sql))[0].id);
const as = <T = any>(ctx: LegacyCompanyContext, fn: () => Promise<T>): Promise<T> => runAsLegacyCompany(ctx, fn);
const status = (p: Promise<unknown>): Promise<string> => p.then(() => 'ok', (e: any) => String(e?.getStatus?.() ?? e?.message));
const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows ?? []);
const stamp = async (table: string, id: number) =>
  (await prisma.$queryRaw<any[]>(Prisma.sql`SELECT "CompanyId"::int c, "WorkplaceId"::int w FROM ${Prisma.raw(`"${table}"`)} WHERE "RecId" = ${id}`))[0];

const svc: Record<string, any> = {};

/** One company's documents, inserted the way the application stamps them. */
async function seed(ctx: LegacyCompanyContext) {
  const c = ctx.legacyCompanyId;
  const account = await one(Prisma.sql`INSERT INTO "FI_Account" ("CompanyId", "CurrentAccountCode", "CurrentAccountName", "IsDeleted") VALUES (${c}, ${uniq('ACC')}, ${uniq('Party ')}, 0) RETURNING "RecId" as id`);
  const warehouse = await one(Prisma.sql`INSERT INTO "IM_Warehouse" ("CompanyId", "WarehouseCode", "WarehouseName", "IsDeleted") VALUES (${c}, ${uniq('WH')}, 'Store', 0) RETURNING "RecId" as id`);
  const yarn = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${c}, ${uniq('YARN-')}, ${uniq('Yarn ')}, 'YARN', 0) RETURNING "RecId" as id`);
  const fabric = await one(Prisma.sql`INSERT INTO "IM_Item" ("CompanyId", "InventoryCode", "InventoryName", "AccessCode", "IsDeleted") VALUES (${c}, ${uniq('FABRIC-')}, ${uniq('Fabric ')}, 'FABRIC', 0) RETURNING "RecId" as id`);
  const workOrderNo = uniq('W/O-');
  const workOrder = await one(Prisma.sql`INSERT INTO "MA_WorkOrder" ("CompanyId", "WorkOrderNo", "WorkOrderDate", "CurrentAccountId", "IsDeleted") VALUES (${c}, ${workOrderNo}, now(), ${account}, 0) RETURNING "RecId" as id`);
  const woItem = await one(Prisma.sql`INSERT INTO "MA_WorkOrderItem" ("WorkOrderId", "ItemOrderNo", "IsDeleted") VALUES (${workOrder}, 1, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "MA_WorkOrderItemVariant" ("WorkOrderItemId", "Explanation", "Quantity", "SubNo", "IsDeleted") VALUES (${woItem}, 'RED‖M', 10, 1, 0)`;
  const recipe = await one(Prisma.sql`INSERT INTO "MA_Recipe" ("CompanyId", "WorkOrderId", "RecipeType", "RecipeCode", "IsDeleted") VALUES (${c}, ${workOrder}, 1, ${uniq('R')}, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "MA_RecipeItem" ("RecipeId", "RecipeType", "InventoryId", "Quantity", "IsDeleted") VALUES (${recipe}, 1, ${yarn}, 2, 0)`;
  const poNo = uniq('PO-');
  const po = await one(Prisma.sql`INSERT INTO "IM_OrderReceipt" ("CompanyId", "ReceiptType", "ReceiptNo", "ReceiptDate", "CurrentAccountId", "IsDeleted") VALUES (${c}, 1, ${poNo}, now(), ${account}, 0) RETURNING "RecId" as id`);
  const poLine = await one(Prisma.sql`INSERT INTO "IM_OrderReceiptItem" ("OrderReceiptId", "ReceiptType", "ItemOrderNo", "InventoryId", "Quantity", "ManufacturingOrderId", "IsDeleted") VALUES (${po}, 1, 1, ${yarn}, 5, ${workOrder}, 0) RETURNING "RecId" as id`);
  const contract = await one(Prisma.sql`INSERT INTO "SM_Contract" ("CompanyId", "ReceiptType", "ReceiptNo", "ReceiptDate", "IsDeleted") VALUES (${c}, 1, ${uniq('PC-')}, now(), 0) RETURNING "RecId" as id`);
  const fiReceipt = await one(Prisma.sql`INSERT INTO "FI_Receipt" ("CompanyId", "ReceiptType", "ReceiptNo", "ReceiptDate", "IsDeleted") VALUES (${c}, 1, ${uniq('FR-')}, now(), 0) RETURNING "RecId" as id`);
  const trimCard = await one(Prisma.sql`INSERT INTO "MA_YarnTrimCard" ("CompanyId", "Code", "IsDeleted") VALUES (${c}, ${uniq('TC-')}, 0) RETURNING "RecId" as id`);
  // A Fabric purchase receipt line on the Work Order (for serial cards, allocation, dyeing).
  const receiptNo = uniq('IR-');
  const receipt = await one(Prisma.sql`INSERT INTO "IM_Receipt" ("CompanyId", "WorkplaceId", "ReceiptType", "ReceiptNo", "ReceiptDate", "CurrentAccountId", "IsDeleted") VALUES (${c}, ${ctx.workplaceId}, 2, ${receiptNo}, now(), ${account}, 0) RETURNING "RecId" as id`);
  const receiptLine = await one(Prisma.sql`INSERT INTO "IM_ReceiptItem" ("InventoryReceiptId", "ReceiptType", "ItemOrderNo", "InventoryId", "Quantity", "WorkOrderReceiptItemId", "IsDeleted") VALUES (${receipt}, 2, 1, ${fabric}, 100, ${woItem}, 0) RETURNING "RecId" as id`);
  const serialCode = uniq('SC');
  const serialCard = await one(Prisma.sql`INSERT INTO "IM_SerialCard" ("CompanyId", "SerialCode", "InventoryId", "Quantity", "InUse", "IsDeleted") VALUES (${c}, ${serialCode}, ${fabric}, 1, 1, 0) RETURNING "RecId" as id`);
  await prisma.$executeRaw`INSERT INTO "IM_SerialTransaction" ("SerialCardId", "TransactionType", "ReceiptItemId", "Quantity", "IsDeleted") VALUES (${serialCard}, 1, ${receiptLine}, 0, 0)`;
  return { account, warehouse, yarn, fabric, workOrder, workOrderNo, woItem, po, poNo, poLine, contract, fiReceipt, trimCard, receipt, receiptNo, receiptLine, serialCard, serialCode };
}
let a: Awaited<ReturnType<typeof seed>>;
let b: Awaited<ReturnType<typeof seed>>;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  setNonHttpLegacyCompanyDefault(null); // every call below runs explicitly as A or B
  for (const t of ['MD_Company', 'MD_Workplace']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${t}"), 1))`);
  }
  const bId = await one(Prisma.sql`INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "IsDeleted", "UUID") VALUES (${uniq('B').slice(0, 25)}, 'Company B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  const bWp = await one(Prisma.sql`INSERT INTO "MD_Workplace" ("CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "IsDeleted", "UUID") VALUES (${bId}, ${uniq('WB').slice(0, 25)}, 'B', 1, 0, gen_random_uuid()) RETURNING "RecId" AS id`);
  const coA = await prisma.company.create({ data: { name: uniq('A'), slug: uniq('a').toLowerCase() } });
  const coB = await prisma.company.create({ data: { name: uniq('B'), slug: uniq('b').toLowerCase() } });
  A = { companyId: coA.id, legacyCompanyId: 1, workplaceId: 1 };
  B = { companyId: coB.id, legacyCompanyId: bId, workplaceId: bWp };

  const audit = new AuditService(prisma);
  const lookup = new LegacyMasterLookupService(prisma, null as any);
  const del = new DeleteDependencyService(prisma);
  const workOrders = new WorkOrderService(prisma, audit, lookup);
  const requirements = new FabricYarnRequirementsService(prisma, workOrders, null as any, audit);
  const cutting = new CuttingCardService(prisma, workOrders, requirements, lookup, audit);
  const allocation = new ItemAllocationService(prisma, audit);
  const purchaseOrders = new PurchaseOrderService(prisma, new ApprovalService(prisma, audit), lookup, del, new ReceiptTraceabilityService(prisma), audit);
  const fiReceipts = new FiReceiptService(prisma, del);
  const inventoryReceipts = new InventoryReceiptService(prisma, new ApprovalService(prisma, audit), lookup, del, new ReceiptTraceabilityService(prisma), audit);
  const yarnCards = new YarnCardService(prisma, del, lookup, audit);
  Object.assign(svc, {
    lookup, workOrders, cutting, allocation, purchaseOrders, fiReceipts, yarnCards,
    accounts: new AccountService(prisma, lookup, audit),
    warehouses: new WarehouseService(prisma, del),
    contracts: new ContractService(prisma, lookup, audit),
    fabricCards: new FabricCardService(prisma, del, lookup, yarnCards, audit),
    trimCards: new TrimCardService(prisma),
    itemTabs: new YarnCardSatellitesService(prisma),
    accountTabs: new AccountSatellitesService(prisma),
    accountFiles: new AccountAttachmentsService(prisma),
    serials: new SerialCardService(prisma, audit, requirements, { resolveEffectiveRecipe: async () => ({ lines: [] }) } as any),
    packing: new PackingListService(prisma, cutting, workOrders),
    om: new OrderManufacturingService(prisma, audit, workOrders, cutting, requirements),
    planning: new FabricPlanningService(prisma, workOrders, requirements, allocation),
    processFollowUp: new ProcessFollowUpService(prisma),
    dyeing: new DyeingFollowUpService(prisma),
    recipeUsage: new RecipeUsageService(prisma),
    grid: new UnifiedGridService(prisma),
    dashboard: new DashboardService(prisma, purchaseOrders, fiReceipts, inventoryReceipts),
    reports: new ReportBuilderService(prisma as any, { recordSafe: async () => undefined } as any),
  });
  a = await as(A, () => seed(A));
  b = await as(B, () => seed(B));
});
after(async () => {
  setNonHttpLegacyCompanyDefault({ companyId: 'test-default', legacyCompanyId: 1, workplaceId: 1 });
  await prisma.$disconnect();
});

describe('masters and dropdowns', () => {
  test("Current Accounts: B's account is hidden / not found for A; new accounts are stamped", async () => {
    const r = await as(A, async () => ({
      listed: rowsOf(await svc.accounts.list(undefined)).some((x: any) => x.id === b.account),
      get: await status(svc.accounts.get(b.account)),
      update: await status(svc.accounts.update(b.account, { currentAccountName: 'X' }, USER)),
      remove: await status(svc.accounts.remove(b.account, USER)),
      tabs: await status(svc.accountTabs.list('address', b.account)),
      files: await status(svc.accountFiles.list(b.account, 'document')),
      own: await status(svc.accounts.get(a.account)),
    }));
    assert.deepEqual(r, { listed: false, get: '404', update: '404', remove: '404', tabs: '404', files: '404', own: 'ok' });
    const created: any = await as(B, () => svc.accounts.create({ currentAccountName: uniq('New B '), currentAccountType: 0 }, USER));
    assert.deepEqual(await stamp('FI_Account', created.id), { c: B.legacyCompanyId, w: B.workplaceId });
  });

  test("Warehouses: hidden across companies; a warehouse can't be put on another company's workplace", async () => {
    const r = await as(A, async () => ({
      listed: rowsOf(await svc.warehouses.list()).some((x: any) => Number(x.id) === b.warehouse),
      get: await status(svc.warehouses.get(b.warehouse)),
      foreignWorkplace: await status(svc.warehouses.create({ warehouseName: 'X', workplaceId: B.workplaceId } as any, USER)),
    }));
    assert.deepEqual(r, { listed: false, get: '404', foreignWorkplace: '400' });
    const w: any = await as(B, () => svc.warehouses.create({ warehouseName: uniq('Store B ') } as any, USER));
    assert.deepEqual(await stamp('IM_Warehouse', Number(w.id)), { c: B.legacyCompanyId, w: B.workplaceId });
  });

  test("dropdown lookups (master lookup): only the running company's accounts / items / Work Orders", async () => {
    const names = async (ctx: LegacyCompanyContext, key: string, search: string) => (await as(ctx, () => svc.lookup.search(key, search))).length;
    const [[accB]] = [await prisma.$queryRaw<any[]>`SELECT "CurrentAccountCode" code FROM "FI_Account" WHERE "RecId" = ${b.account}`];
    assert.equal(await names(A, 'current-account', accB.code), 0, "A's dropdown never offers B's account");
    assert.equal(await names(B, 'current-account', accB.code), 1);
    assert.equal(await names(A, 'manufacturing-order', b.workOrderNo), 0);
    assert.equal(await as(A, () => svc.lookup.getById('current-account', b.account)), null, 'by id: nothing (display resolvers get no name)');
    assert.notEqual(await as(B, () => svc.lookup.getById('current-account', b.account)), null);
  });
});

describe('Work Orders', () => {
  test("B's Work Order and its lines / quantities / BOM are not found for A", async () => {
    const r = await as(A, async () => ({
      listed: rowsOf(await svc.workOrders.list(b.workOrderNo)).length,
      get: await status(svc.workOrders.get(b.workOrder)),
      update: await status(svc.workOrders.update(b.workOrder, { explanation: 'X' }, USER)),
      remove: await status(svc.workOrders.remove(b.workOrder, USER)),
      items: await status(svc.workOrders.listItems(b.workOrder)),
      upsertItems: await status(svc.workOrders.upsertItems(b.workOrder, [], USER)),
      variants: await status(svc.workOrders.listItemVariants(b.woItem)),
      upsertVariants: await status(svc.workOrders.upsertItemVariants(b.woItem, [], USER)),
      bom: await status(svc.workOrders.listBom(b.workOrder, 'fabric')),
      upsertBom: await status(svc.workOrders.upsertBom(b.workOrder, 'fabric', [], USER)),
    }));
    assert.deepEqual(r, { listed: 0, get: '404', update: '404', remove: '404', items: '404', upsertItems: '404', variants: '404', upsertVariants: '404', bom: '404', upsertBom: '404' });
    const still = await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "MA_WorkOrderItemVariant" WHERE "WorkOrderItemId" = ${b.woItem} AND "IsDeleted" = 0`;
    assert.equal(still[0].n, 1, "B's quantities untouched");
  });

  test("a Work Order can't link another company's customer, warehouse or items; new ones are stamped", async () => {
    assert.equal(await status(as(A, () => svc.workOrders.create({ currentAccountId: b.account }, USER))), '400');
    assert.equal(await status(as(A, () => svc.workOrders.create({ warehouseId: b.warehouse }, USER))), '400');
    assert.equal(await status(as(A, () => svc.workOrders.upsertItems(a.workOrder, [{ inventoryId: b.yarn }], USER))), '400');
    const wo: any = await as(B, () => svc.workOrders.create({ currentAccountId: b.account }, USER));
    assert.deepEqual(await stamp('MA_WorkOrder', wo.id), { c: B.legacyCompanyId, w: B.workplaceId });
  });
});

describe('orders, contracts and financial receipts', () => {
  test("Purchase Orders: B's order, lines and pending lines are invisible to A; foreign links refused", async () => {
    const r = await as(A, async () => ({
      listed: rowsOf(await svc.purchaseOrders.list(b.poNo)).length,
      get: await status(svc.purchaseOrders.get(b.po)),
      items: await status(svc.purchaseOrders.listItems(b.po)),
      createItem: await status(svc.purchaseOrders.createItem(b.po, { inventoryId: a.yarn, quantity: 1 }, USER)),
      updateItem: await status(svc.purchaseOrders.updateItem(b.poLine, { quantity: 9 }, USER)),
      removeItem: await status(svc.purchaseOrders.removeItem(b.poLine, USER)),
      pending: rowsOf(await svc.purchaseOrders.listPending(b.account)).length,
      foreignSupplier: await status(svc.purchaseOrders.create({ currentAccountId: b.account }, USER)),
      foreignItem: await status(svc.purchaseOrders.createItem(a.po, { inventoryId: b.yarn, quantity: 1 }, USER)),
      foreignWorkOrder: await status(svc.purchaseOrders.createItem(a.po, { inventoryId: a.yarn, quantity: 1, manufacturingOrderId: b.workOrder }, USER)),
    }));
    assert.deepEqual(r, { listed: 0, get: '404', items: '404', createItem: '404', updateItem: '404', removeItem: '404', pending: 0, foreignSupplier: '400', foreignItem: '400', foreignWorkOrder: '400' });
    const po: any = await as(B, () => svc.purchaseOrders.create({ currentAccountId: b.account, receiptDate: '2026-10-31' }, USER));
    assert.deepEqual(await stamp('IM_OrderReceipt', po.id), { c: B.legacyCompanyId, w: B.workplaceId });
  });

  test("Contracts and Financial Receipts: B's documents and lines are not found for A", async () => {
    const r = await as(A, async () => ({
      contract: await status(svc.contracts.get(b.contract, 1)),
      contractItems: await status(svc.contracts.listItems(b.contract)),
      contractListed: rowsOf(await svc.contracts.list(undefined, 1)).some((x: any) => x.id === b.contract),
      fi: await status(svc.fiReceipts.get(b.fiReceipt)),
      fiItems: await status(svc.fiReceipts.listItems(b.fiReceipt)),
      fiListed: rowsOf(await svc.fiReceipts.list()).some((x: any) => x.id === b.fiReceipt),
    }));
    assert.deepEqual(r, { contract: '404', contractItems: '404', contractListed: false, fi: '404', fiItems: '404', fiListed: false });
  });
});

describe('item cards, Trim Cards and Serial Cards', () => {
  test("Yarn / Fabric cards and their tabs: B's items are not found for A", async () => {
    const r = await as(A, async () => ({
      yarn: await status(svc.yarnCards.get(b.yarn)),
      yarnListed: rowsOf(await svc.yarnCards.list()).some((x: any) => x.id === b.yarn),
      yarnUpdate: await status(svc.yarnCards.update(b.yarn, { inventoryName: 'X' }, USER)),
      fabric: await status(svc.fabricCards.get(b.fabric)),
      tab: await status(svc.itemTabs.list('unit', b.yarn)),
      own: await status(svc.yarnCards.get(a.yarn)),
    }));
    assert.deepEqual(r, { yarn: '404', yarnListed: false, yarnUpdate: '404', fabric: '404', tab: '404', own: 'ok' });
  });

  test("Trim Cards: B's card and lines are not found for A", async () => {
    const r = await as(A, async () => ({
      get: await status(svc.trimCards.get(b.trimCard)),
      items: await status(svc.trimCards.listItems(b.trimCard)),
      listed: rowsOf(await svc.trimCards.list()).some((x: any) => x.id === b.trimCard),
    }));
    assert.deepEqual(r, { get: '404', items: '404', listed: false });
  });

  test("Serial Cards: B's cards are absent from A's list / scan, and A can't produce on B's receipt line", async () => {
    const r = await as(A, async () => ({
      listed: (await svc.serials.listAll({ serialNo: b.serialCode })).total,
      detail: await status(svc.serials.getDetail(b.serialCard)),
      scan: await status(svc.serials.getByCode(b.serialCode)),
      context: await status(svc.serials.getContext(b.receipt, b.receiptLine)),
      produce: await status(svc.serials.produce(b.receipt, b.receiptLine, { count: 1 } as any, 'u', A.companyId)),
      remove: await status(svc.serials.remove(b.serialCard, 'u', A.companyId)),
    }));
    assert.deepEqual(r, { listed: 0, detail: '404', scan: '404', context: '404', produce: '404', remove: '404' });
    assert.equal((await as(B, () => svc.serials.listAll({ serialNo: b.serialCode }))).total, 1);
  });
});

describe('production: Packing List, Cutting, Order Manufacturing, Allocation', () => {
  test("A can't open B's Work Order in Packing List, Cutting, Order Manufacturing or Item Allocation", async () => {
    const r = await as(A, async () => ({
      packingCreate: await status(svc.packing.create({ workOrderId: b.workOrder }, USER)),
      packingContext: await status(svc.packing.workOrderContext(b.workOrder)),
      cutting: await status(svc.cutting.getColorMatrix(b.workOrder)),
      om: await status(svc.om.getContext(b.workOrder)),
      allocations: await status(svc.allocation.listAllocations(b.workOrder, b.fabric)),
      allocate: await status(svc.allocation.saveAllocation({ workOrderId: b.workOrder, inventoryReceiptItemId: b.receiptLine, inventoryId: b.fabric, quantity: 1 } as any, 'u', A.companyId)),
      receiptLineAllocations: await status(svc.allocation.getReceiptItemAllocations(b.receiptLine)),
    }));
    assert.deepEqual(r, { packingCreate: '400', packingContext: '400', cutting: '404', om: '404', allocations: '404', allocate: '404', receiptLineAllocations: '404' });
  });

  test("a Packing List of B is stamped B and not found for A; A can't attach B's customer", async () => {
    const pl: any = await as(B, () => svc.packing.create({ workOrderId: b.workOrder }, USER));
    assert.deepEqual(await stamp('IM_PackagingList', pl.id), { c: B.legacyCompanyId, w: B.workplaceId });
    assert.equal(await status(as(A, () => svc.packing.get(pl.id))), '404');
    assert.equal(await status(as(A, () => svc.packing.create({ workOrderId: a.workOrder, currentAccountId: b.account }, USER))), '400');
  });
});

describe('planning and reports', () => {
  test("planning candidates and the follow-up / dyeing reports only cover the running company's Work Orders and receipts", async () => {
    const candidates = await as(A, () => svc.planning.findCandidateWorkOrderIds({ orderNo: b.workOrderNo }));
    assert.deepEqual(candidates, [], "B's Work Order is never an A planning candidate");
    assert.deepEqual(await as(B, () => svc.planning.findCandidateWorkOrderIds({ orderNo: b.workOrderNo })), [b.workOrder]);
    const pfu: any = await as(A, () => svc.processFollowUp.build({ workOrderIds: [b.workOrder] }, { includeEmptyProcesses: true }));
    assert.equal(JSON.stringify(pfu).includes(b.workOrderNo), false, "A's Process Follow-up never shows B's Work Order");
    const dyeing: any = await as(A, () => svc.dyeing.build({ workOrderIds: [b.workOrder] }));
    assert.equal(JSON.stringify(dyeing).includes(b.receiptNo), false, "A's Dyeing Follow-up never shows B's receipt");
    const names = await as(A, () => svc.processFollowUp.names('workOrder', [b.workOrder]));
    assert.deepEqual(names, [`#${b.workOrder}`], "B's Work Order number isn't revealed by id");
  });

  test("Recipe Usage: A never sees B's Work Orders using an item", async () => {
    const usage = await as(A, () => svc.recipeUsage.list({ inventoryId: b.yarn }));
    assert.equal(usage.rows.some((r: any) => r.code === b.workOrderNo), false);
    const own = await as(B, () => svc.recipeUsage.list({ inventoryId: b.yarn }));
    assert.equal(own.rows.some((r: any) => r.code === b.workOrderNo), true);
  });

  test('generic grids and "table:" report sources: own rows only (line tables through their parent)', async () => {
    const accounts = rowsOf(await as(A, () => svc.grid.list('current-account')));
    assert.equal(accounts.some((x: any) => Number(x.RecId) === b.account), false, "unified grid: B's account hidden from A");
    const count = async (ctx: LegacyCompanyContext, dataSource: string, field: string, value: string | number) => ((await as(ctx, () => svc.reports.preview('legacy-erp', {
      name: 'T', dataSource, columns: [{ field }], filters: [{ id: 'f', field, operator: 'eq', value: Number(value) }],
    } as any, {}, { id: 'u', companyId: ctx.companyId }))) as any).rows.length;
    assert.deepEqual([await count(A, 'table:FI_Account', 'RecId', b.account), await count(B, 'table:FI_Account', 'RecId', b.account)], [0, 1], 'table:FI_Account');
    assert.deepEqual([await count(A, 'table:IM_ReceiptItem', 'RecId', b.receiptLine), await count(B, 'table:IM_ReceiptItem', 'RecId', b.receiptLine)], [0, 1], 'table:IM_ReceiptItem (scoped through its receipt)');
  });

  test('dashboard Work Order figures count only the running company; a company with no legacy mapping sees none', async () => {
    const from = new Date(Date.now() - 86400000), to = new Date(Date.now() + 86400000);
    const total = (k: any) => Object.values(k.current ?? {}).reduce((s: number, v: any) => s + Number(v || 0), 0) as number;
    const ownB = Number(await prisma.$queryRaw<any[]>`SELECT count(*)::int n FROM "MA_WorkOrder" WHERE "CompanyId" = ${B.legacyCompanyId} AND "IsDeleted" = 0 AND "WorkOrderDate" BETWEEN ${from} AND ${to}`.then((r) => r[0].n));
    assert.equal(total(await as(B, () => svc.dashboard.orderKpis(from, to))), ownB, "B's KPI = B's own Work Orders");
    assert.equal(total(await svc.dashboard.orderKpis(from, to)), 0, 'no legacy company: no legacy figures (and no error)');
  });
});

describe('fail closed', () => {
  test('without a company context, scoped legacy services refuse (403) instead of returning everything', async () => {
    assert.equal(await status(svc.workOrders.list()), '403');
    assert.equal(await status(svc.accounts.get(a.account)), '403');
    assert.equal(await status(svc.serials.listAll({})), '403');
  });
});
