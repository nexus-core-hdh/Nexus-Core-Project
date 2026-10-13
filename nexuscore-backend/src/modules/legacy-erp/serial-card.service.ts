import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { AuditService, AUDIT_ACTIONS, hasRealChanges } from '../audit/audit.service';
import { screenKeyFor } from './inventory-receipt.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';
import { FabricYarnRecipeService } from './fabric-yarn-recipe.service';

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

// The Serial No IS the card's barcode (Code 128 on the label, scanned back through getByCode), so
// it must never repeat. IM_SerialCard has no unique index on SerialCode, so produce() takes this
// transaction-scoped advisory lock before choosing numbers: concurrent Produce calls run one after
// another, and each sees every code the previous one committed. Arbitrary fixed key ("SERL").
const SERIAL_CODE_LOCK_KEY = 0x5345524c;
const SERIAL_CODE_MAX_LENGTH = 30; // IM_SerialCard.SerialCode varchar(30)
// Code 128 set B — printable ASCII. A Serial No outside it could not be printed as a barcode.
const BARCODE_SAFE = /^[!-~](?:[ -~]*[!-~])?$/;

// Production identity every serial card row carries (list(), listAll(), getDetail()) — all read
// live from the records the card is linked to, never copied onto the card: Work Order (via
// WorkOrderReceiptItemId) -> its Style Card; the Fabric Card's own Composition / Finish GSM master
// (IM_Item stores the master's RecId as text — see fabric-card.service.ts) and spec Width/Weight;
// the receipt line's Material Color (ColorCardId, which picks a Color-Specific Yarn Recipe).
// Needs the `it`, `wo` and `ri` aliases of the queries it is spliced into; PRODUCTION_JOINS
// must come after the `wo` join.
const PRODUCTION_SELECT = Prisma.sql`
  wo."RecId" as "workOrderId", stc.id as "styleCardId", stc."styleNumber" as "styleNumber", stc.title as "styleName",
  ri."ColorCardId" as "colorCardId",
  comp."CompositionName" as "fabricComposition", gsm."FinishGSMName" as "fabricGsm",
  it."FWidth" as "fabricWidth", it."FWeight" as "fabricWeight"`;
const PRODUCTION_JOINS = Prisma.sql`
  LEFT JOIN "StyleCard" stc ON stc.id = wo."StyleCardId"
  LEFT JOIN "MD_Composition" comp ON comp."RecId"::text = it."UD_FabComposition"
  LEFT JOIN "MD_FinishGSM" gsm ON gsm."RecId"::text = it."UD_FabGSM"`;

export type SerialCardYarnRecipe = {
  status: 'ok' | 'no-work-order' | 'not-in-bom' | 'ambiguous' | 'not-defined';
  message: string | null;
  /** 'color' = the Fabric's Color-Specific recipe for the BOM line's Material Color; 'common' = its Common/Overall recipe. */
  source: 'color' | 'common' | null;
  bomLineColorCardId: string | null;
  lines: {
    yarnInventoryId: number | null; yarnCode: string | null; yarnName: string | null;
    percentage: number; process: string | null; variant1: string | null; variant2: string | null;
    explanation: string | null; wastePct: number; dyeWastagePct: number;
  }[];
};

// ── Serial Card QR payload ───────────────────────────────────────────────────────────────────
// The text a Serial Card label's QR Code holds: the card's complete information as JSON, readable
// by any QR scanner with no ERP lookup. Built from a listAll()-shaped row (the card + its linked
// Work Order / Style Card / Fabric Card / receipt line) and its resolved Yarn Recipe — the same
// data the detail screen shows, never re-derived elsewhere.
//  - Every key is always present, in a fixed order; an unavailable value is null (never invented,
//    never an empty string) and an unavailable Yarn Recipe says why ("status"/"message").
//  - Deterministic: no timestamps or volatile values (warehouse quantity, transaction status), so
//    a reprint gives the identical payload until the card or its linked data really changes.
//  - Unique per card: it carries the card's Serial No.
//  - No internal ids, audit fields or personal data (the Employee field is left out).
export const SERIAL_CARD_QR_SCHEMA = 'nexuscore.serial-card/1';

// Product Date / Expiration Date are calendar dates held in timestamp-without-time-zone columns.
// Bound as a JS Date they would be converted to the DB session's timezone on the way in (a
// "2026-10-12" entered in a UTC-7 session was stored as 2026-10-11 17:00), so they are sent as a
// plain YYYY-MM-DD string and cast in SQL: stored as that date at 00:00, exactly as entered.
// An ISO timestamp (an untouched value echoed back from a loaded row) keeps its date part.
export function calendarDate(v: string | null | undefined): string | null {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date: ${s}`);
  return d.toISOString().slice(0, 10);
}

const qrText = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const qrNumber = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(8)) : null;
};
// Prisma returns timestamp-without-time-zone values as Dates read as UTC, so the stored calendar
// date is the UTC date — the same YYYY-MM-DD the screens show (ISO string, first 10 chars),
// independent of the server's timezone.
const qrDate = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const codeName = (code: unknown, name: unknown) => {
  const c = qrText(code);
  const n = qrText(name);
  return c == null && n == null ? null : { code: c, name: n };
};

export function buildSerialCardQrPayload(card: any, recipe: SerialCardYarnRecipe): string {
  const payload = {
    schema: SERIAL_CARD_QR_SCHEMA,
    serialNo: qrText(card.SerialCode),
    workOrderNo: qrText(card.workOrderNo),
    style: { number: qrText(card.styleNumber), name: qrText(card.styleName) },
    fabric: {
      code: qrText(card.inventoryCode),
      name: qrText(card.inventoryName),
      composition: qrText(card.fabricComposition),
      finishGsm: qrText(card.fabricGsm),
      specWidth: qrNumber(card.fabricWidth),
      specWeight: qrNumber(card.fabricWeight),
    },
    color: codeName(card.colorCode, card.colorName),
    variant: codeName(card.variantCode, card.variantName),
    width: qrNumber(card.Width),
    grams: qrNumber(card.Weight),
    quantity: qrNumber(card.Quantity),
    unit: qrText(card.unitCode),
    quantity2: qrNumber(card.QuantityMT),
    quantity3: qrNumber(card.Quantity3),
    receiptNo: qrText(card.receiptNo),
    productDate: qrDate(card.ManufacturingDate),
    expirationDate: qrDate(card.ExpirationDate),
    shelfLife: qrNumber(card.ShelfLife),
    manCaCode: codeName(card.currentAccountCode, card.currentAccountName),
    partyNo: qrText(card.PartyNo),
    qualityType: qrText(card.qualityTypeName),
    resource: qrText(card.resourceCode),
    manufacturerSerial: qrText(card.ProducerSerialCode),
    explanation: qrText(card.Explanation),
    rawWidth: qrNumber(card.RawWidth),
    rawWeight: qrNumber(card.RawWeight),
    rawLength: qrNumber(card.RawLength),
    productLength: qrNumber(card.ProductLength),
    m2: qrNumber(card.WeightM2),
    mtul: qrNumber(card.WeightMt),
    pus: qrNumber(card.Pus),
    fine: qrNumber(card.Fine),
    pieceCount: qrNumber(card.PieceCount),
    yarnRecipe: {
      status: recipe.status,
      message: recipe.message ?? null,
      source: recipe.source ?? null,
      lines: recipe.lines.map((l) => ({
        code: qrText(l.yarnCode),
        name: qrText(l.yarnName),
        process: qrText(l.process),
        variant: qrText([l.variant1, l.variant2].map(qrText).filter(Boolean).join(' / ')),
        percentage: qrNumber(l.percentage),
        wastePct: qrNumber(l.wastePct),
        dyeWastagePct: qrNumber(l.dyeWastagePct),
      })),
    },
  };
  return JSON.stringify(payload);
}

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
  /** Blank = auto-generate: the next numbers after the highest all-digit Serial No ever issued.
   *  A template with trailing "#" characters (the reference screen's own "AF####" hint) continues
   *  after the highest existing Serial No of that prefix and width. A literal value with no "#" is
   *  only valid when count === 1 (a fixed string can't represent more than one distinct card). */
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
    private readonly yarnRequirements: FabricYarnRequirementsService,
    private readonly yarnRecipes: FabricYarnRecipeService,
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
        ${PRODUCTION_SELECT},
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
      ${PRODUCTION_JOINS}
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
    /** Party No column filter (Serial Cards grid) — cards whose Party No (trimmed) is one of these. */
    partyNos?: string[];
    skip?: number; take?: number;
    /** Internal (getDetail/getByCode/getLabels) — cards by RecId, or one by its exact Serial No. */
    id?: number; ids?: number[]; serialCodeEquals?: string;
  }) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 100, 500);

    const filters: Prisma.Sql[] = [Prisma.sql`sc."IsDeleted" = 0`];
    if (params.id != null) filters.push(Prisma.sql`sc."RecId" = ${params.id}`);
    if (params.ids) filters.push(params.ids.length ? Prisma.sql`sc."RecId" IN (${Prisma.join(params.ids)})` : Prisma.sql`false`);
    if (params.serialCodeEquals != null) filters.push(Prisma.sql`sc."SerialCode" = ${params.serialCodeEquals}`);
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
    // Every filter except Party No — the Party No column filter's option list is drawn from this
    // set, so choosing one Party No never hides the others from the list.
    const optionWhere = Prisma.join(filters, ' AND ');
    const partyNos = [...new Set((params.partyNos ?? []).map((v) => String(v).trim()).filter(Boolean))];
    if (partyNos.length) filters.push(Prisma.sql`TRIM(sc."PartyNo") IN (${Prisma.join(partyNos)})`);
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
      ${PRODUCTION_JOINS}
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
        ${PRODUCTION_SELECT},
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

    // Distinct non-blank Party Nos across ALL matching cards (not just this page) — the Party No
    // column filter's options. Skipped for the internal single-card lookups.
    const partyNoOptions = params.id != null || params.ids != null || params.serialCodeEquals != null ? [] : (await this.prisma.$queryRaw<{ v: string }[]>(Prisma.sql`
      SELECT DISTINCT TRIM(sc."PartyNo") as v ${fromJoins}
      WHERE ${optionWhere} AND NULLIF(TRIM(sc."PartyNo"), '') IS NOT NULL
      ORDER BY 1 LIMIT 1000
    `)).map((r) => r.v);

    return { rows: sanitizeRawRow(rows), total: countRows[0]?.count ?? 0, skip, take, partyNoOptions };
  }

  // Serial Card detail — the list row (every card field + its production identity) plus the Yarn
  // Recipe of the BOM it was produced against. Backs the detail screen and barcode scan.
  async getDetail(id: number) {
    const { rows } = await this.listAll({ id, take: 1 });
    if (!rows[0]) throw new NotFoundException('Serial card not found.');
    const yarnRecipe = await this.resolveYarnRecipe(rows[0]);
    return { ...rows[0], yarnRecipe, qrPayload: buildSerialCardQrPayload(rows[0], yarnRecipe) };
  }

  // Label printing — every requested card (in the requested order) with its Yarn Recipe and the
  // QR payload printed on its label. One recipe resolution per distinct (Work Order, fabric, color).
  async getLabels(ids: number[]) {
    const unique = [...new Set((ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!unique.length) throw new BadRequestException('Select at least one serial card.');
    if (unique.length > 500) throw new BadRequestException('Too many serial cards selected (max 500).');
    const { rows } = await this.listAll({ ids: unique, take: 500 });
    if (rows.length !== unique.length) throw new NotFoundException('Some selected serial cards no longer exist.');
    const byId = new Map(rows.map((r: any) => [Number(r.RecId), r]));
    const recipes = new Map<string, Promise<SerialCardYarnRecipe>>();
    return Promise.all(unique.map(async (id) => {
      const row: any = byId.get(id);
      const key = `${row.workOrderId ?? ''}|${row.InventoryId}|${row.colorCardId ?? ''}|${row.workOrderNo ?? ''}|${row.inventoryCode ?? ''}`;
      if (!recipes.has(key)) recipes.set(key, this.resolveYarnRecipe(row));
      const yarnRecipe = await recipes.get(key)!;
      return { ...row, yarnRecipe, qrPayload: buildSerialCardQrPayload(row, yarnRecipe) };
    }));
  }

  // Barcode scan / Serial No lookup. The barcode is the Serial No itself, so this is an exact match;
  // a scanner that sends a different letter case still finds the card when exactly one matches.
  async getByCode(code: string) {
    const value = String(code ?? '').trim();
    if (!value) throw new BadRequestException('Scan or enter a Serial No.');
    let { rows } = await this.listAll({ serialCodeEquals: value, take: 2 });
    if (!rows.length) {
      const ci = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "RecId" as id FROM "IM_SerialCard" WHERE "IsDeleted" = 0 AND UPPER("SerialCode") = UPPER(${value}) LIMIT 2
      `);
      if (ci.length === 1) rows = (await this.listAll({ id: Number(ci[0].id), take: 1 })).rows;
    }
    if (!rows.length) throw new NotFoundException(`No serial card with Serial No ${value}.`);
    if (rows.length > 1) throw new ConflictException(`More than one serial card has Serial No ${value}.`);
    const yarnRecipe = await this.resolveYarnRecipe(rows[0]);
    return { ...rows[0], yarnRecipe, qrPayload: buildSerialCardQrPayload(rows[0], yarnRecipe) };
  }

  // The Yarn Recipe for the roll, from the BOM it was actually produced against — never a guess:
  //  1. the card's Work Order (no Work Order -> no BOM -> 'no-work-order');
  //  2. that Work Order's Fabric BOM as every other screen resolves it (its own lines, else its
  //     Style Card's — FabricYarnRequirementsService.resolveBomLines), the line(s) for this fabric:
  //     the only one, else the one whose Material Color is the roll's color, else the only
  //     colorless (common) line; otherwise 'ambiguous' rather than picking one;
  //  3. that line's effective recipe — Color-Specific for its Material Color, else the Fabric's
  //     Common/Overall (FabricYarnRecipeService.resolveEffectiveRecipe, the same rule Yarn
  //     Requirements use); none -> 'not-defined'.
  async resolveYarnRecipe(card: any): Promise<SerialCardYarnRecipe> {
    const empty = (status: SerialCardYarnRecipe['status'], message: string): SerialCardYarnRecipe =>
      ({ status, message, source: null, bomLineColorCardId: null, lines: [] });
    if (!card?.workOrderId) return empty('no-work-order', 'This serial card is not linked to a Work Order, so there is no BOM to take a Yarn Recipe from.');
    const bom = await this.yarnRequirements.resolveBomLines(Number(card.workOrderId), 'fabric');
    const matches = bom.filter((l: any) => l.inventoryId != null && Number(l.inventoryId) === Number(card.InventoryId));
    if (!matches.length) return empty('not-in-bom', `${card.inventoryCode ?? 'This fabric'} is not on Work Order ${card.workOrderNo ?? ''}'s Fabric BOM.`);
    let line: any = matches.length === 1 ? matches[0] : null;
    if (!line && card.colorCardId) line = matches.find((l: any) => l.colorCardId && String(l.colorCardId) === String(card.colorCardId)) ?? null;
    if (!line) {
      const common = matches.filter((l: any) => !l.colorCardId);
      if (common.length === 1) line = common[0];
    }
    if (!line) return empty('ambiguous', `${card.inventoryCode ?? 'This fabric'} is on the Work Order's Fabric BOM ${matches.length} times and none matches this roll's color.`);
    const recipe = await this.yarnRecipes.resolveEffectiveRecipe(Number(card.InventoryId), line.colorCardId ?? null);
    if (!recipe.length) return empty('not-defined', `No Yarn Recipe is defined for ${card.inventoryCode ?? 'this fabric'}.`);
    const yarnIds = [...new Set(recipe.map((r) => r.yarnInventoryId).filter((v): v is number => v != null))];
    const yarns = yarnIds.length
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name FROM "IM_Item" WHERE "RecId" IN (${Prisma.join(yarnIds)})`)
      : [];
    const yarnById = new Map(yarns.map((y) => [Number(y.id), y]));
    return {
      status: 'ok', message: null,
      source: recipe[0].colorCardId ? 'color' : 'common',
      bomLineColorCardId: line.colorCardId ?? null,
      lines: recipe.map((r) => {
        const y = r.yarnInventoryId != null ? yarnById.get(r.yarnInventoryId) : null;
        return {
          yarnInventoryId: r.yarnInventoryId ?? null,
          yarnCode: y?.code ?? r.yarnCode ?? null,
          yarnName: y?.name ?? r.yarnName ?? null,
          percentage: Number(r.percentage) || 0,
          process: r.process ?? null, variant1: r.variant1 ?? null, variant2: r.variant2 ?? null,
          explanation: r.explanation ?? null,
          wastePct: Number(r.wastePct) || 0, dyeWastagePct: Number(r.dyeWastagePct) || 0,
        };
      }),
    };
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

  // Serial Nos for a new batch — each one the barcode of its card, so never one already issued.
  // Must run inside produce()'s transaction AFTER SERIAL_CODE_LOCK_KEY is taken. Deleted cards
  // count too: their Serial No may still be on a printed label, so it is never handed out again.
  //  - blank: 8-digit numbers continuing after the highest all-digit Serial No;
  //  - "PREFIX####": continues after the highest existing Serial No of that prefix and width
  //    (a template used again keeps counting instead of colliding with its first batch);
  //  - a fixed value: exactly one card.
  private async allocateSerialCodes(tx: Prisma.TransactionClient, template: string | null | undefined, count: number): Promise<string[]> {
    const trimmed = (template ?? '').trim();
    const nextAfter = async (prefix: string, width: number | null) => {
      // SerialCode is the UdtBarcode domain — cast to text for the string functions.
      const digits = width ? Prisma.sql`length("SerialCode"::text) = ${prefix.length + width}::int` : Prisma.sql`length("SerialCode"::text) <= ${SERIAL_CODE_MAX_LENGTH}::int`;
      const rows = await tx.$queryRaw<{ mx: string | null }[]>(Prisma.sql`
        SELECT MAX(substr("SerialCode"::text, ${prefix.length + 1}::int)::numeric)::text as mx FROM "IM_SerialCard"
        WHERE left("SerialCode"::text, ${prefix.length}::int) = ${prefix}::text
          AND substr("SerialCode"::text, ${prefix.length + 1}::int) ~ '^[0-9]+$' AND ${digits}
      `);
      return rows[0]?.mx != null ? BigInt(rows[0].mx) + 1n : 1n;
    };
    let codes: string[];
    if (!trimmed) {
      const start = await nextAfter('', null);
      codes = Array.from({ length: count }, (_, i) => String(start + BigInt(i)).padStart(8, '0'));
    } else {
      const hashMatch = trimmed.match(/#+$/);
      if (!hashMatch) {
        if (count !== 1) {
          throw new BadRequestException('A fixed Serial No (with no "#" digits) can only be used when Serials Count is 1.');
        }
        codes = [trimmed];
      } else {
        const prefix = trimmed.slice(0, trimmed.length - hashMatch[0].length);
        const width = hashMatch[0].length;
        const start = await nextAfter(prefix, width);
        codes = Array.from({ length: count }, (_, i) => `${prefix}${String(start + BigInt(i)).padStart(width, '0')}`);
        if (codes.some((c) => c.length !== prefix.length + width)) {
          throw new BadRequestException(`Serial No template ${trimmed} has no numbers left for ${count} card(s) — use a longer "#" run or another prefix.`);
        }
      }
    }
    const tooLong = codes.find((c) => c.length > SERIAL_CODE_MAX_LENGTH);
    if (tooLong) throw new BadRequestException(`Serial No ${tooLong} is longer than ${SERIAL_CODE_MAX_LENGTH} characters.`);
    const unprintable = codes.find((c) => !BARCODE_SAFE.test(c));
    if (unprintable) {
      throw new BadRequestException(`Serial No "${unprintable}" can't be printed as a barcode — use letters, digits and standard symbols only.`);
    }
    // Case-insensitive, deleted cards included: a barcode must identify one card, ever.
    const collisions = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT "SerialCode" as code FROM "IM_SerialCard" WHERE UPPER("SerialCode") IN (${Prisma.join(codes.map((c) => c.toUpperCase()))})
    `);
    if (collisions.length) {
      throw new ConflictException(`Serial No already exists: ${collisions.map((c) => c.code).join(', ')}`);
    }
    return codes;
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

      // No roll-quantity cap: the cards' combined Quantity may exceed the receipt line's Quantity
      // (rolls are measured as produced). Serial cards are metadata — the receipt line, its
      // quantity and stock are never touched here.

      // Resolve the line's own single variant (see getContext's own comment) — copied onto
      // every generated card, never guessed.
      const variantRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT riv."InventoryVariantId" as id FROM "IM_ReceiptItemVariant" riv
        WHERE riv."InventoryReceiptItemId" = ${inventoryReceiptItemId} AND riv."IsDeleted" = 0
      `);
      const inventoryVariantId = variantRows.length === 1 ? Number(variantRows[0].id) : null;

      // Serial No = barcode. IM_SerialCard has no unique index on SerialCode, so uniqueness is
      // enforced here: the advisory lock serializes every Produce (held until this transaction
      // commits), then allocateSerialCodes picks numbers no card — live or deleted — has used.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SERIAL_CODE_LOCK_KEY})`;
      const codes = await this.allocateSerialCodes(tx, dto.serialNo, dto.count);

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
            ${dto.producerSerialCode ?? null}, ${calendarDate(dto.manufacturingDate)}::timestamp, ${calendarDate(dto.expirationDate)}::timestamp, ${dto.shelfLife ?? null},
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

  // "Assign to Qty" (Serial Cards screen) — for each receipt line the selected cards belong to,
  // the line's REMAINING quantity (its Quantity minus every other live card's Quantity on that
  // line) is split equally across the selected cards of that line: 4-decimal shares, the rounding
  // remainder on the last card, so the line total ends exactly at the receipt line's Quantity.
  // (Produce/Update no longer cap at that Quantity; this action still only distributes what is
  // left of it.) Only IM_SerialCard.Quantity changes; locking and auditing are
  // the same as update()'s. Nothing is written unless every line has something left to assign.
  async assignQuantityEqually(ids: number[], userId: string, companyId: string) {
    const unique = [...new Set((ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!unique.length) throw new BadRequestException('Select at least one serial card.');
    if (unique.length > 500) throw new BadRequestException('Too many serial cards selected (max 500).');

    return this.prisma.$transaction(async (tx) => {
      const cards = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT sc.*, (
          SELECT st."ReceiptItemId" FROM "IM_SerialTransaction" st
          WHERE st."SerialCardId" = sc."RecId" AND st."TransactionType" = ${SERIAL_TXN_TYPE_RECEIPT}
          ORDER BY st."RecId" ASC LIMIT 1
        ) as "receiptItemId"
        FROM "IM_SerialCard" sc WHERE sc."RecId" IN (${Prisma.join(unique)}) AND sc."IsDeleted" = 0
        ORDER BY sc."RecId" ASC
        FOR UPDATE OF sc
      `);
      if (cards.length !== unique.length) throw new NotFoundException('Some selected serial cards no longer exist.');
      const unlinked = cards.filter((c) => c.receiptItemId == null);
      if (unlinked.length) {
        throw new BadRequestException(`Not linked to a receipt line, so there is no quantity to assign: ${unlinked.map((c) => c.SerialCode).join(', ')}`);
      }

      const byLine = new Map<number, any[]>();
      for (const c of cards) {
        const line = Number(c.receiptItemId);
        (byLine.get(line) ?? byLine.set(line, []).get(line)!).push(c);
      }

      const plan: { card: any; quantity: number }[] = [];
      for (const [receiptItemId, lineCards] of byLine) {
        const lineRows = await tx.$queryRaw<any[]>(Prisma.sql`
          SELECT ri."Quantity" as "lineQuantity", r."ReceiptNo" as "receiptNo",
            COALESCE((
              SELECT SUM(sc."Quantity") FROM "IM_SerialTransaction" st
              JOIN "IM_SerialCard" sc ON sc."RecId" = st."SerialCardId" AND sc."IsDeleted" = 0
              WHERE st."ReceiptItemId" = ri."RecId" AND st."TransactionType" = ${SERIAL_TXN_TYPE_RECEIPT}
                AND sc."RecId" NOT IN (${Prisma.join(lineCards.map((c) => Number(c.RecId)))})
            ), 0) as "otherSum"
          FROM "IM_ReceiptItem" ri JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"
          WHERE ri."RecId" = ${receiptItemId}
          FOR UPDATE OF ri
        `);
        const line = lineRows[0];
        if (!line) throw new NotFoundException('Receipt line not found.');
        const remaining = Math.round((Number(line.lineQuantity) - Number(line.otherSum)) * 1e4) / 1e4;
        if (!(remaining > 0)) {
          throw new ConflictException(
            `Receipt ${line.receiptNo ?? ''} line has no unassigned quantity left (line ${Number(line.lineQuantity)}, already on other cards ${Number(line.otherSum)}).`,
          );
        }
        const share = Math.floor((remaining / lineCards.length) * 1e4) / 1e4;
        lineCards.forEach((card, i) => {
          const quantity = i === lineCards.length - 1 ? Math.round((remaining - share * (lineCards.length - 1)) * 1e4) / 1e4 : share;
          plan.push({ card, quantity });
        });
      }

      const results: any[] = [];
      for (const { card, quantity } of plan) {
        await tx.$executeRaw`
          UPDATE "IM_SerialCard" SET "Quantity" = ${quantity}, "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
          WHERE "RecId" = ${card.RecId}
        `;
        const afterRows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "IM_SerialCard" WHERE "RecId" = ${card.RecId}`);
        const after = sanitizeRawRow(afterRows[0]);
        const { receiptItemId, ...beforeRow } = card;
        const before = sanitizeRawRow(beforeRow);
        if (hasRealChanges(before, after, ['UpdatedAt', 'UpdatedBy'])) {
          const ctxRows = await tx.$queryRaw<any[]>(Prisma.sql`
            SELECT r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType"
            FROM "IM_ReceiptItem" ri JOIN "IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId" WHERE ri."RecId" = ${receiptItemId}
          `);
          await this.audit.record({
            userId, companyId, screenKey: ctxRows[0] ? screenKeyFor(Number(ctxRows[0].receiptType)) : null,
            entityType: 'SerialCard', entityId: String(card.RecId), action: AUDIT_ACTIONS.UPDATE,
            documentNo: after.SerialCode,
            parentEntityType: 'InventoryReceiptItem', parentEntityId: String(receiptItemId),
            parentDocumentNo: ctxRows[0]?.receiptNo ?? null,
            before, after,
          }, tx);
        }
        results.push(after);
      }
      return results;
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

        // No roll-quantity cap (same as produce()): a card's Quantity may take the line's total
        // past the receipt line's Quantity. SerialCode is never written here, so a card's
        // barcode survives every edit.

        await tx.$executeRaw`
          UPDATE "IM_SerialCard" SET
            "Explanation" = ${dto.explanation ?? null},
            "PartyNo" = ${dto.partyNo ?? null},
            "QualityTypeId" = ${dto.qualityTypeId ?? null},
            "ResourceId" = ${dto.resourceId ?? null},
            "EmployeeId" = ${dto.employeeId ?? null},
            "CurrentAccountId" = ${dto.currentAccountId ?? null},
            "ProducerSerialCode" = ${dto.producerSerialCode ?? null},
            "ManufacturingDate" = ${calendarDate(dto.manufacturingDate)}::timestamp,
            "ExpirationDate" = ${calendarDate(dto.expirationDate)}::timestamp,
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
