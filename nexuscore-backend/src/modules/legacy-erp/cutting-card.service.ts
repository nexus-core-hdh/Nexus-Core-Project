import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkOrderService, WORK_ORDER_SCREEN_KEY } from './work-order.service';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { AuditService, AUDIT_ACTIONS, hasRealChanges, enrichDisplayRefs, FkResolver } from '../audit/audit.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';
import { assertNonNegative, assertAllNonNegative } from './numeric-guards.util';

// Matches work-order.service.ts's/fabric-yarn-requirements.service.ts's own COLOR_SIZE_SEP exactly
// — the existing client-side convention that already encodes Manufacturing Quantities' Color+Size
// into MA_WorkOrderItemVariant.Explanation. Do not diverge from this separator.
const COLOR_SIZE_SEP = '‖';

export interface CuttingCardSizeRow {
  sizeCode: string;
  orderQty: number;
  willBeCutQty: number;
  cutQty: number;
  less: number;
  over: number;
}

export interface ColorMatrixRow {
  color: string;
  bySize: Record<string, { orderQty: number; willBeCutQty: number }>;
  total: { orderQty: number; willBeCutQty: number };
}

export interface ApplicableFabric {
  materialKey: string;
  materialLabel: string;
  inventoryId: number | null;
  inventoryCode: string | null;
  inventoryName: string | null;
  variant1: string | null;
  variant2: string | null;
  colorCardId: string | null;
  colorCode: string | null;
  colorName: string | null;
  wastage: number;
  markerWidth: number | null;
  markerLength: number | null;
  m2Weight: number | null;
}

// Cutting Card / Cutting Entry — persisted per (Work Order, Production Color, Fabric). Order Qty
// and Will-Be-Cut Qty are NEVER stored: both are recomputed on every read from the Work Order's
// own already-authoritative sources (MA_WorkOrderItemVariant + the existing willBeCutQty()
// formula, duplicated byte-for-byte from fabric-yarn-requirements.service.ts so this can never
// silently disagree with Will Cut Qty/Requirements calculations elsewhere in the app). Only the
// genuinely new figure — the actual entered Cut Qty per Size, per Fabric — is persisted
// (CuttingCardSize, under one CuttingCard row per Work Order + Color + Fabric).
//
// Fabric identity: `materialKey`, the SAME `${lineType}:variant:<variant1 lowercased>` /
// `${lineType}:card:<inventoryId>` formula work-orders/page.tsx's own loadBomMaterialGroups (C/S
// Details material columns) already groups by — not a new identity scheme, just applied here too
// so a Work Order's "MAIN FAB" means the same thing on both screens.
@Injectable()
export class CuttingCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrderSvc: WorkOrderService,
    private readonly fabricYarnSvc: FabricYarnRequirementsService,
    private readonly masterLookup: LegacyMasterLookupService,
    private readonly audit: AuditService,
  ) {}

  // ── Audit ────────────────────────────────────────────────────────────────────────────────
  // A Cutting Card belongs to a Work Order (a tab/sub-screen of it, same as Requirements), so its
  // events reuse WORK_ORDER_SCREEN_KEY exactly like fabric-yarn-requirements.service.ts does —
  // Module/Menu resolve automatically once a real Work Order MenuItem exists (none does today, so
  // they stay empty rather than being fabricated). The lazy get-or-create of the empty card shell
  // on first open is deliberately NOT audited: it is a read-triggered placeholder with no user
  // data; the first real change (Detail save / Entry add) is what gets recorded.
  private displayResolvers(): Record<string, FkResolver> {
    return { factoryId: (id) => this.masterLookup.getById('current-account', Number(id), { includeInactive: true }) };
  }

  private async workOrderNo(workOrderId: number): Promise<string | null> {
    const wo = await this.workOrderSvc.get(workOrderId).catch(() => null);
    return (wo as any)?.workOrderNo ?? null;
  }

  private entrySnapshot(entry: any) {
    const sizes: Record<string, number> = {};
    for (const sz of entry.sizes ?? []) sizes[sz.sizeCode] = Number(sz.quantity);
    return { id: entry.id, cuttingCardId: entry.cuttingCardId, date: entry.date, factoryId: entry.factoryId, partyNo: entry.partyNo, document: entry.document, explanation: entry.explanation, sizes };
  }

  private async loadEntry(entryId: string) {
    const e = await this.prisma.cuttingCardEntry.findUnique({ where: { id: entryId }, include: { sizes: true } });
    return e ? enrichDisplayRefs(this.entrySnapshot(e), this.displayResolvers()) : null;
  }

  private async auditEntry(
    action: string, workOrderId: number, cardId: string, entryId: string, before: any, after: any, userId?: string, companyId?: string,
  ) {
    if (!userId || !companyId) return;
    const section = 'Cutting Entry (CuttingCardEntry)';
    const woNo = await this.workOrderNo(workOrderId);
    await this.audit.recordSafe({
      userId, companyId, screenKey: WORK_ORDER_SCREEN_KEY,
      entityType: 'CuttingCardEntry', entityId: entryId, action,
      documentNo: woNo,
      parentEntityType: 'CuttingCard', parentEntityId: cardId, parentDocumentNo: woNo,
      ...(before ? { before: { [section]: before } } : {}), ...(after ? { after: { [section]: after } } : {}),
    });
  }

  // Byte-for-byte copy of fabric-yarn-requirements.service.ts's own willBeCutQty() — see that
  // file's comment for why this must stay a private per-call copy, not a shared import: rounding
  // is applied PER SIZE, independently, never on a summed total.
  private willBeCutQty(originalQty: number, extraCuttingPercent: number): number {
    return Math.max(0, Math.ceil(originalQty * (1 + extraCuttingPercent / 100)));
  }

  private materialKeyFor(variant1: string | null | undefined, inventoryId: number | null | undefined, lineType = 'fabric'): string {
    const v1 = String(variant1 || '').trim();
    return v1 ? `${lineType}:variant:${v1.toLowerCase()}` : `${lineType}:card:${inventoryId ?? 'none'}`;
  }

  // Dynamic size list for this Work Order — same priority order work-orders/page.tsx's own
  // `selectedSizes` uses (minus the ephemeral, never-persisted "manual Size Group override" tier,
  // which has no meaning outside that one screen session): 1) this Work Order's own already-saved
  // Manufacturing Quantity sizes (real DB data, union across every Color so a color with a genuine
  // 0 for one size still shows that size's column) 2) the linked Style Card's current sizes.
  // Never hardcoded.
  private async resolveSizes(workOrderId: number): Promise<string[]> {
    const items = await this.workOrderSvc.listItems(workOrderId);
    const primaryItemId = items[0]?.id;
    const sizesSeen = new Set<string>();
    if (primaryItemId != null) {
      const variants = await this.workOrderSvc.listItemVariants(primaryItemId);
      for (const v of variants) {
        const [, size] = String(v.explanation || '').split(COLOR_SIZE_SEP);
        if (size && size.trim()) sizesSeen.add(size.trim());
      }
    }
    if (sizesSeen.size) return Array.from(sizesSeen);
    const wo: any = await this.workOrderSvc.get(workOrderId).catch(() => null);
    const styleCardId = wo?.styleCardId;
    if (!styleCardId) return [];
    const style = await this.prisma.styleCard.findUnique({ where: { id: styleCardId }, select: { sizes: true } }).catch(() => null);
    const sizes = Array.isArray(style?.sizes) ? (style!.sizes as any[]) : [];
    return sizes.filter((s) => typeof s === 'string' && s.trim()).map((s) => String(s).trim());
  }

  // Single read of this Work Order's real MA_WorkOrderItemVariant rows, grouped by Color (in the
  // order each color first appears — never sorted/invented) then by Size. Shared by getColorMatrix
  // (every color at once) and getOrderQtyBySize (one color) so there is exactly one place that
  // parses the Color‖Size composite key for this service.
  private async getAllVariantQuantities(workOrderId: number): Promise<{ byColorSize: Map<string, Map<string, number>>; colorsInOrder: string[]; extraCuttingPercent: number }> {
    const [items, headerRows] = await Promise.all([
      this.workOrderSvc.listItems(workOrderId),
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "Quantity2" as "quantity2" FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId} AND "IsDeleted" = 0`),
    ]);
    const extraCuttingPercent = Number(headerRows[0]?.quantity2) || 0;
    const primaryItemId = items[0]?.id;
    const byColorSize = new Map<string, Map<string, number>>();
    const colorsInOrder: string[] = [];
    if (primaryItemId == null) return { byColorSize, colorsInOrder, extraCuttingPercent };
    const variants = await this.workOrderSvc.listItemVariants(primaryItemId);
    for (const v of variants) {
      const [colorRaw, size] = String(v.explanation || '').split(COLOR_SIZE_SEP);
      if (!size || !size.trim()) continue;
      const color = colorRaw.trim();
      if (!color) continue; // a Cutting Card is always scoped to a real, named Production Color
      if (!byColorSize.has(color)) { byColorSize.set(color, new Map()); colorsInOrder.push(color); }
      const bySize = byColorSize.get(color)!;
      bySize.set(size.trim(), (bySize.get(size.trim()) || 0) + (Number(v.quantity) || 0));
    }
    return { byColorSize, colorsInOrder, extraCuttingPercent };
  }

  // Order Qty, per Size, for ONE Production Color only — never merged with another color's own
  // quantities.
  private async getOrderQtyBySize(workOrderId: number, productionColor: string): Promise<{ bySize: Map<string, number>; extraCuttingPercent: number }> {
    const { byColorSize, extraCuttingPercent } = await this.getAllVariantQuantities(workOrderId);
    const key = productionColor.trim().toLowerCase();
    const match = Array.from(byColorSize.entries()).find(([c]) => c.toLowerCase() === key);
    return { bySize: match ? match[1] : new Map(), extraCuttingPercent };
  }

  // Every real, saved Production Color on this Work Order (from Manufacturing Quantities —
  // NEVER invented, never a Style Card fallback: a Cutting Card only ever makes sense once real
  // quantities exist) with its own Order/Will-Be-Cut per size. Colors NOT present here simply
  // never render — there is nothing to cut yet.
  async getColorMatrix(workOrderId: number) {
    await this.workOrderSvc.get(workOrderId); // 404s if the Work Order itself doesn't exist
    const [sizes, { byColorSize, colorsInOrder, extraCuttingPercent }] = await Promise.all([
      this.resolveSizes(workOrderId),
      this.getAllVariantQuantities(workOrderId),
    ]);
    const colors: ColorMatrixRow[] = colorsInOrder.map((color) => {
      const bySizeRaw = byColorSize.get(color)!;
      const bySize: Record<string, { orderQty: number; willBeCutQty: number }> = {};
      let orderTotal = 0;
      let willBeCutTotal = 0;
      for (const sizeCode of sizes) {
        const orderQty = bySizeRaw.get(sizeCode) || 0;
        const willBeCutQty = this.willBeCutQty(orderQty, extraCuttingPercent);
        bySize[sizeCode] = { orderQty, willBeCutQty };
        orderTotal += orderQty;
        willBeCutTotal += willBeCutQty;
      }
      return { color, bySize, total: { orderQty: orderTotal, willBeCutQty: willBeCutTotal } };
    });
    return { workOrderId, sizes, extraCuttingPercent, colors };
  }

  // Applicable Fabrics for ONE Production Color — reuses fabric-yarn-requirements.service.ts's own
  // resolveBomLines() (the audited "Work Order's own Fabric BOM wins, else Style Card Fabric BOM
  // falls back" priority, decided independently of Trim/Ornament/Process) — zero new BOM-resolution
  // logic. Grouped by materialKey (one dropdown entry per real material, e.g. "MAIN FAB"), each
  // filtered to the lines that actually apply to this color: a line with no Variant-2 set applies
  // to every color (the existing "common material" convention); a line WITH a Variant-2 applies
  // only when it case-insensitively matches. A material with none of its lines applicable to this
  // color is left out entirely — never padded in with an unrelated color's own mapping.
  async listApplicableFabrics(workOrderId: number, productionColor: string): Promise<ApplicableFabric[]> {
    const key = productionColor.trim().toLowerCase();
    const lines = await this.fabricYarnSvc.resolveBomLines(workOrderId, 'fabric');
    const byMaterial = new Map<string, any[]>();
    for (const l of lines) {
      const materialKey = this.materialKeyFor(l.variant1, l.inventoryId);
      (byMaterial.get(materialKey) ?? byMaterial.set(materialKey, []).get(materialKey)!).push(l);
    }
    const inventoryIds = Array.from(new Set(lines.map((l: any) => l.inventoryId).filter((id: any) => id != null)));
    const colorCardIds = Array.from(new Set(lines.map((l: any) => l.colorCardId).filter(Boolean)));
    const [names, colors] = await Promise.all([
      this.resolveInventoryNames(inventoryIds),
      colorCardIds.length
        ? this.prisma.colorCard.findMany({ where: { id: { in: colorCardIds } }, select: { id: true, code: true, name: true } })
        : Promise.resolve([] as { id: string; code: string; name: string }[]),
    ]);
    const colorById = new Map(colors.map((c): [string, { id: string; code: string; name: string }] => [c.id, c]));
    const out: ApplicableFabric[] = [];
    for (const [materialKey, materialLines] of byMaterial) {
      const relevant = materialLines.filter((l) => !String(l.variant2 || '').trim() || String(l.variant2).trim().toLowerCase() === key);
      if (!relevant.length) continue; // this material doesn't apply to this color at all
      // Prefer the color-specific line (real Variant-2 match) over the common/unsplit one, so the
      // dropdown's own colorCardId reflects what actually applies to THIS color, not a generic
      // fallback that happens to be first in BOM order.
      const l = relevant.find((r) => String(r.variant2 || '').trim()) || relevant[0];
      const cc = l.colorCardId ? colorById.get(l.colorCardId) : undefined;
      const inv = l.inventoryId != null ? names.get(Number(l.inventoryId)) : undefined;
      out.push({
        materialKey,
        materialLabel: String(l.variant1 || '').trim() || inv?.code || inv?.name || `Item #${l.inventoryId}`,
        inventoryId: l.inventoryId ?? null,
        inventoryCode: inv?.code ?? null,
        inventoryName: inv?.name ?? null,
        variant1: l.variant1 ?? null,
        variant2: l.variant2 ?? null,
        colorCardId: l.colorCardId ?? null,
        colorCode: cc?.code ?? null,
        colorName: cc?.name ?? null,
        wastage: Number(l.wastage) || 0,
        markerWidth: l.markerWidth != null ? Number(l.markerWidth) : null,
        markerLength: l.markerLength != null ? Number(l.markerLength) : null,
        m2Weight: l.m2Weight != null ? Number(l.m2Weight) : null,
      });
    }
    return out;
  }

  // Inventory Code/Name for a batch of Fabric Card ids — the exact same IM_Item table/columns
  // fabric-yarn-requirements.service.ts's own resolveInventoryNames() reads (that copy is private,
  // so this is a same-shaped query here rather than a new cross-module dependency for one lookup).
  private async resolveInventoryNames(ids: number[]): Promise<Map<number, { code: string; name: string }>> {
    const distinct = Array.from(new Set(ids.filter((id) => id != null)));
    if (!distinct.length) return new Map();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name
      FROM "IM_Item" WHERE "RecId" IN (${Prisma.join(distinct)})
    `);
    return new Map(rows.map((r) => [Number(r.id), { code: r.code, name: r.name }]));
  }

  // Sum of already-SAVED Cut Qty (i.e. every Cutting Entry's own per-size quantities) across every
  // Fabric's own CuttingCard row for this (Work Order, Color) — used only for the main Cutting
  // Card screen's read-only preview panel (the per-Fabric Cutting Entry screen is where entries
  // are actually logged/edited). Never persisted itself; always a live re-aggregation.
  async getColorCutTotals(workOrderId: number, productionColor: string): Promise<Record<string, number>> {
    const color = productionColor.trim();
    const cards = await this.prisma.cuttingCard.findMany({
      where: { workOrderId, productionColor: color },
      include: { entries: { include: { sizes: true } } },
    });
    const bySize: Record<string, number> = {};
    for (const card of cards) {
      for (const entry of card.entries) {
        for (const s of entry.sizes) {
          bySize[s.sizeCode] = (bySize[s.sizeCode] || 0) + Number(s.quantity);
        }
      }
    }
    return bySize;
  }

  // Get-or-create, idempotent on the (workOrderId, productionColor, materialKey) unique key —
  // opening the Cutting Entry screen for the same Work Order + Color + Fabric never creates a
  // second row, and a DIFFERENT Fabric under the same Work Order + Color always gets its own.
  private async getOrCreateCard(workOrderId: number, productionColor: string, materialKey: string, materialLabel: string, userId?: string) {
    const color = productionColor.trim();
    const existing = await this.prisma.cuttingCard.findUnique({
      where: { workOrderId_productionColor_materialKey: { workOrderId, productionColor: color, materialKey } },
    });
    if (existing) return existing;
    return this.prisma.cuttingCard.create({ data: { workOrderId, productionColor: color, materialKey, materialLabel, createdBy: userId ?? null } });
  }

  // FI_Account Code/Name for a batch of Factory ids — the exact same real Factory master
  // MA_WorkOrder.FactoryId already uses (see work-order.service.ts's own HEADER_COLUMNS comment),
  // queried directly here rather than adding a new cross-module AccountService dependency for one
  // batch lookup.
  private async resolveFactoryNames(ids: (number | null | undefined)[]): Promise<Map<number, { code: string; name: string }>> {
    const distinct = Array.from(new Set(ids.filter((id): id is number => id != null)));
    if (!distinct.length) return new Map();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "CurrentAccountCode" as code, "CurrentAccountName" as name
      FROM "FI_Account" WHERE "RecId" IN (${Prisma.join(distinct)}) AND "IsDeleted" = 0
    `);
    return new Map(rows.map((r) => [Number(r.id), { code: r.code, name: r.name }]));
  }

  // Cutting Loss % is deliberately NEVER stored (see CuttingCard's own schema comment) — always
  // (Marker Grams - Actual Grams) / Marker Grams * 100, computed fresh from the two real stored
  // values every time either of them could have changed.
  private cuttingLossPercent(markerGrams: number | null, actualGrams: number | null): number | null {
    if (markerGrams == null || actualGrams == null || markerGrams <= 0) return null;
    return Math.round(((markerGrams - actualGrams) / markerGrams) * 100 * 100) / 100;
  }

  private toNum(v: any): number | null {
    return v == null ? null : Number(v);
  }

  private detailShape(card: any) {
    return {
      markerNo: card.markerNo, spreader: card.spreader, cadOperator: card.cadOperator, cutter: card.cutter,
      specialCode: card.specialCode, explanation: card.explanation, fabricType: card.fabricType,
      markerWeight: this.toNum(card.markerWeight), markerPlies: this.toNum(card.markerPlies), markerCount: this.toNum(card.markerCount),
      sentForCutting: this.toNum(card.sentForCutting), increase: this.toNum(card.increase), returnQty: this.toNum(card.returnQty),
      endOfRoll: this.toNum(card.endOfRoll), clipping: this.toNum(card.clipping),
      markerGrams: this.toNum(card.markerGrams), actualGrams: this.toNum(card.actualGrams),
      cuttingLossPercent: this.cuttingLossPercent(this.toNum(card.markerGrams), this.toNum(card.actualGrams)),
    };
  }

  async getCuttingCard(workOrderId: number, productionColor: string, materialKey: string, materialLabel: string, userId?: string) {
    await this.workOrderSvc.get(workOrderId); // 404s if the Work Order itself doesn't exist
    const card = await this.getOrCreateCard(workOrderId, productionColor, materialKey, materialLabel, userId);
    const [sizes, mfg, entryRows] = await Promise.all([
      this.resolveSizes(workOrderId),
      this.getOrderQtyBySize(workOrderId, productionColor),
      this.prisma.cuttingCardEntry.findMany({ where: { cuttingCardId: card.id }, include: { sizes: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const factoryIds = entryRows.map((e) => e.factoryId).filter((id): id is number => id != null);
    const factories = await this.resolveFactoryNames(factoryIds);

    // Cut Qty per size = SUM across every logged Cutting Entry — never a second, independently
    // editable number (see CuttingCardEntry's own schema comment).
    const cutBySize = new Map<string, number>();
    for (const entry of entryRows) {
      for (const s of entry.sizes) {
        cutBySize.set(s.sizeCode, (cutBySize.get(s.sizeCode) || 0) + Number(s.quantity));
      }
    }
    // Per-size first, always — Grand Total below is a SUM of these already-computed rows, never a
    // separate round(sum(...) * pct) computed from the totals directly.
    const rows: CuttingCardSizeRow[] = sizes.map((sizeCode) => {
      const orderQty = mfg.bySize.get(sizeCode) || 0;
      const willBeCut = this.willBeCutQty(orderQty, mfg.extraCuttingPercent);
      const cutQty = cutBySize.get(sizeCode) || 0;
      return {
        sizeCode,
        orderQty,
        willBeCutQty: willBeCut,
        cutQty,
        less: Math.max(willBeCut - cutQty, 0),
        over: Math.max(cutQty - willBeCut, 0),
      };
    });
    const totals = rows.reduce(
      (acc, r) => ({
        orderQty: acc.orderQty + r.orderQty,
        willBeCutQty: acc.willBeCutQty + r.willBeCutQty,
        cutQty: acc.cutQty + r.cutQty,
        less: acc.less + r.less,
        over: acc.over + r.over,
      }),
      { orderQty: 0, willBeCutQty: 0, cutQty: 0, less: 0, over: 0 },
    );
    const entries = entryRows.map((e) => {
      const factory = e.factoryId != null ? factories.get(e.factoryId) : undefined;
      const entrySizes: Record<string, number> = {};
      let entryTotal = 0;
      for (const s of e.sizes) { entrySizes[s.sizeCode] = Number(s.quantity); entryTotal += Number(s.quantity); }
      return {
        id: e.id, date: e.date, factoryId: e.factoryId, factoryCode: factory?.code ?? null, factoryName: factory?.name ?? null,
        partyNo: e.partyNo, document: e.document, explanation: e.explanation, sizes: entrySizes, total: entryTotal,
      };
    });
    return {
      cardId: card.id,
      workOrderId,
      productionColor: card.productionColor,
      materialKey: card.materialKey,
      materialLabel: card.materialLabel,
      extraCuttingPercent: mfg.extraCuttingPercent,
      sizes,
      rows,
      totals,
      detail: this.detailShape(card),
      entries,
      updatedAt: card.updatedAt,
    };
  }

  // Saves the "Cutting Analysis Detail" panel — one flat set of real fields per (Work Order,
  // Color, Fabric) context (see CuttingCard's own schema comment for why these live on the card
  // itself, not per Entry). Every numeric field is rejected outright if negative, never silently
  // clamped, per the project-wide "no negative values" rule.
  async saveCuttingCardDetail(
    workOrderId: number, productionColor: string, materialKey: string, materialLabel: string,
    detail: Partial<{
      markerNo: string | null; spreader: string | null; cadOperator: string | null; cutter: string | null;
      specialCode: string | null; explanation: string | null; fabricType: string | null;
      markerWeight: number | null; markerPlies: number | null; markerCount: number | null;
      sentForCutting: number | null; increase: number | null; returnQty: number | null;
      endOfRoll: number | null; clipping: number | null; markerGrams: number | null; actualGrams: number | null;
    }>,
    userId?: string,
    companyId?: string,
  ) {
    assertAllNonNegative({
      'Marker Weight': detail.markerWeight, 'Marker Plies': detail.markerPlies, 'Marker Count': detail.markerCount,
      'Sent for Cutting': detail.sentForCutting, Increase: detail.increase, Return: detail.returnQty,
      'End of Roll': detail.endOfRoll, Clipping: detail.clipping, 'Marker (Grams)': detail.markerGrams, 'Actual (Grams)': detail.actualGrams,
    });
    const card = await this.getOrCreateCard(workOrderId, productionColor, materialKey, materialLabel, userId);
    const updatedCard = await this.prisma.cuttingCard.update({ where: { id: card.id }, data: detail as any });
    // Only a real persisted change is an Updated event (updatedAt always moves, so it is ignored).
    if (userId && companyId && hasRealChanges(card, updatedCard, ['updatedAt'])) {
      const woNo = await this.workOrderNo(workOrderId);
      await this.audit.recordSafe({
        userId, companyId, screenKey: WORK_ORDER_SCREEN_KEY,
        entityType: 'CuttingCard', entityId: card.id, action: AUDIT_ACTIONS.UPDATE, documentNo: woNo,
        parentEntityType: 'MA_WorkOrder', parentEntityId: String(workOrderId), parentDocumentNo: woNo,
        before: { 'Cutting Card (CuttingCard)': card }, after: { 'Cutting Card (CuttingCard)': updatedCard },
      });
    }
    return this.getCuttingCard(workOrderId, productionColor, materialKey, materialLabel, userId);
  }

  // Confirms a CuttingCardEntry genuinely belongs to THIS Work Order before allowing it to be
  // mutated/deleted — defense in depth against an entryId from a different Work Order being
  // guessed/replayed (the frontend never constructs cross-WO ids, but the API must not trust that).
  private async assertEntryBelongsToWorkOrder(entryId: string, workOrderId: number) {
    const entry = await this.prisma.cuttingCardEntry.findUnique({ where: { id: entryId }, include: { cuttingCard: true } });
    if (!entry || entry.cuttingCard.workOrderId !== workOrderId) {
      throw new NotFoundException('Cutting Entry not found for this Work Order.');
    }
    return entry;
  }

  // Adds one new, real, persisted (blank) Cutting Entry row — the reference screen's own "Add
  // Cutting Entry" action. No size quantities yet (the frontend fills them in per-cell via
  // setCuttingEntrySize below); an entry with zero sizes simply contributes 0 to every size's Cut
  // total, exactly like a freshly Added Color row on Manufacturing Quantities contributes 0 until
  // sizes are typed in.
  async addCuttingEntry(workOrderId: number, productionColor: string, materialKey: string, materialLabel: string, userId?: string, companyId?: string) {
    const card = await this.getOrCreateCard(workOrderId, productionColor, materialKey, materialLabel, userId);
    const entry = await this.prisma.cuttingCardEntry.create({ data: { cuttingCardId: card.id } });
    await this.auditEntry(AUDIT_ACTIONS.CREATE, workOrderId, card.id, entry.id, null, await this.loadEntry(entry.id), userId, companyId);
    return this.getCuttingCard(workOrderId, productionColor, materialKey, materialLabel, userId);
  }

  async updateCuttingEntry(
    workOrderId: number, productionColor: string, materialKey: string, materialLabel: string, entryId: string,
    patch: Partial<{ date: string | null; factoryId: number | null; partyNo: string | null; document: string | null; explanation: string | null }>,
    userId?: string,
    companyId?: string,
  ) {
    const owned = await this.assertEntryBelongsToWorkOrder(entryId, workOrderId);
    const before = userId && companyId ? await this.loadEntry(entryId) : null;
    await this.prisma.cuttingCardEntry.update({
      where: { id: entryId },
      data: { ...patch, date: patch.date === undefined ? undefined : (patch.date ? new Date(patch.date) : null) },
    });
    if (before) {
      const after = await this.loadEntry(entryId);
      if (hasRealChanges(before, after)) await this.auditEntry(AUDIT_ACTIONS.UPDATE, workOrderId, owned.cuttingCardId, entryId, before, after, userId, companyId);
    }
    return this.getCuttingCard(workOrderId, productionColor, materialKey, materialLabel, userId);
  }

  // Upserts ONE size cell within ONE Cutting Entry — negative quantities rejected outright.
  async setCuttingEntrySize(
    workOrderId: number, productionColor: string, materialKey: string, materialLabel: string,
    entryId: string, sizeCode: string, quantity: number, userId?: string, companyId?: string,
  ) {
    assertNonNegative(quantity, `Cut Qty (${sizeCode})`);
    const owned = await this.assertEntryBelongsToWorkOrder(entryId, workOrderId);
    const before = userId && companyId ? await this.loadEntry(entryId) : null;
    await this.prisma.cuttingCardEntrySize.upsert({
      where: { entryId_sizeCode: { entryId, sizeCode } },
      update: { quantity },
      create: { entryId, sizeCode, quantity },
    });
    if (before) {
      const after = await this.loadEntry(entryId);
      if (hasRealChanges(before, after)) await this.auditEntry(AUDIT_ACTIONS.UPDATE, workOrderId, owned.cuttingCardId, entryId, before, after, userId, companyId);
    }
    return this.getCuttingCard(workOrderId, productionColor, materialKey, materialLabel, userId);
  }

  async deleteCuttingEntry(workOrderId: number, productionColor: string, materialKey: string, materialLabel: string, entryId: string, userId?: string, companyId?: string) {
    const owned = await this.assertEntryBelongsToWorkOrder(entryId, workOrderId);
    const before = userId && companyId ? await this.loadEntry(entryId) : null; // last valid state incl. sizes
    await this.prisma.cuttingCardEntry.delete({ where: { id: entryId } }); // CuttingCardEntrySize rows cascade
    if (before) await this.auditEntry(AUDIT_ACTIONS.DELETE, workOrderId, owned.cuttingCardId, entryId, before, null, userId, companyId);
    return this.getCuttingCard(workOrderId, productionColor, materialKey, materialLabel, userId);
  }
}
