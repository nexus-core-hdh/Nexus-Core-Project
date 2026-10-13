import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListPaging, runLegacyList } from './list-paging.util';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { nextLegacySeqCode, previewLegacySeqCode } from './legacy-code-sequence.util';
import { CuttingCardService } from './cutting-card.service';
import { WorkOrderService } from './work-order.service';
import {
  PackingLineInput, isShippedPackingList, packingTotals, parseVariantKey, sizeSummary, variantKey,
} from './packing-list.calc';

// Packing List — the legacy IM_PackagingList (header) / IM_PackagingListItem (box-range lines)
// tables, read and written with the same raw-SQL conventions as every other legacy-erp service
// (trim-card.service.ts: column whitelist + type coercion + sanitizeRawRow + soft delete). The
// per-size packed quantities live in the additive PackingListItemSize table, keyed by the Work
// Order's own "Color‖Size" variant key (Size Strategy D) — IM_PackagingListItemVariant and its
// InventoryVariantId are deliberately not used (the legacy variant master is empty).
//
// Sizes are never decided here: they are the selected Work Order's own, resolved by
// CuttingCardService (resolveSizes via getColorMatrix — saved Manufacturing Quantity sizes in
// Order sequence, else the Style Card's sizes). Order / Will Be Cut / Cut come from the same
// service, and every Packing List formula is in packing-list.calc.ts.

const HEADER_TABLE = 'IM_PackagingList';
const ITEM_TABLE = 'IM_PackagingListItem';
const CODE_ENTITY = 'IM_PackagingList';
const CODE_PREFIX = 'PL';
const CODE_PAD = 5;

// Exported for worklist-fields.service.ts (Customize Worklist field metadata).
export const HEADER_COLUMNS = [
  'PackagingNo', 'PackagingDate', 'ShipmentDate', 'DocumentNo', 'SpecialCode', 'Explanation',
  'WorkOrderId', 'CurrentAccountId', 'FactoryId', 'InventoryReceiptId', 'CustomerOrderNo',
  'StyleWeight', 'PackagingWeight', 'Dimension', 'IsApproved', 'ApprovedAt', 'ApprovedBy',
] as const;
/** Header columns a client may write (number and approval are server-controlled). */
const WRITABLE_HEADER = HEADER_COLUMNS.filter((c) => !['PackagingNo', 'IsApproved', 'ApprovedAt', 'ApprovedBy'].includes(c));
const ITEM_COLUMNS = ['StartPackaging', 'EndPackaging', 'WorkOrderId', 'WorkOrderItemId', 'StyleWeight', 'PackagingWeight', 'Dimension', 'Explanation', 'SpecialCode'] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['h."RecId" as id', ...HEADER_COLUMNS.map((c) => `h."${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
// Display labels joined onto the header: Work Order no, customer, factory, shipment receipt no.
const HEADER_JOINS = Prisma.sql`
  LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = h."WorkOrderId"
  LEFT JOIN "FI_Account" cu ON cu."RecId" = h."CurrentAccountId"
  LEFT JOIN "FI_Account" fa ON fa."RecId" = h."FactoryId"
  LEFT JOIN "IM_Receipt" rc ON rc."RecId" = h."InventoryReceiptId"`;
const HEADER_LABELS = Prisma.sql`
  wo."WorkOrderNo" as "workOrderNo",
  cu."CurrentAccountCode" as "customerCode", cu."CurrentAccountName" as "customerName",
  cu."CurrentAccountName" as "currentAccountName",
  fa."CurrentAccountCode" as "factoryCode", fa."CurrentAccountName" as "factoryName",
  rc."ReceiptNo" as "shipmentReceiptNo", rc."ReceiptType" as "shipmentReceiptType"`;

export interface PackingLineDto {
  id?: number | null;
  startBox: unknown;
  endBox: unknown;
  color: string;
  styleWeight?: unknown;
  packageWeight?: unknown;
  dimension?: string | null;
  explanation?: string | null;
  /** Quantity in one box, per size code. */
  quantities: Record<string, unknown>;
}

@Injectable()
export class PackingListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cuttingCards: CuttingCardService,
    private readonly workOrders: WorkOrderService,
  ) {}

  private async headerToDb() { return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE)); }
  private async itemToDb() { return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE)); }

  // ── Header ────────────────────────────────────────────────────────────────────────────────

  async list(search?: string, paging: ListPaging | null = null) {
    const like = search ? `%${search}%` : null;
    const searchFilter = like
      ? Prisma.sql`AND (h."PackagingNo" ILIKE ${like} OR wo."WorkOrderNo" ILIKE ${like} OR cu."CurrentAccountName" ILIKE ${like} OR h."CustomerOrderNo" ILIKE ${like})`
      : Prisma.sql``;
    return runLegacyList(this.prisma, {
      select: Prisma.sql`${HEADER_SELECT}, ${HEADER_LABELS}`,
      from: Prisma.sql`FROM "IM_PackagingList" h ${HEADER_JOINS} WHERE h."IsDeleted" = 0 ${searchFilter}`,
      sortable: {
        packagingNo: Prisma.sql`h."PackagingNo"`, packagingDate: Prisma.sql`h."PackagingDate"`,
        workOrderNo: Prisma.sql`wo."WorkOrderNo"`, customerName: Prisma.sql`cu."CurrentAccountName"`,
        shipmentDate: Prisma.sql`h."ShipmentDate"`,
      },
      defaultSortBy: 'packagingNo', defaultSortDir: 'desc', tiebreak: Prisma.sql`h."RecId"`, legacyLimit: 50,
    }, paging, sanitizeRawRow);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT}, ${HEADER_LABELS} FROM "IM_PackagingList" h ${HEADER_JOINS}
      WHERE h."RecId" = ${id} AND h."IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Packing list not found');
    const row = sanitizeRawRow(rows[0]);
    return { ...row, isApproved: !!row.isApproved };
  }

  async previewNextCode(): Promise<string> {
    return previewLegacySeqCode(this.prisma, CODE_ENTITY, CODE_PREFIX, HEADER_TABLE, 'PackagingNo', CODE_PAD);
  }

  /** A Packing List is always for exactly one existing Work Order. */
  private async requireWorkOrder(workOrderId: unknown) {
    const id = Number(workOrderId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('A Work Order is required');
    try {
      return await this.workOrders.get(id);
    } catch {
      throw new BadRequestException(`Work Order ${id} does not exist`);
    }
  }

  /** Customer / Factory (FI_Account) and Shipment (IM_Receipt) must exist when given — the legacy
   *  FKs would otherwise reject the write with a database error instead of a clear message. */
  private async assertReferences(dto: Record<string, any>) {
    const checks: [unknown, string, string][] = [
      [dto.currentAccountId, 'FI_Account', 'Customer'],
      [dto.factoryId, 'FI_Account', 'Factory'],
      [dto.inventoryReceiptId, 'IM_Receipt', 'Shipment receipt'],
    ];
    for (const [value, table, label] of checks) {
      if (value === undefined || value === null || value === '') continue;
      const id = Number(value);
      const found = Number.isInteger(id) && id > 0
        ? await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE "RecId" = ${id} AND COALESCE("IsDeleted", 0) = 0`)
        : [];
      if (!found.length) throw new BadRequestException(`${label} ${value} does not exist`);
    }
  }

  private assertEditable(header: { isApproved?: boolean }) {
    if (header.isApproved) throw new ConflictException('Packing list is approved — unapprove it before changing it');
  }

  async create(dto: Record<string, any>, userId: number) {
    const wo: any = await this.requireWorkOrder(dto.workOrderId);
    // Customer / Factory / Customer Order No default from the Work Order when not given.
    const effective: Record<string, any> = {
      currentAccountId: wo.currentAccountId ?? undefined,
      factoryId: wo.factoryId ?? undefined,
      customerOrderNo: wo.customerOrderNo ?? undefined,
      ...dto,
    };
    await this.assertReferences(effective);
    effective.packagingNo = await nextLegacySeqCode(this.prisma, CODE_ENTITY, CODE_PREFIX, HEADER_TABLE, 'PackagingNo', CODE_PAD);
    effective.isApproved = 0;
    const toDb = await this.headerToDb();
    const cols = [...WRITABLE_HEADER, 'PackagingNo', 'IsApproved'].filter((c) => toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_PackagingList" (${colList})
      VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id
    `);
    return this.get(Number(rows[0].id));
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    const current = await this.get(id);
    this.assertEditable(current);
    if (dto.workOrderId !== undefined && Number(dto.workOrderId) !== Number(current.workOrderId)) {
      await this.requireWorkOrder(dto.workOrderId);
    }
    await this.assertReferences(dto);
    const toDb = await this.headerToDb();
    const cols = WRITABLE_HEADER.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return current;
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "IM_PackagingList" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId} WHERE "RecId" = ${id}
    `);
    return this.get(id);
  }

  async remove(id: number, userId: number) {
    const current = await this.get(id);
    this.assertEditable(current);
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE "IM_PackagingListItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "PackagingListId" = ${id} AND "IsDeleted" = 0`,
      this.prisma.$executeRaw`UPDATE "IM_PackagingList" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}`,
    ]);
    return { message: 'Deleted' };
  }

  /** Approval uses the legacy header's own IsApproved / ApprovedAt / ApprovedBy fields. */
  async setApproved(id: number, approved: boolean, userId: number) {
    const current = await this.get(id);
    if (approved) {
      const lines = await this.listLineRows(id);
      if (!lines.length) throw new BadRequestException('Add at least one line before approving');
    }
    if (current.isApproved === approved) return current;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "IM_PackagingList"
      SET "IsApproved" = ${approved ? 1 : 0}, "ApprovedAt" = ${approved ? new Date() : null}, "ApprovedBy" = ${approved ? userId : null},
          "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
    `);
    return this.get(id);
  }

  // ── Work Order context (sizes / colors / order line) ──────────────────────────────────────

  /** Everything a Packing List needs from its Work Order — sizes in Order sequence, colors, the
   *  Order Line, and the header defaults. Sizes come only from CuttingCardService. */
  async workOrderContext(workOrderId: number) {
    const wo: any = await this.requireWorkOrder(workOrderId);
    const [matrix, items] = await Promise.all([
      this.cuttingCards.getColorMatrix(Number(wo.id ?? workOrderId)),
      this.workOrders.listItems(Number(workOrderId)),
    ]);
    const primary: any = items[0] ?? null;
    return {
      workOrder: {
        id: Number(workOrderId), workOrderNo: wo.workOrderNo ?? null, customerOrderNo: wo.customerOrderNo ?? null,
        currentAccountId: wo.currentAccountId ?? null, factoryId: wo.factoryId ?? null, styleCardId: wo.styleCardId ?? null,
      },
      orderLine: primary ? { id: Number(primary.id), itemOrderNo: primary.itemOrderNo ?? null, customerOrderNo: primary.customerOrderNo ?? null } : null,
      sizes: matrix.sizes,
      colors: matrix.colors.map((c: any) => c.color),
      extraCuttingPercent: matrix.extraCuttingPercent,
    };
  }

  // ── Lines + dynamic sizes ─────────────────────────────────────────────────────────────────

  private listLineRows(packingListId: number) {
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "IM_PackagingListItem"
      WHERE "PackagingListId" = ${packingListId} AND "IsDeleted" = 0 ORDER BY "StartPackaging", "RecId"
    `).then(sanitizeRawRow);
  }

  private async sizeRowsFor(lineIds: number[]) {
    if (!lineIds.length) return [] as { packingListItemId: number; variantKey: string; quantity: number }[];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "packingListItemId", "variantKey", "quantity" FROM "PackingListItemSize"
      WHERE "packingListItemId" IN (${Prisma.join(lineIds)}) ORDER BY "id"
    `);
    return sanitizeRawRow(rows) as { packingListItemId: number; variantKey: string; quantity: number }[];
  }

  /** Lines with their per-size quantities, bound by variant key. `otherQuantities` carries any
   *  stored non-zero quantity whose size is not (or no longer) one of the Work Order's sizes, so
   *  it is surfaced instead of silently hidden. */
  async getLines(packingListId: number) {
    const header = await this.get(packingListId);
    const sizes: string[] = header.workOrderId ? (await this.workOrderContext(header.workOrderId)).sizes : [];
    const lines = await this.listLineRows(packingListId);
    const sizeRows = await this.sizeRowsFor(lines.map((l: any) => Number(l.id)));
    const sizeSet = new Set(sizes);
    return {
      sizes,
      lines: lines.map((l: any) => {
        const quantities: Record<string, number> = Object.fromEntries(sizes.map((s) => [s, 0]));
        const otherQuantities: Record<string, number> = {};
        let color = '';
        for (const r of sizeRows.filter((x) => x.packingListItemId === Number(l.id))) {
          const parsed = parseVariantKey(r.variantKey);
          if (!parsed) continue;
          color ||= parsed.color;
          if (sizeSet.has(parsed.size)) quantities[parsed.size] = Number(r.quantity);
          else if (Number(r.quantity)) otherQuantities[r.variantKey] = Number(r.quantity);
        }
        return {
          id: Number(l.id), startBox: l.startPackaging, endBox: l.endPackaging, workOrderItemId: l.workOrderItemId,
          styleWeight: l.styleWeight, packageWeight: l.packagingWeight, dimension: l.dimension, explanation: l.explanation,
          color, quantities, otherQuantities,
        };
      }),
    };
  }

  /** Validates one line against the Work Order's sizes/colors and returns its variant-key map. */
  private validateLine(line: PackingLineDto, index: number, sizes: string[], colors: string[]) {
    const where = `Line ${index + 1}`;
    const start = Number(line.startBox);
    const end = Number(line.endBox);
    if (!Number.isInteger(start) || start < 1) throw new BadRequestException(`${where}: From (Box) must be a whole number of at least 1`);
    if (!Number.isInteger(end) || end < start) throw new BadRequestException(`${where}: To (Box) must be a whole number not below From (Box)`);
    const color = String(line.color ?? '').trim();
    if (!color) throw new BadRequestException(`${where}: Color is required`);
    if (colors.length && !colors.some((c) => c.toLowerCase() === color.toLowerCase())) {
      throw new BadRequestException(`${where}: Color "${color}" is not on this Work Order`);
    }
    const canonicalColor = colors.find((c) => c.toLowerCase() === color.toLowerCase()) ?? color;
    for (const field of ['styleWeight', 'packageWeight'] as const) {
      const v = line[field];
      if (v !== undefined && v !== null && v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
        throw new BadRequestException(`${where}: ${field === 'styleWeight' ? 'Style Weight' : 'Package Weight'} must be a non-negative number`);
      }
    }
    const byKey = new Map<string, number>();
    for (const [size, raw] of Object.entries(line.quantities ?? {})) {
      if (!sizes.includes(size)) throw new BadRequestException(`${where}: Size "${size}" is not one of this Work Order's sizes`);
      const q = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
      if (!Number.isFinite(q) || q < 0) throw new BadRequestException(`${where}: quantity for size ${size} must be a non-negative number`);
      const key = variantKey(canonicalColor, size);
      if (byKey.has(key)) throw new BadRequestException(`${where}: size ${size} appears twice`);
      byKey.set(key, q);
    }
    return { start, end, byKey };
  }

  /** Replaces the line set: updates kept lines, inserts new ones, soft-deletes removed ones, and
   *  upserts each line's per-size quantities by variant key (a stored key the payload no longer
   *  carries for that line is set to 0, never deleted). One transaction. */
  async saveLines(packingListId: number, lines: PackingLineDto[], userId: number) {
    if (!Array.isArray(lines)) throw new BadRequestException('lines must be an array');
    const header = await this.get(packingListId);
    this.assertEditable(header);
    if (!header.workOrderId) throw new BadRequestException('Select a Work Order before adding lines');
    const ctx = await this.workOrderContext(header.workOrderId);
    const validated = lines.map((l, i) => ({ line: l, ...this.validateLine(l, i, ctx.sizes, ctx.colors) }));

    const existing = await this.listLineRows(packingListId);
    const existingIds = new Set(existing.map((l: any) => Number(l.id)));
    for (const v of validated) {
      if (v.line.id != null && !existingIds.has(Number(v.line.id))) throw new BadRequestException(`Line ${v.line.id} does not belong to this packing list`);
    }
    const keptIds = new Set(validated.filter((v) => v.line.id != null).map((v) => Number(v.line.id)));
    const toDb = await this.itemToDb();
    const itemValues = (v: (typeof validated)[number]) => ({
      startPackaging: v.start, endPackaging: v.end, workOrderId: header.workOrderId, workOrderItemId: ctx.orderLine?.id ?? null,
      styleWeight: v.line.styleWeight ?? null, packagingWeight: v.line.packageWeight ?? null,
      dimension: v.line.dimension ?? null, explanation: v.line.explanation ?? null,
    });

    await this.prisma.$transaction(async (tx) => {
      for (const id of existingIds) {
        if (!keptIds.has(id)) {
          await tx.$executeRaw`UPDATE "IM_PackagingListItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}`;
        }
      }
      for (const v of validated) {
        const values = itemValues(v);
        const cols = ITEM_COLUMNS.filter((c) => toDb(c, (values as any)[camel(c)]) !== undefined);
        let lineId: number;
        if (v.line.id != null) {
          lineId = Number(v.line.id);
          const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, (values as any)[camel(c)])}`));
          await tx.$executeRaw(Prisma.sql`UPDATE "IM_PackagingListItem" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId} WHERE "RecId" = ${lineId}`);
        } else {
          const colList = Prisma.raw(['"PackagingListId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
          const rows = await tx.$queryRaw<any[]>(Prisma.sql`
            INSERT INTO "IM_PackagingListItem" (${colList})
            VALUES (${packingListId}, ${Prisma.join(cols.map((c) => toDb(c, (values as any)[camel(c)])))}, now(), ${userId}, 0, gen_random_uuid())
            RETURNING "RecId" as id
          `);
          lineId = Number(rows[0].id);
        }
        for (const [key, quantity] of v.byKey) {
          await tx.$executeRaw`
            INSERT INTO "PackingListItemSize" ("packingListItemId", "variantKey", "quantity", "createdBy", "updatedBy")
            VALUES (${lineId}, ${key}, ${quantity}, ${userId}, ${userId})
            ON CONFLICT ("packingListItemId", "variantKey")
            DO UPDATE SET "quantity" = EXCLUDED."quantity", "updatedAt" = now(), "updatedBy" = EXCLUDED."updatedBy"
          `;
        }
        const keys = Array.from(v.byKey.keys());
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PackingListItemSize" SET "quantity" = 0, "updatedAt" = now(), "updatedBy" = ${userId}
          WHERE "packingListItemId" = ${lineId} AND "quantity" <> 0
          ${keys.length ? Prisma.sql`AND "variantKey" NOT IN (${Prisma.join(keys)})` : Prisma.empty}
        `);
      }
    });
    return this.getLines(packingListId);
  }

  // ── Summary ───────────────────────────────────────────────────────────────────────────────

  /** Order / Will Be Cut / Cut / Packed / Shipment per size (the Work Order's own sizes — the
   *  same array the grid uses) plus the weight totals. Formulas: packing-list.calc.ts. */
  async summary(packingListId: number) {
    const header = await this.get(packingListId);
    if (!header.workOrderId) return { ...sizeSummary([],{ order: {}, willBeCut: {}, cut: {}, packed: {}, shipped: {} }), weights: packingTotals([], []) };
    const workOrderId = Number(header.workOrderId);
    const [matrix, cutByColor, { sizes, lines }] = await Promise.all([
      this.cuttingCards.getColorMatrix(workOrderId),
      this.cuttingCards.getCutTotalsByColor(workOrderId),
      this.getLines(packingListId),
    ]);
    const order: Record<string, number> = {};
    const willBeCut: Record<string, number> = {};
    for (const c of matrix.colors as any[]) {
      for (const s of sizes) {
        order[s] = (order[s] || 0) + (c.bySize[s]?.orderQty || 0);
        willBeCut[s] = (willBeCut[s] || 0) + (c.bySize[s]?.willBeCutQty || 0);
      }
    }
    const cut: Record<string, number> = {};
    for (const bySize of cutByColor.values()) for (const s of sizes) cut[s] = (cut[s] || 0) + (bySize[s] || 0);

    const toInputs = (ls: any[]): PackingLineInput[] => ls.map((l) => ({
      startBox: l.startBox, endBox: l.endBox, styleWeight: l.styleWeight, packageWeight: l.packageWeight, sizes: l.quantities,
    }));
    const weights = packingTotals(toInputs(lines), sizes);
    const shipped = await this.shippedBySize(workOrderId, sizes);
    return { ...sizeSummary(sizes, { order, willBeCut, cut, packed: weights.bySize, shipped }), weights };
  }

  /** Packed quantities of every SHIPPED (isShippedPackingList) Packing List of the Work Order. */
  private async shippedBySize(workOrderId: number, sizes: string[]) {
    const headers = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "InventoryReceiptId" as "inventoryReceiptId", "IsApproved" as "isApproved"
      FROM "IM_PackagingList" WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0
    `).then(sanitizeRawRow);
    const shipped: Record<string, number> = Object.fromEntries(sizes.map((s) => [s, 0]));
    for (const h of headers.filter((x: any) => isShippedPackingList(x))) {
      const { lines } = await this.getLines(Number(h.id));
      const t = packingTotals(lines.map((l) => ({ startBox: l.startBox, endBox: l.endBox, styleWeight: l.styleWeight, packageWeight: l.packageWeight, sizes: l.quantities })), sizes);
      for (const s of sizes) shipped[s] += t.bySize[s];
    }
    return shipped;
  }
}
