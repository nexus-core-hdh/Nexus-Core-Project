import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RECEIPT_TYPES } from '../legacy-erp/receipt-types.config';
import { CONTRACT_TYPES } from '../legacy-erp/contract-types.config';
import { screenKeyFor as inventoryReceiptScreenKey } from '../legacy-erp/inventory-receipt.service';
import { screenKeyFor as orderScreenKey } from '../legacy-erp/purchase-order.service';
import { WORK_ORDER_SCREEN_KEY } from '../legacy-erp/work-order.service';

// Server-side resolution of the record a set of User Defined Field values belongs to — the
// ownership/permission side of GET/PUT custom-field-values. Nothing here is taken from the client
// except the entity key and the record id, and both are looked up: an unknown entity, a malformed
// id, a deleted record or one outside the caller's reach all resolve to null (reported as "not
// found", so a record's existence is never revealed to a caller who cannot access it).
//
// Each entry mirrors the owning screen's own rules exactly — no second permission model:
//  - permissionModule: the module the owning controller's writes require (its @PermissionModule;
//    receipts other than Purchase Receipt are written through the generic /receipts/:receiptType
//    controller, module "receipts"), checked as `<module>:update` for a value write.
//    Subcontract Orders are written through the generic /orders/:receiptType controller (module
//    "orders"); Purchase Orders through their own /purchase-orders controller.
//  - reach: the legacy ERP tables (IM_Receipt, FI_Receipt, IM_Item, IM_OrderReceipt, SM_Contract,
//    MA_WorkOrder) are not partitioned by Nexus company — their CompanyId is the migrated legacy
//    company, and the owning services read any live row — so reach is "the row exists, is live
//    and is of this screen's type". PLM cards
//    belong to a branch: the card's branch must be in the caller's company and, for a caller
//    assigned to a branch, be that branch (the same branch the PLM lists filter by).
// Tenant isolation of the VALUES themselves comes from the field definitions: a caller only ever
// reads or writes values of fields visible to their company/branch (custom-fields.service.ts).

export interface UdfActor { id: string; companyId: string; branchId?: string | null }

export interface ResolvedUdfRecord {
  entity: string;
  entityId: string;
  permissionModule: string;
  screenKey: string;
  documentNo: string | null;
}

type Resolver = (prisma: PrismaService, entityId: string, user: UdfActor) => Promise<ResolvedUdfRecord | null>;

const LEGACY_ID = /^[1-9]\d{0,17}$/;
const RECEIPT_TYPE_SET = new Set(RECEIPT_TYPES.map((t) => t.receiptType));
const CONTRACT_TYPE_SET = new Set(CONTRACT_TYPES.map((t) => t.receiptType));
const PURCHASE_RECEIPT = 2;
const FI_RECEIPT_TYPE = 1;
const YARN_ACCESS_CODE = 'YARN';
const PURCHASE_ORDER_TYPE = 1;
const SUBCONTRACT_ORDER_TYPE = 3;

/** ContractService.screenKeyFor — the contract screens' real MenuItem.href. */
const contractScreenKey = (receiptType: number) => `/dashboard/legacy-erp/contracts-list?receiptType=${receiptType}`;

/** Purchase Order and Subcontract Order share IM_OrderReceipt, told apart by ReceiptType. */
const orderResolver = (entity: string, receiptType: number, permissionModule: string): Resolver => async (prisma, entityId) => {
  if (!LEGACY_ID.test(entityId)) return null;
  const row = await legacyRow(prisma, Prisma.sql`
    SELECT "ReceiptNo" AS "receiptNo" FROM "IM_OrderReceipt"
    WHERE "RecId" = ${BigInt(entityId)} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}`);
  if (!row) return null;
  return { entity, entityId, permissionModule, screenKey: orderScreenKey(receiptType), documentNo: row.receiptNo ?? null };
};

const legacyRow = async (prisma: PrismaService, sql: Prisma.Sql) => {
  const rows = await prisma.$queryRaw<any[]>(sql);
  return rows[0] ?? null;
};

/** A PLM card's branch must be in the caller's company, and be the caller's own branch when they have one. */
const plmCardInReach = async (prisma: PrismaService, branchId: string, user: UdfActor) => {
  if (user.branchId && branchId !== user.branchId) return false;
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { companyId: true } });
  return !!branch && branch.companyId === user.companyId;
};

const RESOLVERS: Record<string, Resolver> = {
  InventoryReceipt: async (prisma, entityId) => {
    if (!LEGACY_ID.test(entityId)) return null;
    const row = await legacyRow(prisma, Prisma.sql`
      SELECT "ReceiptType" AS "receiptType", "ReceiptNo" AS "receiptNo" FROM "IM_Receipt"
      WHERE "RecId" = ${BigInt(entityId)} AND "IsDeleted" = 0`);
    const receiptType = row ? Number(row.receiptType) : NaN;
    if (!row || !RECEIPT_TYPE_SET.has(receiptType)) return null;
    return {
      entity: 'InventoryReceipt', entityId,
      permissionModule: receiptType === PURCHASE_RECEIPT ? 'inventory-receipts' : 'receipts',
      screenKey: inventoryReceiptScreenKey(receiptType),
      documentNo: row.receiptNo ?? null,
    };
  },
  FiReceipt: async (prisma, entityId) => {
    if (!LEGACY_ID.test(entityId)) return null;
    const row = await legacyRow(prisma, Prisma.sql`
      SELECT "ReceiptNo" AS "receiptNo" FROM "FI_Receipt"
      WHERE "RecId" = ${BigInt(entityId)} AND "IsDeleted" = 0 AND "ReceiptType" = ${FI_RECEIPT_TYPE}`);
    if (!row) return null;
    return {
      entity: 'FiReceipt', entityId, permissionModule: 'financial-receipts',
      screenKey: '/dashboard/legacy-erp/financial-receipt-master-data', documentNo: row.receiptNo ?? null,
    };
  },
  YarnCard: async (prisma, entityId) => {
    if (!LEGACY_ID.test(entityId)) return null;
    const row = await legacyRow(prisma, Prisma.sql`
      SELECT "InventoryCode" AS "code" FROM "IM_Item"
      WHERE "RecId" = ${BigInt(entityId)} AND "IsDeleted" = 0 AND "AccessCode" = ${YARN_ACCESS_CODE}`);
    if (!row) return null;
    return {
      entity: 'YarnCard', entityId, permissionModule: 'yarn-cards',
      screenKey: '/dashboard/legacy-erp/yarn-cards-list', documentNo: row.code ?? null,
    };
  },
  StyleCard: async (prisma, entityId, user) => {
    const card = await prisma.styleCard.findUnique({ where: { id: entityId }, select: { branchId: true, styleNumber: true } });
    if (!card || !(await plmCardInReach(prisma, card.branchId, user))) return null;
    return { entity: 'StyleCard', entityId, permissionModule: 'plm', screenKey: '/dashboard/plm/style-cards', documentNo: card.styleNumber };
  },
  SampleCard: async (prisma, entityId, user) => {
    const card = await prisma.sampleCard.findUnique({ where: { id: entityId }, select: { branchId: true, sampleNumber: true } });
    if (!card || !(await plmCardInReach(prisma, card.branchId, user))) return null;
    return { entity: 'SampleCard', entityId, permissionModule: 'plm', screenKey: '/dashboard/plm/sample-cards', documentNo: card.sampleNumber };
  },
  WorkOrder: async (prisma, entityId) => {
    if (!LEGACY_ID.test(entityId)) return null;
    const row = await legacyRow(prisma, Prisma.sql`
      SELECT "WorkOrderNo" AS "workOrderNo" FROM "MA_WorkOrder" WHERE "RecId" = ${BigInt(entityId)} AND "IsDeleted" = 0`);
    if (!row) return null;
    return { entity: 'WorkOrder', entityId, permissionModule: 'work-orders', screenKey: WORK_ORDER_SCREEN_KEY, documentNo: row.workOrderNo ?? null };
  },
  PurchaseOrder: orderResolver('PurchaseOrder', PURCHASE_ORDER_TYPE, 'purchase-orders'),
  SubcontractOrder: orderResolver('SubcontractOrder', SUBCONTRACT_ORDER_TYPE, 'orders'),
  // Purchase and Sale Contracts are one entity: the same SM_Contract table and screen.
  Contract: async (prisma, entityId) => {
    if (!LEGACY_ID.test(entityId)) return null;
    const row = await legacyRow(prisma, Prisma.sql`
      SELECT "ReceiptType" AS "receiptType", "ReceiptNo" AS "receiptNo" FROM "SM_Contract"
      WHERE "RecId" = ${BigInt(entityId)} AND "IsDeleted" = 0`);
    const receiptType = row ? Number(row.receiptType) : NaN;
    if (!row || !CONTRACT_TYPE_SET.has(receiptType)) return null;
    return { entity: 'Contract', entityId, permissionModule: 'contracts', screenKey: contractScreenKey(receiptType), documentNo: row.receiptNo ?? null };
  },
};

/** The record behind (entity, entityId) if it exists and is within the caller's reach, else null. */
export async function resolveUdfRecord(prisma: PrismaService, entity: unknown, entityId: unknown, user: UdfActor) {
  if (typeof entity !== 'string' || typeof entityId !== 'string' || !entityId || entityId.length > 64) return null;
  const resolve = Object.prototype.hasOwnProperty.call(RESOLVERS, entity) ? RESOLVERS[entity] : undefined;
  return resolve ? resolve(prisma, entityId, user) : null;
}
