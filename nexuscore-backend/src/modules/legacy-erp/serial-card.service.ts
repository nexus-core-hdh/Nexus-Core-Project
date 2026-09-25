import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { AuditService, AUDIT_ACTIONS, hasRealChanges } from '../audit/audit.service';
import { screenKeyFor } from './inventory-receipt.service';

// Generate Serial Cards for a FABRIC receipt line — backed by the real, pre-existing
// IM_SerialCard / IM_SerialTransaction tables (confirmed via a live schema audit: 49 and 14
// real columns respectively, 0 rows, never referenced anywhere in this codebase before this
// file — the exact same "virgin but real" situation IM_ItemAllocation was in before
// item-allocation.service.ts was built on it; this file mirrors that one's established
// conventions — raw-SQL CRUD, sanitizeRawRow, FOR UPDATE locking, hasRealChanges-gated audit).
//
// Real FK topology (confirmed via pg_catalog, NOT assumed): IM_SerialCard has no direct
// receipt-item column at all — InventoryId/InventoryVariantId are direct FKs, but the
// receipt-line link is one level removed through IM_SerialTransaction.ReceiptItemId ->
// IM_ReceiptItem.RecId (paired with IM_SerialTransaction.SerialCardId -> IM_SerialCard.RecId).
// Every serial card this service creates therefore gets exactly one paired
// IM_SerialTransaction row — that pairing IS the traceability link back to the receipt.
//
// TransactionType convention (this table has never been written to before, so there is no
// pre-existing value to conform to — same "assign one, document it" pattern this codebase
// already uses for IM_ItemAllocationHistory.RowStatus): 1 = Receipt Inbound, the only type
// this feature ever writes.
const SERIAL_TXN_TYPE_RECEIPT = 1;

// Every editable IM_SerialCard field this feature's UI exposes, shared between Produce (as
// batch DEFAULTS stamped onto every newly-created card — matching the reference legacy screen's
// own header-row-becomes-every-row-default behavior) and Update (per-record edits). One shape,
// two call sites — never two competing field lists that could silently drift apart.
export interface SerialCardFieldDefaults {
  explanation?: string | null;
  partyNo?: string | null;
  qualityTypeId?: number | null;
  resourceId?: number | null;
  employeeId?: number | null;
  /** "Man. C/A Code" in the reference screen — IM_SerialCard.CurrentAccountId, the same
   *  FI_Account master every other current-account field in this codebase already uses. */
  currentAccountId?: number | null;
  producerSerialCode?: string | null;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  shelfLife?: number | null;
  quantity?: number | null;
  /** "Miktar II" / "3.Miktar" in the reference screen — IM_SerialCard's own second and third
   *  quantity columns (QuantityMT/Quantity3), real, pre-existing, never fabricated. */
  quantityMT?: number | null;
  quantity3?: number | null;
  width?: number | null;
  weight?: number | null;
  rawWidth?: number | null;
  rawWeight?: number | null;
  rawLength?: number | null;
  productLength?: number | null;
  /** "M2" / "Mtul" in the reference screen — IM_SerialCard.WeightM2/WeightMt. */
  weightM2?: number | null;
  weightMt?: number | null;
  pus?: number | null;
  fine?: number | null;
  pieceCount?: number | null;
}

export interface ProduceSerialCardsDto extends SerialCardFieldDefaults {
  count: number;
  /** Blank = auto-generate via the persisted global sequence. A template containing one or
   *  more trailing "#" characters (matching the reference screen's own "AF####" hint) numbers
   *  each generated card within this batch starting at 1. A literal value with no "#" is only
   *  valid when count === 1 (a fixed string can't represent more than one distinct card). */
  serialNo?: string | null;
}

export interface UpdateSerialCardDto extends SerialCardFieldDefaults {
  id: number;
}

@Injectable()
export class SerialCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Resolves the dialog's "General" section straight from the DB — every field is read fresh
  // from the persisted receipt line, never trusted from client state ("do not invent values").
  async getContext(inventoryReceiptId: number, inventoryReceiptItemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        ri."RecId" as "receiptItemId", ri."InventoryReceiptId" as "receiptId",
        ri."InventoryId" as "inventoryId", it."InventoryCode" as "inventoryCode", it."InventoryName" as "inventoryName",
        it."AccessCode" as "accessCode",
        ri."Quantity" as "quantity", ri."GrossQuantity" as "grossQuantity",
        ri."ColorCardId" as "colorCardId", cc.code as "colorCode", cc.name as "colorName",
        u."UnitCode" as "unitCode", u."UnitName" as "unitName",
        wi."RecId" as "workOrderItemId", wo."RecId" as "workOrderId", wo."WorkOrderNo" as "workOrderNo",
        r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType"
      FROM "IM_ReceiptItem" ri
      JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
      JOIN "IM_Item" it ON it."RecId" = ri."InventoryId"
      LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = ri."UnitId"
      LEFT JOIN "MA_WorkOrderItem" wi ON wi."RecId" = ri."WorkOrderReceiptItemId" AND wi."IsDeleted" = 0
      LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId" AND wo."IsDeleted" = 0
      LEFT JOIN "ColorCard" cc ON cc.id = ri."ColorCardId"
      WHERE ri."RecId" = ${inventoryReceiptItemId} AND ri."InventoryReceiptId" = ${inventoryReceiptId} AND ri."IsDeleted" = 0
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Receipt line not found.');

    // Variant Code/Name — this receipt line's real single-answer variant identity, resolved from
    // whichever of the two genuine, pre-existing relationships this line actually carries data in
    // (confirmed via live DB inspection, not assumed):
    //   1. IM_ReceiptItemVariant -> IM_ItemVariant -> IM_VariantItem (multi-attribute variant
    //      breakdown), used when this line has EXACTLY ONE persisted breakdown row — more than
    //      one is a genuine multi-variant line with no single answer, left honestly blank rather
    //      than guessing which one applies.
    //   2. IM_ReceiptItem.ColorCardId -> ColorCard — the single-axis Color variant FABRIC lines
    //      actually carry (this is the exact same relationship serial-card list()/listAll() below
    //      already join as "colorCode"/"colorName"; reused here as the SAME real column, not a
    //      second parallel concept). Falls back to this only when (1) found nothing, so a line
    //      that genuinely has both never has the Color silently overridden by an empty breakdown.
    const variantRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT riv."InventoryVariantId" as "inventoryVariantId", vi."ItemCode" as "variantCode", vi."ItemName" as "variantName"
      FROM "IM_ReceiptItemVariant" riv
      JOIN "IM_ItemVariant" iv ON iv."RecId" = riv."InventoryVariantId" AND iv."IsDeleted" = 0
      LEFT JOIN "IM_VariantItem" vi ON vi."RecId" = iv."Variant1Id" AND vi."IsDeleted" = 0
      WHERE riv."InventoryReceiptItemId" = ${inventoryReceiptItemId} AND riv."IsDeleted" = 0
    `);
    const variant = variantRows.length === 1 ? variantRows[0] : null;

    const existing = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int as "count", COALESCE(SUM(sc."Quantity"), 0) as "quantitySum"
      FROM "IM_SerialTransaction" st
      JOIN "IM_SerialCard" sc ON sc."RecId" = st."SerialCardId" AND sc."IsDeleted" = 0
      WHERE st."ReceiptItemId" = ${inventoryReceiptItemId}
    `);

    return sanitizeRawRow({
      ...row,
      inventoryVariantId: variant?.inventoryVariantId ?? null,
      variantCode: variant?.variantCode ?? row.colorCode ?? null,
      variantName: variant?.variantName ?? row.colorName ?? null,
      isFabric: row.accessCode === 'FABRIC',
      existingSerialCount: existing[0]?.count ?? 0,
      existingSerialQuantitySum: existing[0]?.quantitySum ?? 0,
    });
  }

  // Scoped list — every serial card produced against ONE specific receipt line. Enriched with
  // the same real joined display fields listAll() below uses (Inventory/Variant/Unit/Work
  // Order/Receipt/Warehouse Quantity/Status), so the Serial Cards list dialog renders real data
  // whether opened scoped (straight after Produce) or unscoped. Reused as-is — this method
  // already existed and worked; only its SELECT gained more real columns, nothing about its
  // WHERE/JOIN base or its callers' contract changed.
  async list(inventoryReceiptItemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT sc.*,
        it."InventoryCode" as "inventoryCode", it."InventoryName" as "inventoryName",
        vi."ItemCode" as "variantCode", vi."ItemName" as "variantName",
        u."UnitCode" as "unitCode", u."UnitName" as "unitName",
        wo."WorkOrderNo" as "workOrderNo",
        ri."RecId" as "receiptItemId", ri."InventoryReceiptId" as "receiptId", r."ReceiptNo" as "receiptNo",
        cc.code as "colorCode", cc.name as "colorName",
        qt."QualityCode" as "qualityTypeCode", qt."QualityName" as "qualityTypeName",
        res."ResourceCode" as "resourceCode",
        emp."EmployeeCode" as "employeeCode", emp."EmployeeName" as "employeeName",
        ca."CurrentAccountCode" as "currentAccountCode", ca."CurrentAccountName" as "currentAccountName",
        COALESCE(txn."warehouseQuantity", 0) as "warehouseQuantity",
        (COALESCE(txn."txnCount", 0) > 1) as "hasTransaction"
      FROM "IM_SerialTransaction" st
      JOIN "IM_SerialCard" sc ON sc."RecId" = st."SerialCardId" AND sc."IsDeleted" = 0
      LEFT JOIN "IM_Item" it ON it."RecId" = sc."InventoryId"
      LEFT JOIN "IM_ItemVariant" iv ON iv."RecId" = sc."InventoryVariantId" AND iv."IsDeleted" = 0
      LEFT JOIN "IM_VariantItem" vi ON vi."RecId" = iv."Variant1Id" AND vi."IsDeleted" = 0
      LEFT JOIN "MA_WorkOrderItem" wi ON wi."RecId" = sc."WorkOrderReceiptItemId" AND wi."IsDeleted" = 0
      LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId" AND wo."IsDeleted" = 0
      LEFT JOIN "FI_Account" ca ON ca."RecId" = sc."CurrentAccountId"
      LEFT JOIN "IM_ReceiptItem" ri ON ri."RecId" = st."ReceiptItemId"
      LEFT JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
      LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = ri."UnitId"
      LEFT JOIN "ColorCard" cc ON cc.id = ri."ColorCardId"
      LEFT JOIN "MA_QualityType" qt ON qt."RecId" = sc."QualityTypeId" AND qt."IsDeleted" = 0
      LEFT JOIN "MA_Resource" res ON res."RecId" = sc."ResourceId" AND res."IsDeleted" = 0
      LEFT JOIN "HR_Employee" emp ON emp."RecId" = sc."EmployeeId" AND emp."IsDeleted" = 0
      LEFT JOIN LATERAL (
        SELECT SUM(st2."Quantity") as "warehouseQuantity", COUNT(*)::int as "txnCount"
        FROM "IM_SerialTransaction" st2 WHERE st2."SerialCardId" = sc."RecId"
      ) txn ON true
      WHERE st."ReceiptItemId" = ${inventoryReceiptItemId} AND st."TransactionType" = ${SERIAL_TXN_TYPE_RECEIPT}
      ORDER BY sc."RecId" ASC
    `);
    return sanitizeRawRow(rows);
  }

  // General Serial Cards list — the dedicated list view's real data source, whether opened
  // scoped to one receipt item (straight after Produce, or from a line that already has cards)
  // or unscoped (browse every serial card, paginated). Same {rows,total,skip,take} contract
  // recipe-usage.service.ts's own list() already established for this codebase — reused here
  // rather than inventing a second pagination shape.
  //
  // "Warehouse Quantity" = SUM of this card's own real IM_SerialTransaction.Quantity rows — a
  // genuine derived stock-position value, distinct from IM_SerialCard.Quantity (the roll's own
  // descriptive/nominal quantity, user-editable via Update). Every row this feature currently
  // writes has Quantity=0 on its one linking transaction (see produce()'s own INSERT), so this
  // correctly reads 0 for every card until a real downstream movement transaction exists —
  // never fabricated, just not yet populated by any other feature.
  // "Status" (hasTransaction) = true once a card has MORE than its one original receipt-link
  // transaction (i.e. it has genuinely moved/been consumed beyond being produced) — real,
  // derived from COUNT(IM_SerialTransaction), not a guessed enum.
  async listAll(params: {
    receiptItemId?: number; inventoryId?: number; workOrderId?: number; search?: string;
    // Explicit, field-scoped filters for the dedicated Serial Cards screen's own filter bar —
    // each maps to one real column/join, never a single fuzzy catch-all pretending to search
    // fields it doesn't actually touch.
    serialNo?: string; inventoryQuery?: string; receiptNo?: string; workOrderNo?: string;
    variantQuery?: string;
    /** Range over the one real date field this schema has for this purpose —
     *  IM_SerialCard.ManufacturingDate ("Product Date" in the UI). */
    dateFrom?: string; dateTo?: string;
    status?: 'has' | 'none';
    skip?: number; take?: number;
  }) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 100, 500);

    const filters: Prisma.Sql[] = [Prisma.sql`sc."IsDeleted" = 0`];
    if (params.receiptItemId != null) filters.push(Prisma.sql`firstTxn."receiptItemId" = ${params.receiptItemId}`);
    if (params.inventoryId != null) filters.push(Prisma.sql`sc."InventoryId" = ${params.inventoryId}`);
    if (params.workOrderId != null) filters.push(Prisma.sql`wo."RecId" = ${params.workOrderId}`);
    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      filters.push(Prisma.sql`(sc."SerialCode" ILIKE ${term} OR it."InventoryCode" ILIKE ${term} OR it."InventoryName" ILIKE ${term})`);
    }
    if (params.serialNo?.trim()) filters.push(Prisma.sql`sc."SerialCode" ILIKE ${`%${params.serialNo.trim()}%`}`);
    if (params.inventoryQuery?.trim()) {
      const term = `%${params.inventoryQuery.trim()}%`;
      filters.push(Prisma.sql`(it."InventoryCode" ILIKE ${term} OR it."InventoryName" ILIKE ${term})`);
    }
    if (params.receiptNo?.trim()) filters.push(Prisma.sql`r."ReceiptNo" ILIKE ${`%${params.receiptNo.trim()}%`}`);
    if (params.workOrderNo?.trim()) filters.push(Prisma.sql`wo."WorkOrderNo" ILIKE ${`%${params.workOrderNo.trim()}%`}`);
    if (params.variantQuery?.trim()) {
      const term = `%${params.variantQuery.trim()}%`;
      filters.push(Prisma.sql`(vi."ItemCode" ILIKE ${term} OR vi."ItemName" ILIKE ${term})`);
    }
    if (params.dateFrom) filters.push(Prisma.sql`sc."ManufacturingDate" >= ${new Date(params.dateFrom)}`);
    if (params.dateTo) filters.push(Prisma.sql`sc."ManufacturingDate" <= ${new Date(params.dateTo)}`);
    if (params.status === 'has') filters.push(Prisma.sql`COALESCE(txn."txnCount", 0) > 1`);
    if (params.status === 'none') filters.push(Prisma.sql`COALESCE(txn."txnCount", 0) <= 1`);
    const whereClause = Prisma.join(filters, ' AND ');

    const fromJoins = Prisma.sql`
      FROM "IM_SerialCard" sc
      LEFT JOIN "IM_Item" it ON it."RecId" = sc."InventoryId"
      LEFT JOIN "IM_ItemVariant" iv ON iv."RecId" = sc."InventoryVariantId" AND iv."IsDeleted" = 0
      LEFT JOIN "IM_VariantItem" vi ON vi."RecId" = iv."Variant1Id" AND vi."IsDeleted" = 0
      LEFT JOIN "MA_WorkOrderItem" wi ON wi."RecId" = sc."WorkOrderReceiptItemId" AND wi."IsDeleted" = 0
      LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId" AND wo."IsDeleted" = 0
      LEFT JOIN "MA_QualityType" qt ON qt."RecId" = sc."QualityTypeId" AND qt."IsDeleted" = 0
      LEFT JOIN "MA_Resource" res ON res."RecId" = sc."ResourceId" AND res."IsDeleted" = 0
      LEFT JOIN "HR_Employee" emp ON emp."RecId" = sc."EmployeeId" AND emp."IsDeleted" = 0
      LEFT JOIN "FI_Account" ca ON ca."RecId" = sc."CurrentAccountId"
      LEFT JOIN LATERAL (
        SELECT st."ReceiptItemId" as "receiptItemId" FROM "IM_SerialTransaction" st
        WHERE st."SerialCardId" = sc."RecId" AND st."TransactionType" = ${SERIAL_TXN_TYPE_RECEIPT}
        ORDER BY st."RecId" ASC LIMIT 1
      ) firstTxn ON true
      LEFT JOIN "IM_ReceiptItem" ri ON ri."RecId" = firstTxn."receiptItemId"
      LEFT JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
      LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = ri."UnitId"
      LEFT JOIN "ColorCard" cc ON cc.id = ri."ColorCardId"
      LEFT JOIN LATERAL (
        SELECT SUM(st2."Quantity") as "warehouseQuantity", COUNT(*)::int as "txnCount"
        FROM "IM_SerialTransaction" st2 WHERE st2."SerialCardId" = sc."RecId"
      ) txn ON true
    `;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT sc.*,
          it."InventoryCode" as "inventoryCode", it."InventoryName" as "inventoryName",
          vi."ItemCode" as "variantCode", vi."ItemName" as "variantName",
          u."UnitCode" as "unitCode", u."UnitName" as "unitName",
          wo."WorkOrderNo" as "workOrderNo",
          ri."RecId" as "receiptItemId", ri."InventoryReceiptId" as "receiptId", r."ReceiptNo" as "receiptNo",
          cc.code as "colorCode", cc.name as "colorName",
          qt."QualityCode" as "qualityTypeCode", qt."QualityName" as "qualityTypeName",
          res."ResourceCode" as "resourceCode",
          emp."EmployeeCode" as "employeeCode", emp."EmployeeName" as "employeeName",
          ca."CurrentAccountCode" as "currentAccountCode", ca."CurrentAccountName" as "currentAccountName",
          COALESCE(txn."warehouseQuantity", 0) as "warehouseQuantity",
          (COALESCE(txn."txnCount", 0) > 1) as "hasTransaction"
        ${fromJoins}
        WHERE ${whereClause}
        ORDER BY sc."RecId" DESC
        OFFSET ${skip} LIMIT ${take}
      `),
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT COUNT(*)::int as count ${fromJoins} WHERE ${whereClause}
      `),
    ]);

    return { rows: sanitizeRawRow(rows), total: countRows[0]?.count ?? 0, skip, take };
  }

  async remove(id: number, userId: string, companyId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_SerialCard" WHERE "RecId" = ${id} AND "IsDeleted" = 0 FOR UPDATE`);
      const before = rows[0];
      if (!before) throw new NotFoundException('Serial Card not found.');

      await tx.$executeRaw`
        UPDATE "IM_SerialCard" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${Number(userId) || 1} WHERE "RecId" = ${id}
      `;

      const txnRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT st."ReceiptItemId" as "receiptItemId" FROM "IM_SerialTransaction" st
        WHERE st."SerialCardId" = ${id} AND st."TransactionType" = ${SERIAL_TXN_TYPE_RECEIPT} LIMIT 1
      `);
      const receiptItemId = txnRows[0]?.receiptItemId ?? null;
      let receiptNo: string | null = null;
      let screenKey: string | null = null;
      if (receiptItemId) {
        const ctxRows = await tx.$queryRaw<any[]>(Prisma.sql`
          SELECT r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType"
          FROM "IM_ReceiptItem" ri JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
          WHERE ri."RecId" = ${receiptItemId}
        `);
        receiptNo = ctxRows[0]?.receiptNo ?? null;
        screenKey = ctxRows[0] ? screenKeyFor(Number(ctxRows[0].receiptType)) : null;
      }
      await this.audit.record({
        userId, companyId, screenKey,
        entityType: 'SerialCard', entityId: String(id), action: AUDIT_ACTIONS.DELETE,
        documentNo: before.SerialCode,
        parentEntityType: 'InventoryReceiptItem', parentEntityId: receiptItemId != null ? String(receiptItemId) : null,
        parentDocumentNo: receiptNo,
        before: sanitizeRawRow(before),
      }, tx);

      return { message: 'Deleted' };
    });
  }

  private buildSerialCodes(template: string | null | undefined, count: number, lastGlobal: string | null): string[] {
    const trimmed = (template ?? '').trim();
    if (!trimmed) {
      // Auto-generate: persisted global sequence, 8-digit zero-padded, next after the
      // highest existing numeric SerialCode (0 if the table is still empty).
      const start = (() => {
        const n = lastGlobal ? parseInt(lastGlobal, 10) : NaN;
        return Number.isFinite(n) ? n + 1 : 1;
      })();
      return Array.from({ length: count }, (_, i) => String(start + i).padStart(8, '0'));
    }
    const hashMatch = trimmed.match(/#+$/);
    if (!hashMatch) {
      if (count !== 1) {
        throw new BadRequestException('A fixed Serial No (with no "#" digits) can only be used when Serials Count is 1.');
      }
      return [trimmed];
    }
    const prefix = trimmed.slice(0, trimmed.length - hashMatch[0].length);
    const width = hashMatch[0].length;
    return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(width, '0')}`);
  }

  async produce(
    inventoryReceiptId: number, inventoryReceiptItemId: number, dto: ProduceSerialCardsDto,
    userId: string, companyId: string,
  ) {
    if (!Number.isInteger(dto.count) || dto.count <= 0) {
      throw new BadRequestException('Serials Count must be a positive integer.');
    }
    if (dto.count > 500) {
      throw new BadRequestException('Serials Count is too large for a single batch (max 500).');
    }

    return this.prisma.$transaction(async (tx) => {
      const lineRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT ri."RecId" as id, ri."InventoryId" as "inventoryId", it."AccessCode" as "accessCode",
          ri."WorkOrderReceiptItemId" as "workOrderReceiptItemId", ri."Quantity" as "lineQuantity"
        FROM "IM_ReceiptItem" ri
        JOIN "IM_Item" it ON it."RecId" = ri."InventoryId"
        WHERE ri."RecId" = ${inventoryReceiptItemId} AND ri."InventoryReceiptId" = ${inventoryReceiptId} AND ri."IsDeleted" = 0
        FOR UPDATE OF ri
      `);
      const line = lineRows[0];
      if (!line) throw new NotFoundException('Receipt line not found.');
      if (line.accessCode !== 'FABRIC') {
        throw new BadRequestException('Generate Serial Cards is only available for Fabric receipt lines.');
      }

      // Quantity-cap guard — only relevant now that Produce can stamp a real, non-zero default
      // Quantity onto every card in the batch (see the header-defaults comment below). Same rule
      // update() already enforces per-record, applied here to the WHOLE new batch at once so N
      // cards x a real default Quantity can never silently exceed the receipt line's own
      // Quantity in one Produce call.
      if (dto.quantity) {
        const existingRows = await tx.$queryRaw<any[]>(Prisma.sql`
          SELECT COALESCE(SUM(sc."Quantity"), 0) as "sum" FROM "IM_SerialTransaction" st
          JOIN "IM_SerialCard" sc ON sc."RecId" = st."SerialCardId" AND sc."IsDeleted" = 0
          WHERE st."ReceiptItemId" = ${inventoryReceiptItemId}
        `);
        const wouldBe = Number(existingRows[0]?.sum ?? 0) + Number(dto.quantity) * dto.count;
        if (wouldBe > Number(line.lineQuantity) + 0.0001) {
          throw new ConflictException(
            `Total roll Quantity (${wouldBe}) would exceed this receipt line's Quantity (${line.lineQuantity}).`,
          );
        }
      }

      // Resolve the line's own single variant (see getContext's own comment) — copied onto
      // every generated card, never guessed.
      const variantRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT riv."InventoryVariantId" as id FROM "IM_ReceiptItemVariant" riv
        WHERE riv."InventoryReceiptItemId" = ${inventoryReceiptItemId} AND riv."IsDeleted" = 0
      `);
      const inventoryVariantId = variantRows.length === 1 ? Number(variantRows[0].id) : null;

      // Lock the globally-last SerialCode row (if any) so two concurrent Produce calls can
      // never compute the same next auto-generated number — same FOR UPDATE serialization
      // pattern item-allocation.service.ts's own saveAllocation already establishes.
      const lastRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT "SerialCode" as code FROM "IM_SerialCard" WHERE "CompanyId" = 1
        ORDER BY "RecId" DESC LIMIT 1 FOR UPDATE
      `);
      const codes = this.buildSerialCodes(dto.serialNo, dto.count, lastRows[0]?.code ?? null);

      // Application-level uniqueness guard — IM_SerialCard has no DB-level unique index on
      // SerialCode (confirmed via pg_indexes: only the RecId primary key), so a manual/template
      // Serial No must be checked explicitly rather than relying on a constraint violation.
      const collisions = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT "SerialCode" as code FROM "IM_SerialCard" WHERE "IsDeleted" = 0 AND "SerialCode" IN (${Prisma.join(codes)})
      `);
      if (collisions.length) {
        throw new ConflictException(`Serial No already exists: ${collisions.map((c) => c.code).join(', ')}`);
      }

      // Header-row defaults (see SerialCardFieldDefaults's own comment) — stamped onto every
      // card in this batch, matching the reference legacy screen's own behavior (the General
      // section's Quantity/Width/Grams/Product Date/... become every generated row's starting
      // value, still individually editable afterward via Update). Every field defaults to its
      // previous hardcoded value (0 for Quantity, null for everything else) when omitted, so a
      // caller that only sends `count`/`serialNo` (the dedicated Serial Cards screen's own
      // "produce blank cards" use, if ever needed) behaves exactly as before this change.
      const created: any[] = [];
      for (const code of codes) {
        const inserted = await tx.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_SerialCard" (
            "CompanyId", "SerialCode", "InventoryId", "InventoryVariantId",
            "WorkOrderReceiptItemId", "InUse",
            "Explanation", "PartyNo", "QualityTypeId", "ResourceId", "EmployeeId", "CurrentAccountId",
            "ProducerSerialCode", "ManufacturingDate", "ExpirationDate", "ShelfLife",
            "Quantity", "QuantityMT", "Quantity3",
            "Width", "Weight", "RawWidth", "RawWeight", "RawLength", "ProductLength",
            "WeightM2", "WeightMt", "Pus", "Fine", "PieceCount",
            "InsertedAt", "InsertedBy", "IsDeleted", "UUID"
          ) VALUES (
            1, ${code}, ${line.inventoryId}, ${inventoryVariantId},
            ${line.workOrderReceiptItemId ?? null}, 1,
            ${dto.explanation ?? null}, ${dto.partyNo ?? null}, ${dto.qualityTypeId ?? null}, ${dto.resourceId ?? null}, ${dto.employeeId ?? null}, ${dto.currentAccountId ?? null},
            ${dto.producerSerialCode ?? null}, ${dto.manufacturingDate ? new Date(dto.manufacturingDate) : null}, ${dto.expirationDate ? new Date(dto.expirationDate) : null}, ${dto.shelfLife ?? null},
            ${dto.quantity ?? 0}, ${dto.quantityMT ?? null}, ${dto.quantity3 ?? null},
            ${dto.width ?? null}, ${dto.weight ?? null}, ${dto.rawWidth ?? null}, ${dto.rawWeight ?? null}, ${dto.rawLength ?? null}, ${dto.productLength ?? null},
            ${dto.weightM2 ?? null}, ${dto.weightMt ?? null}, ${dto.pus ?? null}, ${dto.fine ?? null}, ${dto.pieceCount ?? null},
            now(), ${Number(userId) || 1}, 0, gen_random_uuid()
          )
          RETURNING "RecId" as id
        `);
        const serialCardId = Number(inserted[0].id);
        await tx.$executeRaw`
          INSERT INTO "IM_SerialTransaction" (
            "SerialCardId", "TransactionType", "ReceiptItemId", "Quantity",
            "InsertedAt", "InsertedBy", "IsDeleted", "UUID"
          ) VALUES (
            ${serialCardId}, ${SERIAL_TXN_TYPE_RECEIPT}, ${inventoryReceiptItemId}, 0,
            now(), ${Number(userId) || 1}, 0, gen_random_uuid()
          )
        `;
        const afterRows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_SerialCard" WHERE "RecId" = ${serialCardId}`);
        created.push(sanitizeRawRow(afterRows[0]));
      }

      // One audit CREATE per generated card — real entity/document/parent context, same shape
      // item-allocation.service.ts's own audit call uses.
      const receiptRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType" FROM "IM_Receipt" r WHERE r."RecId" = ${inventoryReceiptId}
      `);
      const receipt = receiptRows[0];
      for (const card of created) {
        await this.audit.record({
          userId, companyId, screenKey: receipt ? screenKeyFor(Number(receipt.receiptType)) : null,
          entityType: 'SerialCard', entityId: String(card.RecId), action: AUDIT_ACTIONS.CREATE,
          documentNo: card.SerialCode,
          parentEntityType: 'InventoryReceiptItem', parentEntityId: String(inventoryReceiptItemId),
          parentDocumentNo: receipt?.receiptNo ?? null,
          after: card,
        }, tx);
      }

      return created;
    });
  }

  async update(items: UpdateSerialCardDto[], userId: string, companyId: string) {
    if (!items.length) return [];

    return this.prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const dto of items) {
        const beforeRows = await tx.$queryRaw<any[]>(Prisma.sql`
          SELECT * FROM "IM_SerialCard" WHERE "RecId" = ${dto.id} AND "IsDeleted" = 0 FOR UPDATE
        `);
        const before = beforeRows[0];
        if (!before) throw new NotFoundException(`Serial Card ${dto.id} not found.`);

        // Quantity-sum-vs-receipt-quantity guard — enforced here (the point at which a real
        // roll quantity is actually entered), not at Produce time (every newly-produced card
        // starts at Quantity 0 — see produce()'s own INSERT — so there is nothing to over-
        // allocate against until the user fills a real value in via Update).
        if (dto.quantity != null) {
          const txnRows = await tx.$queryRaw<any[]>(Prisma.sql`
            SELECT st."ReceiptItemId" as "receiptItemId" FROM "IM_SerialTransaction" st
            WHERE st."SerialCardId" = ${dto.id} LIMIT 1
          `);
          const receiptItemId = txnRows[0]?.receiptItemId;
          if (receiptItemId) {
            const capRows = await tx.$queryRaw<any[]>(Prisma.sql`
              SELECT ri."Quantity" as "lineQuantity",
                COALESCE((
                  SELECT SUM(sc."Quantity") FROM "IM_SerialTransaction" st2
                  JOIN "IM_SerialCard" sc ON sc."RecId" = st2."SerialCardId" AND sc."IsDeleted" = 0
                  WHERE st2."ReceiptItemId" = ri."RecId" AND sc."RecId" != ${dto.id}
                ), 0) as "otherSum"
              FROM "IM_ReceiptItem" ri WHERE ri."RecId" = ${receiptItemId}
            `);
            const cap = capRows[0];
            if (cap) {
              const wouldBe = Number(cap.otherSum) + Number(dto.quantity);
              if (wouldBe > Number(cap.lineQuantity) + 0.0001) {
                throw new ConflictException(
                  `Total roll Quantity (${wouldBe}) would exceed this receipt line's Quantity (${cap.lineQuantity}).`,
                );
              }
            }
          }
        }

        await tx.$executeRaw`
          UPDATE "IM_SerialCard" SET
            "Explanation" = ${dto.explanation ?? null},
            "PartyNo" = ${dto.partyNo ?? null},
            "QualityTypeId" = ${dto.qualityTypeId ?? null},
            "ResourceId" = ${dto.resourceId ?? null},
            "EmployeeId" = ${dto.employeeId ?? null},
            "CurrentAccountId" = ${dto.currentAccountId ?? null},
            "ProducerSerialCode" = ${dto.producerSerialCode ?? null},
            "ManufacturingDate" = ${dto.manufacturingDate ? new Date(dto.manufacturingDate) : null},
            "ExpirationDate" = ${dto.expirationDate ? new Date(dto.expirationDate) : null},
            "ShelfLife" = ${dto.shelfLife ?? null},
            "Quantity" = ${dto.quantity ?? 0},
            "QuantityMT" = ${dto.quantityMT ?? null},
            "Quantity3" = ${dto.quantity3 ?? null},
            "Width" = ${dto.width ?? null},
            "Weight" = ${dto.weight ?? null},
            "RawWidth" = ${dto.rawWidth ?? null},
            "RawWeight" = ${dto.rawWeight ?? null},
            "RawLength" = ${dto.rawLength ?? null},
            "ProductLength" = ${dto.productLength ?? null},
            "WeightM2" = ${dto.weightM2 ?? null},
            "WeightMt" = ${dto.weightMt ?? null},
            "Pus" = ${dto.pus ?? null},
            "Fine" = ${dto.fine ?? null},
            "PieceCount" = ${dto.pieceCount ?? null},
            "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
          WHERE "RecId" = ${dto.id}
        `;
        const afterRows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_SerialCard" WHERE "RecId" = ${dto.id}`);
        const after = sanitizeRawRow(afterRows[0]);
        const beforeSnapshot = sanitizeRawRow(before);

        if (hasRealChanges(beforeSnapshot, after, ['UpdatedAt', 'UpdatedBy'])) {
          const txnRows = await tx.$queryRaw<any[]>(Prisma.sql`
            SELECT st."ReceiptItemId" as "receiptItemId" FROM "IM_SerialTransaction" st WHERE st."SerialCardId" = ${dto.id} LIMIT 1
          `);
          const receiptItemId = txnRows[0]?.receiptItemId ?? null;
          let receiptNo: string | null = null;
          let screenKey: string | null = null;
          if (receiptItemId) {
            const ctxRows = await tx.$queryRaw<any[]>(Prisma.sql`
              SELECT r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType"
              FROM "IM_ReceiptItem" ri JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
              WHERE ri."RecId" = ${receiptItemId}
            `);
            receiptNo = ctxRows[0]?.receiptNo ?? null;
            screenKey = ctxRows[0] ? screenKeyFor(Number(ctxRows[0].receiptType)) : null;
          }
          await this.audit.record({
            userId, companyId, screenKey,
            entityType: 'SerialCard', entityId: String(dto.id), action: AUDIT_ACTIONS.UPDATE,
            documentNo: after.SerialCode,
            parentEntityType: 'InventoryReceiptItem', parentEntityId: receiptItemId != null ? String(receiptItemId) : null,
            parentDocumentNo: receiptNo,
            before: beforeSnapshot, after,
          }, tx);
        }

        results.push(after);
      }
      return results;
    });
  }
}
