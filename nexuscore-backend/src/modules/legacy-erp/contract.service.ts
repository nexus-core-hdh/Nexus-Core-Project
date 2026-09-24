import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { getContractTypeConfig } from './contract-types.config';
import { AuditService, AUDIT_ACTIONS, hasRealChanges, enrichDisplayRefs, FkResolver } from '../audit/audit.service';

// Purchase Contract / Sale Contract — built on the pre-existing SM_Contract/SM_ContractItem
// tables (see contract-types.config.ts's own comment for why these, not IM_PurchaseContract/
// SM_SalesContract). Same generic "one table, many types" shape as inventory-receipt.service.ts,
// parameterized by receiptType instead of hardcoded to one — there is no single "master" type
// here (unlike Purchase Receipt), both contract kinds are equally generic, so every method takes
// receiptType explicitly rather than defaulting to one.
const HEADER_TABLE = 'SM_Contract';
const ITEM_TABLE = 'SM_ContractItem';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source).
export const HEADER_COLUMNS = [
  'ReceiptNo', 'ReceiptType', 'ReceiptDate', 'DocumentNo',
  'CurrentAccountId', 'WarehouseId', 'ForexId', 'StartDate', 'EndDate',
  'SubTotal', 'VatAmount', 'GrandTotal',
] as const;

// Grid columns — Type(via InventoryId or ServiceCardId)/Quantity/Unit/Rate/Forex/VAT/Item Amount,
// same shape as purchase-order-line-grid.tsx's own column set, using only columns that actually
// exist on SM_ContractItem (no Color/Manufacturing Order FK exists on this table, so those two
// Purchase Order columns are not replicated here — nothing to map them to without inventing a
// relationship). WorkOrderReceiptItemId mirrors Purchase Order's own plain-numeric field.
const ITEM_COLUMNS = [
  'ItemOrderNo', 'ItemType', 'InventoryId', 'ServiceCardId', 'UnitId', 'Quantity', 'GrossQuantity',
  'UnitPrice', 'ForexId', 'ForexRate', 'ForexUnitPrice',
  'VatIncluded', 'VatRate', 'VatAmount', 'ItemTotal', 'NetItemTotal',
  'ReceivedQuantity', 'WorkOrderReceiptItemId',
  'DeliveryDate', 'Explanation', 'SpecialCode',
] as const;

const ITEM_TYPE_SERVICE = 2;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"ReceiptId" as "receiptId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterLookup: LegacyMasterLookupService,
    private readonly audit: AuditService,
  ) {}

  // Purchase Contract / Sale Contract share this service/table (SM_Contract), so — same as
  // purchase-order.service.ts's entityTypeFor() — Log Tracking must be able to tell them apart by
  // entityType. Derived from the existing contract-types.config label, never hardcoded per call.
  entityTypeFor(receiptType: number): string {
    const label = getContractTypeConfig(receiptType)?.label;
    return label ? label.replace(/\s+/g, '') : 'Contract';
  }

  // Real MenuItem.href for each contract screen ("00-Purchase Contract" / "Sale Contract") —
  // confirmed live to exist exactly in this ?receiptType=N form, so AuditService.resolveScreen()
  // resolves Module/Menu from the real menu tree instead of a hardcoded label.
  screenKeyFor(receiptType: number): string {
    return `/dashboard/legacy-erp/contracts-list?receiptType=${receiptType}`;
  }

  // Only fields whose target already has a registered LegacyMasterLookupService key are
  // enriched (current-account, warehouse, forex, inventory-item, service, unit) — same generic
  // enrichDisplayRefs()/FkResolver mechanism PO/IR/Work Order use, none invented.
  private displayResolvers(): Record<string, FkResolver> {
    const byKey = (key: string): FkResolver => (id) => this.masterLookup.getById(key, Number(id), { includeInactive: true });
    return {
      currentAccountId: byKey('current-account'),
      warehouseId: byKey('warehouse'),
      forexId: byKey('forex'),
      inventoryId: byKey('inventory-item'),
      serviceCardId: byKey('service'),
      unitId: byKey('unit'),
    };
  }

  // Full document snapshot (header + detail lines), FK-enriched, taken from the persisted rows.
  private async snapshotDocument(id: number, receiptType: number) {
    const label = this.entityTypeFor(receiptType);
    const resolvers = this.displayResolvers();
    const header = await this.get(id, receiptType).catch(() => null);
    const items = await this.listItems(id).catch(() => []);
    return {
      [`${label} (SM_Contract)`]: header ? await enrichDisplayRefs(header, resolvers) : null,
      [`${label} Details (SM_ContractItem)`]: await Promise.all((items as any[]).map((it) => enrichDisplayRefs(it, resolvers))),
    };
  }

  private async auditCreatedHeader(created: any, receiptType: number, currentUserId?: string, companyId?: string) {
    if (!currentUserId || !companyId) return;
    const label = this.entityTypeFor(receiptType);
    // Re-read via get() so the audited snapshot is exactly the persisted row, then FK-enrich it.
    const persisted = await this.get(created.id, receiptType).catch(() => created);
    const enriched = await enrichDisplayRefs(persisted, this.displayResolvers());
    await this.audit.recordSafe({
      userId: currentUserId, companyId, screenKey: this.screenKeyFor(receiptType),
      entityType: label, entityId: String(created.id), action: AUDIT_ACTIONS.CREATE,
      documentNo: created.receiptNo, after: { [`${label} (SM_Contract)`]: enriched },
    });
  }

  // Parent context for a line-level event — the owning contract's own number/entity, so Log
  // Tracking can link a line change back to its document without a second header event.
  private async lineAuditCtx(receiptId: number, receiptType: number) {
    const header = await this.get(receiptId, receiptType).catch(() => null);
    return { label: this.entityTypeFor(receiptType), screenKey: this.screenKeyFor(receiptType), parentDocumentNo: (header as any)?.receiptNo ?? null };
  }

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }

  async list(search: string | undefined, receiptType: number) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "SM_Contract"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
            AND ("ReceiptNo" ILIKE ${`%${search}%`} OR "DocumentNo" ILIKE ${`%${search}%`})
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "SM_Contract"
          WHERE "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
          ORDER BY "ReceiptNo" DESC LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number, receiptType: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "SM_Contract" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Contract not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByReceiptNo(receiptNo: string, receiptType: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "SM_Contract" WHERE "ReceiptNo" = ${receiptNo} AND "IsDeleted" = 0 AND "ReceiptType" = ${receiptType}
    `);
    if (!rows.length) throw new NotFoundException('Contract not found');
    return sanitizeRawRow(rows[0]);
  }

  async nextReceiptNo(receiptType: number, numberPrefix: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "ReceiptNo" as code FROM "SM_Contract"
      WHERE "ReceiptType" = ${receiptType} AND "ReceiptNo" ~ ${`^${numberPrefix}-[0-9]+$`}
      ORDER BY (regexp_replace("ReceiptNo", ${`^${numberPrefix}-`}, ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${numberPrefix}-${next}`;
  }

  private async assertReceiptNoAvailable(receiptNo: string, receiptType: number, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "SM_Contract"
      WHERE "ReceiptType" = ${receiptType} AND "IsDeleted" = 0 AND LOWER("ReceiptNo") = LOWER(${receiptNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('A contract already exists with this number.');
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, receiptType: number, numberPrefix: string, currentUserId?: string, companyId?: string) {
    const toDb = await this.headerToDb();
    const manualReceiptNo = String(dto.receiptNo ?? '').trim();

    if (manualReceiptNo) {
      await this.assertReceiptNoAvailable(manualReceiptNo, receiptType);
      const effective = { ...dto, receiptType, receiptNo: manualReceiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "SM_Contract" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        const created = sanitizeRawRow(rows[0]);
        await this.auditCreatedHeader(created, receiptType, currentUserId, companyId);
        return created;
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('23505') && msg.includes('ReceiptNo')) throw new ConflictException('A contract already exists with this number.');
        throw err;
      }
    }

    for (let attempt = 1; attempt <= ContractService.MAX_CODE_RETRIES; attempt++) {
      const receiptNo = await this.nextReceiptNo(receiptType, numberPrefix);
      const effective = { ...dto, receiptType, receiptNo };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "SM_Contract" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        const created = sanitizeRawRow(rows[0]);
        await this.auditCreatedHeader(created, receiptType, currentUserId, companyId);
        return created;
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('ReceiptNo');
        if (isCodeCollision && attempt < ContractService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Receipt No — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number, receiptType: number, currentUserId?: string, companyId?: string) {
    const before = await this.get(id, receiptType);
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => c !== 'ReceiptNo' && c !== 'ReceiptType' && toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id, receiptType);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "SM_Contract" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    const updated = sanitizeRawRow(rows[0]);
    // Only a real persisted change writes an Updated event (a no-op Save must never fabricate one).
    // Header-only: this endpoint never touches lines, so no Details section is snapshotted.
    if (currentUserId && companyId && hasRealChanges(before, updated)) {
      const label = this.entityTypeFor(receiptType);
      const resolvers = this.displayResolvers();
      const [enrichedBefore, enrichedAfter] = await Promise.all([enrichDisplayRefs(before, resolvers), enrichDisplayRefs(updated, resolvers)]);
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: this.screenKeyFor(receiptType),
        entityType: label, entityId: String(id), action: AUDIT_ACTIONS.UPDATE,
        documentNo: updated.receiptNo ?? before.receiptNo,
        before: { [`${label} (SM_Contract)`]: enrichedBefore }, after: { [`${label} (SM_Contract)`]: enrichedAfter },
      });
    }
    return updated;
  }

  async remove(id: number, userId: number, receiptType: number, currentUserId?: string, companyId?: string) {
    const header = await this.get(id, receiptType);
    // Last valid state (header + lines), captured BEFORE the soft-delete.
    const snapshot = currentUserId && companyId ? await this.snapshotDocument(id, receiptType) : null;
    await this.prisma.$executeRaw`
      UPDATE "SM_Contract" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    if (currentUserId && companyId && snapshot) {
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: this.screenKeyFor(receiptType),
        entityType: this.entityTypeFor(receiptType), entityId: String(id), action: AUDIT_ACTIONS.DELETE,
        documentNo: (header as any).receiptNo, before: snapshot,
      });
    }
    return { message: 'Deleted' };
  }

  // --- Detail lines (the grid) ------------------------------------------------------------

  async listItems(receiptId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "SM_ContractItem"
      WHERE "ReceiptId" = ${receiptId} AND "IsDeleted" = 0
      ORDER BY "ItemOrderNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async createItem(receiptId: number, dto: Record<string, any>, userId: number, receiptType: number, currentUserId?: string, companyId?: string) {
    if (Number(dto.itemType) === ITEM_TYPE_SERVICE) {
      if (!dto.serviceCardId) throw new BadRequestException('A service is required');
    } else if (!dto.inventoryId) {
      throw new BadRequestException('An inventory item is required');
    }
    const toDb = await this.itemToDb();
    const effective = { ...dto, receiptType };
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"ReceiptId"', '"ReceiptType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "SM_ContractItem" (${colList})
      VALUES (${receiptId}, ${receiptType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ITEM_SELECT}
    `);
    const created = sanitizeRawRow(rows[0]);
    if (currentUserId && companyId) {
      const ctx = await this.lineAuditCtx(receiptId, receiptType);
      const enriched = await enrichDisplayRefs(created, this.displayResolvers());
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: ctx.screenKey,
        entityType: `${ctx.label}Item`, entityId: String(created.id), action: AUDIT_ACTIONS.CREATE,
        parentEntityType: ctx.label, parentEntityId: String(receiptId), parentDocumentNo: ctx.parentDocumentNo,
        after: { [`${ctx.label} Line (SM_ContractItem)`]: enriched },
      });
    }
    return created;
  }

  async updateItem(itemId: number, dto: Record<string, any>, userId: number, receiptType: number, currentUserId?: string, companyId?: string) {
    const toDb = await this.itemToDb();
    const beforeRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "SM_ContractItem" WHERE "RecId" = ${itemId} AND "IsDeleted" = 0`);
    if (!beforeRows.length) throw new NotFoundException('Line not found');
    const before = sanitizeRawRow(beforeRows[0]);
    const cols = ITEM_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    let updated = before;
    if (cols.length) {
      const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        UPDATE "SM_ContractItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
        WHERE "RecId" = ${itemId} AND "IsDeleted" = 0
        RETURNING ${ITEM_SELECT}
      `);
      if (!rows.length) throw new NotFoundException('Line not found');
      updated = sanitizeRawRow(rows[0]);
    }
    if (currentUserId && companyId && hasRealChanges(before, updated)) {
      const ctx = await this.lineAuditCtx(updated.receiptId, receiptType);
      const resolvers = this.displayResolvers();
      const [enrichedBefore, enrichedAfter] = await Promise.all([enrichDisplayRefs(before, resolvers), enrichDisplayRefs(updated, resolvers)]);
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: ctx.screenKey,
        entityType: `${ctx.label}Item`, entityId: String(itemId), action: AUDIT_ACTIONS.UPDATE,
        parentEntityType: ctx.label, parentEntityId: String(updated.receiptId), parentDocumentNo: ctx.parentDocumentNo,
        before: { [`${ctx.label} Line (SM_ContractItem)`]: enrichedBefore }, after: { [`${ctx.label} Line (SM_ContractItem)`]: enrichedAfter },
      });
    }
    return updated;
  }

  async removeItem(itemId: number, userId: number, receiptType: number, currentUserId?: string, companyId?: string) {
    const beforeRows = currentUserId && companyId
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${ITEM_SELECT} FROM "SM_ContractItem" WHERE "RecId" = ${itemId} AND "IsDeleted" = 0`)
      : [];
    const result = await this.prisma.$executeRaw`
      UPDATE "SM_ContractItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${itemId}
    `;
    if (!result) throw new NotFoundException('Line not found');
    if (currentUserId && companyId && beforeRows.length) {
      const before = sanitizeRawRow(beforeRows[0]);
      const ctx = await this.lineAuditCtx(before.receiptId, receiptType);
      const enriched = await enrichDisplayRefs(before, this.displayResolvers());
      await this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: ctx.screenKey,
        entityType: `${ctx.label}Item`, entityId: String(itemId), action: AUDIT_ACTIONS.DELETE,
        parentEntityType: ctx.label, parentEntityId: String(before.receiptId), parentDocumentNo: ctx.parentDocumentNo,
        before: { [`${ctx.label} Line (SM_ContractItem)`]: enriched },
      });
    }
    return { message: 'Deleted' };
  }
}
