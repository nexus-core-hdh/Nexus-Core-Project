import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { assertAllNonNegative } from './numeric-guards.util';

// Work Order — NOT a new entity. MA_WorkOrder/MA_WorkOrderItem/MA_WorkOrderItemVariant are
// already-existing, already-migrated legacy tables (confirmed via information_schema: 161/100/21
// real columns respectively, 0 rows — first writer, not a duplicate of anything). This is the
// exact same "raw SQL against a pre-existing legacy table, curated column subset" convention
// fabric-card.service.ts/purchase-order.service.ts already use — no schema change, no migration.
const HEADER_TABLE = 'MA_WorkOrder';
const ITEM_TABLE = 'MA_WorkOrderItem';
const ITEM_VARIANT_TABLE = 'MA_WorkOrderItemVariant';

// Curated subset of MA_WorkOrder's 161 real columns — only the ones the reference screen's own
// General tab needs (Order No, Date, Customer, Brand, Delivery/A.Delivery/Planned/Shipment dates,
// Quantity, Closed, Sample, Revision #, Reason of Revision). UD_Brands is plain free text on this
// table (confirmed via information_schema — character varying, no FK) — no existing Brand master/
// lookup exists anywhere in this codebase (grepped legacy-master-lookup.service.ts's TABLES map),
// so Brand is a plain text field bound to it, not a new lookup component.
// Detail tab (added later) — 26 more real MA_WorkOrder columns, all confirmed live via
// information_schema + pg_catalog FK constraints before adding (see work-order.controller.ts's
// git history / the session's own inspection): SpecialCode/CustomerOrderNo are the HEADER-level
// columns, distinct from MA_WorkOrderItem's own per-style-row SpecialCode/CustomerOrderNo already
// used on the Style Info grid — same names, two different real tables, not a duplicate. Quantity2
// is a best-effort mapping for "Cutting Extra" (no column literally named that exists).
// ProductionColorCumulativeType maps "Color Based Manufacturing" and RowColor maps "Main Color
// Column" — both best-effort by name proximity, documented in the frontend where they're bound.
// FactoryId/BrokerId both FK into FI_Account (the same table CurrentAccountId/Customer already
// uses) — Factory and Commissioner are Account records, not separate masters.
const DETAIL_COLUMNS = [
  'SpecialCode', 'CustomerOrderNo', 'Quantity2', 'CmtPrice', 'CmtForexId',
  'WarehouseId', 'FactoryId', 'CountryId', 'EmployeeId', 'Status', 'SeasonCode',
  'ProductionColorCumulativeType', 'RowColor', 'ProductionCertificates', 'CertificationId', 'InitialCostId',
  'ProjectId', 'BrokerId', 'ComissionPercent', 'GeneralExpensePercent',
  'DiscountAmount', 'DiscountType', 'IsItemDiscount', 'TypeOfShipment',
  'HandoverDate', 'CuttingApprovedDate',
] as const;

export const HEADER_COLUMNS = [
  'WorkOrderNo', 'WorkOrderDate', 'IsClosed', 'IsSample',
  'CurrentAccountId', 'UD_Brands',
  'DeliveryDate', 'AgreedDeliveryDate', 'PlanDate', 'ShipmentDate',
  'Quantity', 'UD_SampleRevision', 'UD_reasonOfRevision', 'Explanation',
  ...DETAIL_COLUMNS,
  // "Create Order" from a Style Card (PLM) — the genuine, durable link back to the real Prisma
  // StyleCard this Work Order was created for. Previously no such column existed anywhere on
  // MA_WorkOrder/MA_WorkOrderItem (confirmed via information_schema — see this migration's own
  // comment), so Style selection on this screen was in-memory/display-only and never survived a
  // reload ("Global Rule #5", work-orders/page.tsx). A real nullable TEXT column + FK constraint
  // to "StyleCard"("id") — added in migration 20260908092625_add_style_card_link_to_work_order —
  // is the minimal new storage for this; it plugs into the exact same generic column
  // read/write/coerce pipeline every other HEADER_COLUMNS entry already uses below, so create()/
  // update()/get()/list() all support it with zero new per-field code.
  'StyleCardId',
] as const;

// Style Info grid — curated subset of MA_WorkOrderItem's 100 real columns. InventoryId is the
// same generic "which IM_Item" reference every other card in this app already uses (Fabric/Trim/
// Yarn Card), but IM_Item.AccessCode in this migrated DB only has FABRIC/TRIM/YARN values today
// (confirmed via a live DISTINCT query) — no "STYLE" access code exists, so this column is real
// and reused, but currently has no master data to resolve a name against. RouteId has no existing
// Route master/lookup anywhere in this codebase (grepped) so it's a plain numeric reference, not a
// resolved name. Forex/ForexUnitPrice/UnitPrice reuse the existing 'forex' master lookup
// (legacy-master-lookup.service.ts) — the same one Purchase Order's own Forex column already
// uses. "Packaging" has no matching column on this table; PackageQuantity is the closest existing
// field and is used for it, reported as a best-effort mapping, not an exact one. This table has
// no literal "DeliveryDate" column (confirmed live — 42703 undefined column error caught this);
// ShipmentDate is the closest existing date field and is used for it instead.
export const ITEM_COLUMNS = [
  'ItemOrderNo', 'InventoryId', 'Explanation', 'SpecialCode',
  'RouteId', 'ForexId', 'ForexUnitPrice', 'UnitPrice', 'PackageQuantity',
  'CustomerOrderNo', 'PartOrderNo', 'ShipmentDate',
] as const;

// Manufacturing Quantities grid — MA_WorkOrderItemVariant, the real one-to-many Color/Size
// breakdown child of a WorkOrderItem line (confirmed via information_schema — 21 real columns,
// InventoryVariantId already FKs into IM_ItemVariant, the exact same per-item variant-combination
// table Purchase Order's own Color/Size breakdown already resolves through). No StyleCard-sourced
// Style has a real IM_ItemVariant Color×Size matrix (no "STYLE" AccessCode exists in this DB), so
// InventoryVariantId is left unresolved here; Color and Size are instead encoded together into
// the existing Explanation column as "Color‖Size" (client-side convention only, no schema
// change), AdditionalQuantity is reused for "Cutting/Manufacturing Surplus", and Barcode is
// reused as the closest existing free-text field for "Lot" — all genuinely-existing columns,
// documented here since their reuse isn't self-evident from the name alone.
export const ITEM_VARIANT_COLUMNS = ['InventoryVariantId', 'Explanation', 'Quantity', 'UnitPrice', 'AdditionalQuantity', 'Barcode'] as const;

// Work Order BOM (Fabric/Trim/Ornament/Process) — MA_Recipe (header) + MA_RecipeItem (lines), the
// real pre-existing legacy Recipe/BOM master (confirmed via information_schema: 106/106 columns,
// 0 rows — first writer). MA_Recipe.WorkOrderId is a genuine existing bigint FK column already
// linking a Recipe header to a Work Order — not an invented bridge. One MA_Recipe header row per
// (WorkOrderId, RecipeType); RecipeType has no lookup/enum table in this migrated schema (same
// undocumented-smallint convention as ReceiptType/ItemType elsewhere in this codebase), so this
// service assigns its own documented convention below rather than inventing a new master table.
export const BOM_LINE_TYPES = ['fabric', 'trim', 'ornament', 'process'] as const;
export type BomLineType = (typeof BOM_LINE_TYPES)[number];
const RECIPE_TYPE_BY_LINE_TYPE: Record<BomLineType, number> = { fabric: 1, trim: 2, ornament: 3, process: 4 };

// Curated subset of MA_RecipeItem's 106 real columns, matched 1:1 to the SAME columns the
// existing, canonical BOM implementation (plm/style-cards/[id]/_components/bom-tab.tsx's BomTab,
// reused as-is by both Style Card and Sample Card) already uses against StyleBomLine — Work
// Order's BOM tab mounts that exact component in "workOrder" mode, so its column set must persist
// through here. Fabric Code/Name/Unit text resolve live from InventoryId/UnitId (same as every
// other Fabric/Trim lookup in this app — no denormalized copy needed). "Process" has no free-text
// column on this table (ProcessId is a numeric legacy FK with no matching lookup master anywhere
// in this codebase) — UD_Remarks (a generic, otherwise-unused free-text column) is repurposed to
// carry it instead, matching this session's established "reuse the closest existing generic
// column, documented" convention (see AdditionalQuantity/Barcode on MA_WorkOrderItemVariant).
// "Row/Column" has no matching column at all and stays genuinely unsupported. Waste %/Dye
// Wastage %/Other Wastage % are three separate BomTab fields but only one `Wastage` column exists
// here — BomTab's Work Order mode persists their COMBINED total into it (Calculated Qty/Total
// Waste % survive a reload exactly; only the 3-way split doesn't). IsMaster maps "Main Fabric",
// IsCutting maps "Will be Cut". MarkerWidth/MarkerLength/M2Weight back BomTab's Market
// Width/Length/Weight — real columns here, unlike StyleBomLine which has none for them.
export const RECIPE_ITEM_COLUMNS = [
  'InventoryId', 'Explanation', 'Variant1', 'Variant2', 'IsCutting', 'IsMaster',
  'UnitId', 'Quantity', 'MarkerWidth', 'MarkerLength', 'M2Weight',
  'UD_Dia', 'UD_Guage', 'UD_FinishWidth', 'UD_FinishRoute', 'UD_Revision', 'UD_Component', 'UD_Placement', 'UD_Remarks',
  'Price', 'ForexId', 'ColorCardId', 'Wastage',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_SELECT = Prisma.raw(['"RecId" as id', '"WorkOrderId" as "workOrderId"', ...ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const ITEM_VARIANT_SELECT = Prisma.raw(['"RecId" as id', '"WorkOrderItemId" as "workOrderItemId"', ...ITEM_VARIANT_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
const RECIPE_ITEM_SELECT = Prisma.raw(['"RecId" as id', '"RecipeId" as "recipeId"', ...RECIPE_ITEM_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

@Injectable()
export class WorkOrderService {
  constructor(private readonly prisma: PrismaService) {}

  private async headerToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, HEADER_TABLE));
  }
  private async itemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_TABLE));
  }
  private async itemVariantToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, ITEM_VARIANT_TABLE));
  }

  // `styleCardId` — additive optional filter (Style Card's own Order Info tab: "the relevant
  // Work Order(s) associated with that Style Card"), reusing this same list() rather than a
  // second method/route. Omitted entirely, existing callers (work-orders-list/page.tsx's own
  // search box) are byte-for-byte unaffected.
  async list(search?: string, styleCardId?: string) {
    const searchFilter = search ? Prisma.sql`AND "WorkOrderNo" ILIKE ${`%${search}%`}` : Prisma.sql``;
    const styleFilter = styleCardId ? Prisma.sql`AND "StyleCardId" = ${styleCardId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MA_WorkOrder"
      WHERE "IsDeleted" = 0 ${searchFilter} ${styleFilter}
      ORDER BY "WorkOrderNo" DESC LIMIT 50
    `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "MA_WorkOrder" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Work order not found');
    return sanitizeRawRow(rows[0]);
  }

  async nextWorkOrderNo(): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "WorkOrderNo" as code FROM "MA_WorkOrder"
      WHERE "WorkOrderNo" ~ '^W/O-[0-9]+$'
      ORDER BY (regexp_replace("WorkOrderNo", '^W/O-', ''))::int DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `W/O-${String(next).padStart(6, '0')}`;
  }

  private async assertWorkOrderNoAvailable(workOrderNo: string, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" FROM "MA_WorkOrder" WHERE "IsDeleted" = 0 AND LOWER("WorkOrderNo") = LOWER(${workOrderNo}) ${exclude}
    `);
    if (rows.length) throw new ConflictException('A work order already exists with this number.');
  }

  // Header-level normal business quantities/values — none of these has a legitimate signed
  // meaning on MA_WorkOrder (unlike FI_Receipt's Debit/Credit or IM_Receipt's ReceiptType-shared
  // Quantity — see numeric-guards.util.ts's own comment). Quantity2 is "Extra Cutting %" (the
  // Will Be Cut feature — a negative Extra Cutting % would silently round production quantities
  // DOWN below what was actually produced, the same class of bug as the screenshot's -1).
  private assertHeaderQuantitiesNonNegative(source: Record<string, any>) {
    assertAllNonNegative({
      Quantity: source.quantity, 'Extra Cutting %': source.quantity2, 'CMT Price': source.cmtPrice,
      'Commission %': source.comissionPercent, 'General Expense %': source.generalExpensePercent,
      'Discount Amount': source.discountAmount,
    });
  }

  async create(dto: Record<string, any>, userId: number) {
    this.assertHeaderQuantitiesNonNegative(dto);
    const toDb = await this.headerToDb();
    const manualNo = String(dto.workOrderNo ?? '').trim();
    const workOrderNo = manualNo || (await this.nextWorkOrderNo());
    if (manualNo) await this.assertWorkOrderNoAvailable(manualNo);
    const effective = { ...dto, workOrderNo };
    const cols = HEADER_COLUMNS.filter((c) => c !== 'WorkOrderNo' && toDb(c, effective[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', '"WorkOrderNo"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, effective[camel(c)]));
    // Prisma.join([]) on zero optional columns would leave a dangling ", ," in the VALUES list —
    // this middle segment is only included at all when there's actually something to join.
    const valuesMiddle = values.length ? Prisma.sql`${Prisma.join(values)}, ` : Prisma.sql``;
    try {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO "MA_WorkOrder" (${colList})
        VALUES (1, 1, ${workOrderNo}, ${valuesMiddle}now(), ${userId}, 0, gen_random_uuid())
        RETURNING ${HEADER_SELECT}
      `);
      return sanitizeRawRow(rows[0]);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('23505') && msg.includes('WorkOrderNo')) throw new ConflictException('A work order already exists with this number.');
      throw err;
    }
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    this.assertHeaderQuantitiesNonNegative(dto);
    const toDb = await this.headerToDb();
    const cols = HEADER_COLUMNS.filter((c) => c !== 'WorkOrderNo' && toDb(c, dto[camel(c)]) !== undefined);
    // WorkOrderNo ("Edit Code") is handled separately from the generic column loop above — it's
    // the one column create() already treats specially (auto-generated vs. manual), and the same
    // existing uniqueness guard (assertWorkOrderNoAvailable, already used by create()) applies
    // here too, just with excludeId so the record's own current number doesn't conflict with
    // itself. Not a new validation mechanism — the helper already existed, just wasn't wired into
    // update() before.
    const newNo = typeof dto.workOrderNo === 'string' ? dto.workOrderNo.trim() : undefined;
    if (newNo) await this.assertWorkOrderNoAvailable(newNo, id);
    const codeAssignment = newNo ? [Prisma.sql`"WorkOrderNo" = ${newNo}`] : [];
    if (!cols.length && !codeAssignment.length) return this.get(id);
    const assignments = Prisma.join([...codeAssignment, ...cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`)]);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "MA_WorkOrder" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "MA_WorkOrder" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }

  // Style Info lines (MA_WorkOrderItem) — replace-all per save, same pattern
  // style-extras.service.ts's own upsertBomLines already uses for StyleBomLine.
  async listItems(workOrderId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_SELECT} FROM "MA_WorkOrderItem" WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0 ORDER BY "ItemOrderNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async upsertItems(workOrderId: number, lines: any[], userId: number) {
    await this.get(workOrderId);
    const toDb = await this.itemToDb();
    await this.prisma.$executeRaw`UPDATE "MA_WorkOrderItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "WorkOrderId" = ${workOrderId} AND "IsDeleted" = 0`;
    for (const [i, line] of (lines || []).entries()) {
      const effective = { ...line, itemOrderNo: line.itemOrderNo ?? i + 1 };
      assertAllNonNegative({ 'Unit Price': effective.unitPrice, 'Forex Unit Price': effective.forexUnitPrice, 'Packaging': effective.packageQuantity });
      const cols = ITEM_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      if (!cols.length) continue;
      const colList = Prisma.raw(['"WorkOrderId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MA_WorkOrderItem" (${colList}) VALUES (${workOrderId}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      `);
    }
    return this.listItems(workOrderId);
  }

  // Manufacturing Quantities (MA_WorkOrderItemVariant) — child of the primary Style Info line
  // (workOrderItemId). Same replace-all pattern as items above.
  async listItemVariants(workOrderItemId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ITEM_VARIANT_SELECT} FROM "MA_WorkOrderItemVariant" WHERE "WorkOrderItemId" = ${workOrderItemId} AND "IsDeleted" = 0 ORDER BY "SubNo", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async upsertItemVariants(workOrderItemId: number, lines: any[], userId: number) {
    const toDb = await this.itemVariantToDb();
    await this.prisma.$executeRaw`UPDATE "MA_WorkOrderItemVariant" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "WorkOrderItemId" = ${workOrderItemId} AND "IsDeleted" = 0`;
    for (const [i, line] of (lines || []).entries()) {
      const effective = { ...line, subNo: line.subNo ?? i + 1 };
      // Manufacturing Quantities — the exact field family the screenshot's -1 bug came from
      // (Quantity, per Color+Size). AdditionalQuantity is "Cutting/Mfg Surplus" — also always a
      // magnitude, never a signed adjustment, on this table.
      assertAllNonNegative({ Quantity: effective.quantity, 'Cutting/Mfg Surplus': effective.additionalQuantity, 'Unit Price': effective.unitPrice });
      const cols = ITEM_VARIANT_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      if (!cols.length) continue;
      const colList = Prisma.raw(['"WorkOrderItemId"', '"SubNo"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MA_WorkOrderItemVariant" (${colList}) VALUES (${workOrderItemId}, ${effective.subNo}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      `);
    }
    return this.listItemVariants(workOrderItemId);
  }

  // ── BOM (Fabric/Trim/Ornament/Process) — MA_Recipe + MA_RecipeItem ──────────────────────────

  private async recipeItemToDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, 'MA_RecipeItem'));
  }

  private async findRecipeHeader(workOrderId: number, lineType: BomLineType) {
    const recipeType = RECIPE_TYPE_BY_LINE_TYPE[lineType];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id FROM "MA_Recipe"
      WHERE "WorkOrderId" = ${workOrderId} AND "RecipeType" = ${recipeType} AND "IsDeleted" = 0
      LIMIT 1
    `);
    return rows[0]?.id as number | undefined;
  }

  private async getOrCreateRecipeHeader(workOrderId: number, lineType: BomLineType, userId: number) {
    const existing = await this.findRecipeHeader(workOrderId, lineType);
    if (existing) return existing;
    const recipeType = RECIPE_TYPE_BY_LINE_TYPE[lineType];
    const recipeCode = `WO${workOrderId}-${lineType.toUpperCase()}`;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "MA_Recipe" ("CompanyId", "WorkplaceId", "WorkOrderId", "RecipeType", "RecipeCode", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
      VALUES (1, 1, ${workOrderId}, ${recipeType}, ${recipeCode}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id
    `);
    return rows[0].id as number;
  }

  async listBom(workOrderId: number, lineType: BomLineType) {
    const recipeId = await this.findRecipeHeader(workOrderId, lineType);
    if (!recipeId) return [];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${RECIPE_ITEM_SELECT} FROM "MA_RecipeItem" WHERE "RecipeId" = ${recipeId} AND "IsDeleted" = 0 ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async upsertBom(workOrderId: number, lineType: BomLineType, lines: any[], userId: number) {
    await this.get(workOrderId);
    const recipeId = await this.getOrCreateRecipeHeader(workOrderId, lineType, userId);
    const toDb = await this.recipeItemToDb();
    await this.prisma.$executeRaw`UPDATE "MA_RecipeItem" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecipeId" = ${recipeId} AND "IsDeleted" = 0`;
    const recipeType = RECIPE_TYPE_BY_LINE_TYPE[lineType];
    for (const line of lines || []) {
      // BOM/Recipe line quantities — Consumption (Quantity), Marker dimensions, Weight and
      // Wastage % are all magnitudes with no signed meaning on MA_RecipeItem; Price is an
      // ordinary per-unit cost here (no discount/adjustment feature exists on a BOM line).
      assertAllNonNegative({
        Quantity: line.quantity, 'Marker Width': line.markerWidth, 'Marker Length': line.markerLength,
        'M2 Weight': line.m2Weight, Wastage: line.wastage, Price: line.price,
      });
      const cols = RECIPE_ITEM_COLUMNS.filter((c) => toDb(c, line[camel(c)]) !== undefined);
      if (!cols.length) continue;
      const colList = Prisma.raw(['"RecipeId"', '"RecipeType"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, line[camel(c)]));
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MA_RecipeItem" (${colList}) VALUES (${recipeId}, ${recipeType}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      `);
    }
    return this.listBom(workOrderId, lineType);
  }

  // "Transfer from Style Card" — reads the EXISTING StyleBomLine rows for the selected Style
  // (Prisma-native, same table style-extras.service.ts already reads/writes for the Style Card's
  // own BOM tab) and copies them into this Work Order's OWN MA_RecipeItem rows. This is a one-way
  // copy: the Work Order's copy is then independently editable and never writes back to
  // StyleBomLine/StyleCard, satisfying "Work Order BOM is a Work-Order-specific COPY".
  // Key names here must match camel(col) exactly (upsertBom looks each column up via
  // line[camel(c)]) — a UD_ column camelizes to "uD_Xxx" (first char lowercased, rest untouched),
  // not "udXxx". Extracted out of transferBomFromStyleCard so transferBomFromStyleCardForType
  // (fabric-yarn-requirements.service.ts's own per-line Material Color edit) can reuse the exact
  // same field mapping for a single lineType instead of duplicating this list.
  private styleLineToRecipeLine(l: any) {
    return {
      inventoryId: l.fabricInventoryId ?? undefined,
      explanation: l.explanation ?? undefined,
      variant1: l.variant ?? undefined,
      isCutting: l.willBeCut ? 1 : 0,
      isMaster: l.mainFabric ? 1 : 0,
      unitId: l.unitId ?? undefined,
      quantity: l.quantity ?? undefined,
      price: l.unitPrice ?? undefined,
      colorCardId: l.colorCardId ?? undefined,
      // StyleBomLine's 3-way wastePct/dyeWastagePct/otherWastagePct combine into MA_RecipeItem's
      // single Wastage column — same non-compound sum this component's own applyWaste() uses
      // (matches how BomTab's own Work Order save path combines them client-side too).
      wastage: (Number(l.wastePct) || 0) + (Number(l.dyeWastagePct) || 0) + (Number(l.otherWastagePct) || 0),
      uD_Component: l.component ?? undefined,
      uD_Dia: l.dia ?? undefined,
      uD_Guage: l.gauge ?? undefined,
      uD_FinishWidth: l.finishWidth ?? undefined,
      uD_FinishRoute: l.finishRoute ?? undefined,
      uD_Revision: l.revision ?? undefined,
      uD_Placement: l.placement ?? undefined,
      uD_Remarks: l.process ?? undefined, // Process has no free-text column here — see RECIPE_ITEM_COLUMNS' own comment
      // MarkerWidth/MarkerLength/M2Weight are NOT transferred — StyleBomLine has no columns
      // for them at all (they're calculator-only inputs in StyleCard mode), so there is
      // nothing to copy; a Work Order user re-enters them directly if needed.
    };
  }

  // Matches fabric-yarn-requirements.service.ts's/work-orders/page.tsx's own COLOR_SIZE_SEP
  // exactly — the existing client-side convention encoding Manufacturing Quantities' Color+Size
  // into MA_WorkOrderItemVariant.Explanation.
  private static readonly COLOR_SIZE_SEP = '‖';

  // This Work Order's own real, saved Production Colors (Manufacturing Quantities), in the order
  // each first appears — never invented, never a Style Card colorway. Used to CYCLE a multi-color
  // Style BOM material's own colors across those rows both at transfer time (see
  // assignProductionColorCycle below) AND, not private, by
  // fabric-yarn-requirements.service.ts's own getStyleCardBomLinesAsWorkOrderShape() — the exact
  // same formula work-orders/page.tsx's own loadBomMaterialGroups already uses for its C/S Details
  // material-column DISPLAY cycling, reused (never re-implemented a second time) so the LIVE
  // Requirements preview (before any Style Card line has actually been promoted/saved into the
  // Work Order's own BOM) resolves each line to the exact same Production Color scope the real,
  // persisted line would carry the moment a user edits/transfers it — see that method's own
  // comment for the full reasoning.
  async resolveProductionColors(workOrderId: number): Promise<string[]> {
    const items = await this.listItems(workOrderId);
    const primaryItemId = items[0]?.id;
    if (primaryItemId == null) return [];
    const variants = await this.listItemVariants(primaryItemId);
    const seen = new Set<string>();
    const colors: string[] = [];
    for (const v of variants as any[]) {
      const [colorRaw] = String(v.explanation || '').split(WorkOrderService.COLOR_SIZE_SEP);
      const color = colorRaw.trim();
      if (color && !seen.has(color.toLowerCase())) { seen.add(color.toLowerCase()); colors.push(color); }
    }
    return colors;
  }

  // A Style BOM material that was given several Material Colors (bom-tab.tsx's own multi-select —
  // saved as several sibling StyleBomLine rows sharing the same Variant-1/material identity, one
  // per color) has, until now, transferred into the Work Order with every one of those lines'
  // own Variant-2 left null — meaning Requirements calculation had no way to attribute each
  // color-specific line to its own Production Color, and fell back to the WHOLE Work Order's
  // total for all of them (the existing, correct "no Variant-2 = applies to every color" rule —
  // just triggered here by missing data, not a real "common material"). Fixes that at the moment
  // of transfer: within each material (grouped the same way loadBomMaterialGroups groups C/S
  // Details' own material columns — Variant-1 text, or the linked Fabric/Trim Card id when
  // Variant-1 is blank), a material with MORE THAN ONE distinct Material Color gets each of its
  // own lines' Variant-2 cycled across this Work Order's real Production Colors by position
  // (Nth distinct color -> Nth Production Color, wrapping if there are more colors than rows) —
  // the identical rule already used for display-only cycling, now actually persisted. A material
  // with only one color (or none) is untouched — it stays a genuine "common" line applying to
  // every color, exactly as before. Not private — see resolveProductionColors' own comment on the
  // other reuse site (fabric-yarn-requirements.service.ts's live Style-Card-fallback preview).
  assignProductionColorCycle(lines: any[], productionColors: string[]): any[] {
    if (!productionColors.length) return lines;
    const byMaterial = new Map<string, any[]>();
    for (const l of lines) {
      const v1 = String(l.variant1 || '').trim();
      const key = v1 ? `variant:${v1.toLowerCase()}` : `card:${l.inventoryId ?? 'none'}`;
      (byMaterial.get(key) ?? byMaterial.set(key, []).get(key)!).push(l);
    }
    for (const groupLines of byMaterial.values()) {
      const distinctColorCount = new Set(groupLines.map((l) => l.colorCardId).filter(Boolean)).size;
      if (distinctColorCount <= 1) continue; // genuine common material — leave Variant-2 as-is (null)
      groupLines.forEach((l, idx) => { l.variant2 = productionColors[idx % productionColors.length]; });
    }
    return lines;
  }

  async transferBomFromStyleCard(workOrderId: number, styleCardId: string, userId: number) {
    await this.get(workOrderId);
    const [styleLines, productionColors] = await Promise.all([
      this.prisma.styleBomLine.findMany({ where: { styleCardId } }),
      this.resolveProductionColors(workOrderId),
    ]);
    const result: Record<string, any[]> = {};
    for (const lineType of BOM_LINE_TYPES) {
      const lines = this.assignProductionColorCycle(
        styleLines.filter((l) => l.lineType === lineType).map((l) => this.styleLineToRecipeLine(l)),
        productionColors,
      );
      result[lineType] = await this.upsertBom(workOrderId, lineType, lines, userId);
    }
    return result;
  }

  // Scoped, single-lineType version of the above — transfers ONLY the given lineType's Style BOM
  // lines into the Work Order's own real BOM, never touching the other three types (a full
  // transferBomFromStyleCard() would silently overwrite an already-owned Trim/Ornament/Process
  // BOM the user separately edited, just because Fabric needed to be promoted). Used by
  // fabric-yarn-requirements.service.ts's setMaterialColorForLine() to implicitly promote a
  // Style-Card-fallback Requirements row into a real, independently-editable BOM line the moment
  // its Material Color is changed — the same "first edit promotes the fallback" rule the Work
  // Order's own C/S Details material columns already apply. Ordered by StyleBomLine's own
  // sortOrder so the Nth line here is always the Nth line resolveBomLines()/getMaterialRequirements
  // would have shown, letting the caller match a clicked row back to its newly-created own line by
  // position.
  async transferBomFromStyleCardForType(workOrderId: number, styleCardId: string, lineType: BomLineType, userId: number) {
    await this.get(workOrderId);
    const [styleLines, productionColors] = await Promise.all([
      this.prisma.styleBomLine.findMany({ where: { styleCardId, lineType }, orderBy: { sortOrder: 'asc' } }),
      this.resolveProductionColors(workOrderId),
    ]);
    // assignProductionColorCycle only ever mutates each line's own `variant2` in place — array
    // order (and therefore position, which the caller's own implicit-promotion matching depends
    // on) is completely unchanged.
    const lines = this.assignProductionColorCycle(styleLines.map((l) => this.styleLineToRecipeLine(l)), productionColors);
    return this.upsertBom(workOrderId, lineType, lines, userId);
  }
}
