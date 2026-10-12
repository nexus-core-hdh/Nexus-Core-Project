// Shared world for the UDF suite — built in the throwaway test database only (test-db.ts).
import { useTestDatabase, assertSafeTestDatabase } from './test-db';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { CustomFieldsService } from '../../src/modules/entities/custom-fields.service';
import { EntitiesService } from '../../src/modules/entities/entities.service';
import { StyleExtrasService } from '../../src/modules/style-extras/style-extras.service';

useTestDatabase();

export interface Actor { id: string; companyId: string; branchId: string | null }

export interface World {
  prisma: PrismaService;
  svc: CustomFieldsService;
  entities: EntitiesService;
  /** The real Style/Sample Card BOM save (unit lookups stubbed: the suite's lines carry no Fabric/Trim Card). */
  styleExtras: StyleExtrasService;
  users: {
    adminA1: Actor; adminA2: Actor; adminB1: Actor;
    /** Company A, branch A1, no permissions at all. */
    noPermsA1: Actor;
    /** Company A, branch A1, only the old crm:update the value route used to require. */
    crmOnlyA1: Actor;
    /** Company A, branch A1, inventory-receipts:update only (Purchase Receipt writes). */
    purchaseReceiptsOnlyA1: Actor;
    /** Company A, no branch. */
    adminANoBranch: Actor;
    /** Company A, branch A1, purchase-orders:update only (not "orders", which Subcontract Orders need). */
    purchaseOrdersOnlyA1: Actor;
  };
  records: {
    purchaseReceipt: string; purchaseReturn: string; deletedReceipt: string; unknownTypeReceipt: string;
    fiReceipt: string; yarnCard: string; nonYarnItem: string;
    styleCardA1: string; styleCardA2: string; styleCardB1: string; sampleCardA1: string;
    workOrder: string; deletedWorkOrder: string;
    purchaseOrder: string; purchaseOrder2: string; subcontractOrder: string; otherTypeOrder: string;
    purchaseContract: string; saleContract: string; unknownTypeContract: string;
  };
  /** Live (and one soft-deleted) line rows of the documents above, per logical grid. */
  lines: {
    po: string[]; po2: string[]; poDeleted: string; so: string[];
    contract: string[]; irPurchase: string[]; fi: string[];
  };
}

const MODULE_UPDATES = ['inventory-receipts', 'receipts', 'financial-receipts', 'yarn-cards', 'plm', 'work-orders', 'purchase-orders', 'orders', 'contracts'];
const SETTINGS = ['create', 'update', 'delete'];

export async function createWorld(): Promise<World> {
  const prisma = new PrismaService();
  await prisma.$connect();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);

  await resetDatabase(prisma);
  const tag = Date.now().toString(36);

  const companyA = await prisma.company.create({ data: { name: `UDF Test A ${tag}` } });
  const companyB = await prisma.company.create({ data: { name: `UDF Test B ${tag}` } });
  const a1 = await prisma.branch.create({ data: { name: 'A1', companyId: companyA.id } });
  const a2 = await prisma.branch.create({ data: { name: 'A2', companyId: companyA.id } });
  const b1 = await prisma.branch.create({ data: { name: 'B1', companyId: companyB.id } });

  const perm = async (module: string, action: string) =>
    prisma.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {} });
  const role = async (name: string, perms: [string, string][]) => {
    const r = await prisma.role.create({ data: { name: `${name} ${tag}` } });
    for (const [m, a] of perms) {
      const p = await perm(m, a);
      await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: p.id } });
    }
    return r;
  };
  const adminRole = await role('UDF Admin', [...SETTINGS.map((a) => ['settings', a] as [string, string]), ...MODULE_UPDATES.map((m) => [m, 'update'] as [string, string])]);
  const crmRole = await role('CRM only', [['crm', 'update']]);
  const prRole = await role('Purchase receipts only', [['inventory-receipts', 'update']]);
  const poRole = await role('Purchase orders only', [['purchase-orders', 'update']]);

  let n = 0;
  const user = async (companyId: string, branchId: string | null, roleId?: string): Promise<Actor> => {
    const u = await prisma.user.create({
      data: { companyId, branchId, name: `udf-user-${n}`, email: `udf-${tag}-${n++}@test.invalid`, password: 'x' },
    });
    if (roleId) await prisma.userRole.create({ data: { userId: u.id, roleId } });
    return { id: u.id, companyId, branchId };
  };

  const users = {
    adminA1: await user(companyA.id, a1.id, adminRole.id),
    adminA2: await user(companyA.id, a2.id, adminRole.id),
    adminB1: await user(companyB.id, b1.id, adminRole.id),
    noPermsA1: await user(companyA.id, a1.id),
    crmOnlyA1: await user(companyA.id, a1.id, crmRole.id),
    purchaseReceiptsOnlyA1: await user(companyA.id, a1.id, prRole.id),
    adminANoBranch: await user(companyA.id, null, adminRole.id),
    purchaseOrdersOnlyA1: await user(companyA.id, a1.id, poRole.id),
  };

  const legacy = async (sql: string) => String((await prisma.$queryRawUnsafe<{ id: bigint }[]>(sql))[0].id);
  const sampleType = await prisma.styleSampleType.create({ data: { name: 'Proto', code: `PT-${tag}` } });
  const styleCard = async (branchId: string, i: number) =>
    (await prisma.styleCard.create({ data: { styleNumber: `UDF-ST-${tag}-${i}`, title: 'UDF test style', branchId, createdBy: users.adminA1.id } })).id;

  const records = {
    purchaseReceipt: await legacy(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo") VALUES (2,'IR-1') RETURNING "RecId" AS id`),
    purchaseReturn: await legacy(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo") VALUES (122,'PRN-1') RETURNING "RecId" AS id`),
    deletedReceipt: await legacy(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo","IsDeleted") VALUES (2,'IR-DEL',1) RETURNING "RecId" AS id`),
    unknownTypeReceipt: await legacy(`INSERT INTO "IM_Receipt" ("ReceiptType","ReceiptNo") VALUES (9,'X-1') RETURNING "RecId" AS id`),
    fiReceipt: await legacy(`INSERT INTO "FI_Receipt" ("ReceiptType","ReceiptNo") VALUES (1,'FR-1') RETURNING "RecId" AS id`),
    yarnCard: await legacy(`INSERT INTO "IM_Item" ("AccessCode","InventoryCode") VALUES ('YARN','YARN-1') RETURNING "RecId" AS id`),
    nonYarnItem: await legacy(`INSERT INTO "IM_Item" ("AccessCode","InventoryCode") VALUES ('FABRIC','FAB-1') RETURNING "RecId" AS id`),
    styleCardA1: await styleCard(a1.id, 1),
    styleCardA2: await styleCard(a2.id, 2),
    styleCardB1: await styleCard(b1.id, 3),
    sampleCardA1: (await prisma.sampleCard.create({
      data: { sampleNumber: `UDF-SC-${tag}`, sampleTypeId: sampleType.id, title: 'UDF test sample', branchId: a1.id, createdBy: users.adminA1.id },
    })).id,
  };

  Object.assign(records, {
    workOrder: await legacy(`INSERT INTO "MA_WorkOrder" ("WorkOrderNo","Quantity") VALUES ('WO-1',100) RETURNING "RecId" AS id`),
    deletedWorkOrder: await legacy(`INSERT INTO "MA_WorkOrder" ("WorkOrderNo","IsDeleted") VALUES ('WO-DEL',1) RETURNING "RecId" AS id`),
    purchaseOrder: await legacy(`INSERT INTO "IM_OrderReceipt" ("ReceiptType","ReceiptNo") VALUES (1,'PO-1') RETURNING "RecId" AS id`),
    purchaseOrder2: await legacy(`INSERT INTO "IM_OrderReceipt" ("ReceiptType","ReceiptNo") VALUES (1,'PO-2') RETURNING "RecId" AS id`),
    subcontractOrder: await legacy(`INSERT INTO "IM_OrderReceipt" ("ReceiptType","ReceiptNo") VALUES (3,'SC-1') RETURNING "RecId" AS id`),
    otherTypeOrder: await legacy(`INSERT INTO "IM_OrderReceipt" ("ReceiptType","ReceiptNo") VALUES (2,'X-1') RETURNING "RecId" AS id`),
    purchaseContract: await legacy(`INSERT INTO "SM_Contract" ("ReceiptType","ReceiptNo") VALUES (1,'PC-1') RETURNING "RecId" AS id`),
    saleContract: await legacy(`INSERT INTO "SM_Contract" ("ReceiptType","ReceiptNo") VALUES (2,'SLC-1') RETURNING "RecId" AS id`),
    unknownTypeContract: await legacy(`INSERT INTO "SM_Contract" ("ReceiptType","ReceiptNo") VALUES (9,'C-9') RETURNING "RecId" AS id`),
  });
  const r = records as World['records'];
  const lineRows = async (table: string, parentColumn: string, parentId: string, n: number, deleted = 0) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(await legacy(`INSERT INTO "${table}" ("${parentColumn}","IsDeleted") VALUES (${parentId},${deleted}) RETURNING "RecId" AS id`));
    return ids;
  };
  const lines = {
    po: await lineRows('IM_OrderReceiptItem', 'OrderReceiptId', r.purchaseOrder, 3),
    po2: await lineRows('IM_OrderReceiptItem', 'OrderReceiptId', r.purchaseOrder2, 1),
    poDeleted: (await lineRows('IM_OrderReceiptItem', 'OrderReceiptId', r.purchaseOrder, 1, 1))[0],
    so: await lineRows('IM_OrderReceiptItem', 'OrderReceiptId', r.subcontractOrder, 2),
    contract: await lineRows('SM_ContractItem', 'ReceiptId', r.purchaseContract, 2),
    irPurchase: await lineRows('IM_ReceiptItem', 'InventoryReceiptId', r.purchaseReceipt, 2),
    fi: await lineRows('FI_ReceiptItem', 'CurrentAccountReceiptId', r.fiReceipt, 2),
  };

  const audit = new AuditService(prisma);
  const styleExtras = new StyleExtrasService(prisma, {} as any);
  return { prisma, svc: new CustomFieldsService(prisma, audit), entities: new EntitiesService(prisma), styleExtras, users, records: r, lines };
}

/** Empties the tables this suite writes — test database only (checked again here). */
export async function resetDatabase(prisma: PrismaService) {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  await prisma.customFieldValue.deleteMany();
  await prisma.customField.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.styleBomLine.deleteMany();
  await prisma.sampleBomLine.deleteMany();
  await prisma.colorCard.deleteMany();
  await prisma.sampleCard.deleteMany();
  await prisma.styleCard.deleteMany();
  await prisma.styleSampleType.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.company.deleteMany();
  for (const t of ['IM_Receipt', 'FI_Receipt', 'IM_Item', 'MA_WorkOrder', 'IM_OrderReceipt', 'SM_Contract', 'IM_ReceiptItem', 'IM_OrderReceiptItem', 'SM_ContractItem', 'FI_ReceiptItem']) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
  }
}

/** A field definition payload as Administration > User Defined Fields sends it. */
export const fieldDto = (entity: string, code: string, controlType: string, extra: Record<string, unknown> = {}) => ({
  entity, code, name: code.replace(/^UD_/, ''), controlType, scope: 'company', ...extra,
});

export const dropdownOptions = (...labels: string[]) => labels.map((label, i) => ({ code: String(i + 1).padStart(2, '0'), label, isActive: true }));

export async function expectHttpError(promise: Promise<unknown>, status: number, message?: RegExp) {
  try {
    await promise;
  } catch (e: any) {
    const actual = typeof e?.getStatus === 'function' ? e.getStatus() : undefined;
    if (actual !== status) throw new Error(`Expected HTTP ${status}, got ${actual ?? 'non-HTTP error'}: ${e?.message}`);
    if (message && !message.test(String(e?.message))) throw new Error(`Error message "${e?.message}" does not match ${message}`);
    return e;
  }
  throw new Error(`Expected HTTP ${status}, but the call succeeded`);
}
