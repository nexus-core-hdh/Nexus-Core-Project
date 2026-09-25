import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS, hasRealChanges } from '../audit/audit.service';
import { WorkOrderService } from './work-order.service';
import { CuttingCardService } from './cutting-card.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';
import { sanitizeRawRow } from './raw-row.util';
import { assertAllNonNegative } from './numeric-guards.util';

// Order Manufacturing Entry — MenuItem.href, same screenKey convention every audited screen uses.
export const ORDER_MANUFACTURING_SCREEN_KEY = '/dashboard/legacy-erp/order-manufacturing-entry';

// Same Color‖Size convention work-order.service.ts / cutting-card.service.ts already use to encode
// Manufacturing Quantities into MA_WorkOrderItemVariant.Explanation. Do not diverge from it.
const COLOR_SIZE_SEP = '‖';

// Order Manufacturing Entry — NOT a new entity. Manufacturing transactions live in the already-
// existing, already-migrated legacy tables MA_WorkOrderProduction (header: one row per entry) and
// MA_WorkOrderProductionVariant (child: one row per Color×Size, FK -> MA_WorkOrderItemVariant), both
// 0 rows before this feature (first writer). Every screen field maps onto a REAL existing column:
//   Factory -> CurrentAccountId (FK FI_Account)      Date -> ProductionDate
//   Explanation / AdditionalInformation / PartyNo / DocumentNo / Weight -> same-named columns
//   Process -> ProcessId (FK MA_Process — the existing 'process' master)
//   Type -> ProductionSubType = MA_QualityType.RecId (the existing 'quality-type' master; the table
//           has no dedicated Quality FK column, so this is the closest existing smallint slot)
//   Size quantities -> MA_WorkOrderProductionVariant.Quantity (Color/Size derived from the linked
//           MA_WorkOrderItemVariant.Explanation)
// The legacy schema carries no lookup table for InOut / IsRepair, so the convention is defined once
// here: InOut 1 = IN (receive from factory), 2 = OUT (send to factory); IsRepair 1 marks the two
// Repair flows. ProductionType is set to 1 ("manufacturing entry") on every row this screen writes.
export type ManufacturingMode = 'in' | 'out' | 'repair-sent' | 'repair-received';
const MODES: Record<ManufacturingMode, { inOut: number; isRepair: number; label: string }> = {
  in: { inOut: 1, isRepair: 0, label: 'Manufacturing IN' },
  out: { inOut: 2, isRepair: 0, label: 'Manufacturing OUT' },
  'repair-sent': { inOut: 2, isRepair: 1, label: 'Sent (Repair)' },
  'repair-received': { inOut: 1, isRepair: 1, label: 'Received (Repair)' },
};
const PRODUCTION_TYPE_MANUFACTURING = 1;

export interface EntryRowDto {
  id?: number | null;
  factoryId?: number | null;
  date?: string | null;
  explanation?: string | null;
  additionalInformation?: string | null;
  partyNo?: string | null;
  documentNo?: string | null;
  qualityTypeId?: number | null;
  weight?: number | null;
  sizes?: Record<string, number>;
}
export interface SaveEntriesDto {
  workOrderId: number;
  processId: number;
  color: string;
  mode: ManufacturingMode;
  rows: EntryRowDto[];
  deletedIds?: number[];
}
export interface PriceContractRowDto {
  id?: number | null;
  factoryId?: number | null;
  price?: number | null;
  forexId?: number | null;
  quantity?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  explanation?: string | null;
}

type Names = Map<number, { code: string | null; name: string | null }>;
interface NormalizedEntry {
  id: number | null;
  factoryId: number | null;
  date: string | null;
  explanation: string | null;
  additionalInformation: string | null;
  partyNo: string | null;
  documentNo: string | null;
  qualityTypeId: number | null;
  weight: number | null;
  sizes: Record<string, number>;
}

const text = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s ? s : null;
};
const intOrNull = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const numOrNull = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dayOf = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const ck = (s: string) => s.trim().toLowerCase();
// ColorCard.color is stored in mixed formats (#RRGGBB, #AARRGGBB — see live rows); normalized to a
// plain opaque #RRGGBB for display swatches only, never persisted anywhere.
const toHex = (c?: string | null): string | null => {
  if (!c) return null;
  const s = c.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toUpperCase()}`;
  if (/^[0-9a-f]{8}$/i.test(s)) return `#${s.slice(2).toUpperCase()}`;
  return null;
};

@Injectable()
export class OrderManufacturingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workOrderSvc: WorkOrderService,
    private readonly cuttingSvc: CuttingCardService,
    private readonly fabricYarnSvc: FabricYarnRequirementsService,
  ) {}

  private modeDef(mode: string) {
    const def = MODES[mode as ManufacturingMode];
    if (!def) throw new BadRequestException(`Unknown manufacturing mode "${mode}".`);
    return def;
  }

  // ── small master resolvers ────────────────────────────────────────────────────────────────
  private async accountNames(ids: (number | null | undefined)[]): Promise<Names> {
    const d = Array.from(new Set(ids.filter((i): i is number => i != null)));
    if (!d.length) return new Map();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "RecId" as id, "CurrentAccountCode" as code, "CurrentAccountName" as name FROM "FI_Account" WHERE "RecId" IN (${Prisma.join(d)})`);
    return new Map(rows.map((r) => [Number(r.id), { code: r.code, name: r.name }]));
  }
  private async qualityTypes(): Promise<{ id: number; code: string | null; name: string | null }[]> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "QualityCode" as code, "QualityName" as name FROM "MA_QualityType"
      WHERE COALESCE("IsDeleted", 0) = 0 AND COALESCE("InUse", 1) <> 0 ORDER BY "RecId"
    `);
    return rows.map((r) => ({ id: Number(r.id), code: r.code, name: r.name }));
  }
  private async processInfo(processId: number | null) {
    if (processId == null) return null;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "RecId" as id, "ProcessCode" as code, "ProcessName" as name FROM "MA_Process" WHERE "RecId" = ${processId} AND COALESCE("IsDeleted", 0) = 0`);
    return rows[0] ? { id: Number(rows[0].id), code: rows[0].code as string | null, name: rows[0].name as string | null } : null;
  }

  // "Locking" for this screen follows the Work Order's own persisted state (MA_WorkOrder.IsClosed /
  // IsLocked / IsCancelled) — the same flags the Work Order screen owns — checked from the DB on every write.
  private async lockReason(workOrderId: number): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "IsClosed" as c, "IsLocked" as l, "IsCancelled" as x FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId} AND "IsDeleted" = 0`);
    const r = rows[0];
    if (!r) throw new NotFoundException('Work order not found');
    if (Number(r.x) === 1) return 'This Work Order is cancelled.';
    if (Number(r.c) === 1) return 'This Work Order is closed.';
    if (Number(r.l) === 1) return 'This Work Order is locked.';
    return null;
  }
  private async assertOpen(workOrderId: number) {
    const reason = await this.lockReason(workOrderId);
    if (reason) throw new ForbiddenException(`${reason} Manufacturing entries cannot be changed.`);
  }

  // ── transactions -> per (color,size) aggregates ────────────────────────────────────────────
  private async loadAggregates(workOrderId: number, processId: number | null) {
    const bySizeByColor = new Map<string, Record<string, { sent: number; received: number; returned: number }>>();
    const qualityByColor = new Map<string, Map<number, number>>();
    if (processId == null) return { bySizeByColor, qualityByColor };
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT p."InOut" as "inOut", COALESCE(p."IsRepair", 0) as "isRepair", p."ProductionSubType" as "qualityTypeId",
             iv."Explanation" as explanation, v."Quantity" as quantity
      FROM "MA_WorkOrderProduction" p
      JOIN "MA_WorkOrderItem" it ON it."RecId" = p."WorkOrderItemId"
      JOIN "MA_WorkOrderProductionVariant" v ON v."WorkOrderProductionId" = p."RecId" AND COALESCE(v."IsDeleted", 0) = 0
      JOIN "MA_WorkOrderItemVariant" iv ON iv."RecId" = v."WorkOrderItemVariantId"
      WHERE it."WorkOrderId" = ${workOrderId} AND p."IsDeleted" = 0 AND p."ProcessId" = ${processId}
    `);
    for (const r of rows) {
      const [colorRaw, sizeRaw] = String(r.explanation || '').split(COLOR_SIZE_SEP);
      const color = ck(colorRaw || '');
      const size = (sizeRaw || '').trim();
      if (!color || !size) continue;
      const q = Number(r.quantity) || 0;
      const bySize = bySizeByColor.get(color) ?? {};
      const cell = bySize[size] ?? { sent: 0, received: 0, returned: 0 };
      const inOut = Number(r.inOut);
      const repair = Number(r.isRepair) === 1;
      if (inOut === 1) cell.received += q;            // Manufacturing IN + Received (Repair)
      else if (inOut === 2 && !repair) cell.sent += q; // Manufacturing OUT
      else if (inOut === 2 && repair) cell.returned += q; // Sent (Repair)
      bySize[size] = cell;
      bySizeByColor.set(color, bySize);
      if (inOut === 1 && r.qualityTypeId != null) {
        const qm = qualityByColor.get(color) ?? new Map<number, number>();
        qm.set(Number(r.qualityTypeId), (qm.get(Number(r.qualityTypeId)) || 0) + q);
        qualityByColor.set(color, qm);
      }
    }
    return { bySizeByColor, qualityByColor };
  }

  // ── BOM material columns (real BOM/recipe — never hardcoded) ────────────────────────────────
  // Fabric/Trim go through FabricYarnRequirementsService.resolveBomLines (the audited "Work Order's own
  // BOM wins, else the Style Card BOM" priority the Requirements/Cutting screens already trust);
  // Ornament/Process only ever exist as the Work Order's own BOM. Grouped by the same material key
  // work-orders/page.tsx's C/S Details already uses, so "MAIN FAB" means the same thing everywhere.
  private async buildMaterials(workOrderId: number, colors: string[]) {
    type Group = { key: string; lineType: string; label: string; inventoryId: number | null; mainFabric: boolean; lines: any[] };
    const groups = new Map<string, Group>();
    const add = (lineType: string, lines: any[], mainOf: (l: any) => boolean) => {
      for (const l of lines) {
        const v1 = String(l.variant1 || '').trim();
        if (!v1 && l.inventoryId == null) continue;
        const key = v1 ? `${lineType}:variant:${v1.toLowerCase()}` : `${lineType}:card:${l.inventoryId}`;
        const g = groups.get(key) ?? { key, lineType, label: v1, inventoryId: l.inventoryId ?? null, mainFabric: false, lines: [] as any[] };
        g.lines.push(l);
        g.mainFabric = g.mainFabric || mainOf(l);
        groups.set(key, g);
      }
    };
    for (const lt of ['fabric', 'trim'] as const) {
      const lines = await this.fabricYarnSvc.resolveBomLines(workOrderId, lt);
      const styleIds = lines.filter((l) => l.isMaster === undefined).map((l) => String(l.id));
      const styleMain = styleIds.length
        ? new Map((await this.prisma.styleBomLine.findMany({ where: { id: { in: styleIds } }, select: { id: true, mainFabric: true } })).map((s) => [s.id, s.mainFabric]))
        : new Map<string, boolean>();
      add(lt, lines, (l) => (l.isMaster !== undefined ? !!l.isMaster : !!styleMain.get(String(l.id))));
    }
    for (const lt of ['ornament', 'process'] as const) {
      add(lt, await this.workOrderSvc.listBom(workOrderId, lt), (l) => !!l.isMaster);
    }
    const all = Array.from(groups.values());
    const invIds = Array.from(new Set(all.map((g) => g.inventoryId).filter((i): i is number => i != null)));
    const cardIds = Array.from(new Set(all.flatMap((g) => g.lines.map((l) => l.colorCardId as string | null)).filter((c): c is string => !!c)));
    const [inv, cards] = await Promise.all([
      invIds.length ? this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name FROM "IM_Item" WHERE "RecId" IN (${Prisma.join(invIds)})`) : Promise.resolve([] as any[]),
      cardIds.length ? this.prisma.colorCard.findMany({ where: { id: { in: cardIds } }, select: { id: true, code: true, name: true, color: true } }) : Promise.resolve([] as any[]),
    ]);
    const invById = new Map(inv.map((r) => [Number(r.id), r]));
    const cardById = new Map(cards.map((c: any) => [c.id, c]));
    // Main Fabric first (stable within each partition), same ordering the Work Order's C/S Details uses.
    const ordered = [...all].sort((a, b) => (b.mainFabric ? 1 : 0) - (a.mainFabric ? 1 : 0));
    const columns = ordered.map((g) => {
      const item = g.inventoryId != null ? invById.get(g.inventoryId) : undefined;
      return { key: g.key, lineType: g.lineType, label: g.label || item?.name || item?.code || `Item #${g.inventoryId}`, mainFabric: g.mainFabric };
    });
    const cellsByColor = new Map<string, Record<string, { code: string | null; name: string | null; hex: string | null }>>();
    for (const color of colors) {
      const cells: Record<string, { code: string | null; name: string | null; hex: string | null }> = {};
      for (const g of ordered) {
        const own = g.lines.find((l) => ck(String(l.variant2 || '')) === ck(color));
        const common = g.lines.find((l) => !String(l.variant2 || '').trim());
        const line = own ?? common;
        const card = line?.colorCardId ? cardById.get(line.colorCardId) : undefined;
        cells[g.key] = card ? { code: card.code, name: card.name, hex: toHex(card.color) } : { code: null, name: null, hex: null };
      }
      cellsByColor.set(ck(color), cells);
    }
    return { columns, cellsByColor };
  }

  // ── the one read model both the main screen and the child screen's bottom summary use ──────
  private async buildReadModel(workOrderId: number, processId: number | null) {
    const matrix = await this.cuttingSvc.getColorMatrix(workOrderId); // 404s if WO missing
    const colorNames = matrix.colors.map((c) => c.color);
    const [cut, agg, mats, qualityTypes] = await Promise.all([
      this.cuttingSvc.getCutTotalsByColor(workOrderId),
      this.loadAggregates(workOrderId, processId),
      this.buildMaterials(workOrderId, colorNames),
      this.qualityTypes(),
    ]);
    const sizes = matrix.sizes;
    const blank = () => ({ order: 0, willBeCut: 0, cutting: 0, sent: 0, received: 0, returned: 0, balance: 0 });
    type Cell = ReturnType<typeof blank>;
    const addTo = (t: Cell, c: Cell) => { (Object.keys(t) as (keyof Cell)[]).forEach((k) => { t[k] += c[k]; }); };
    const grandBySize: Record<string, Cell> = Object.fromEntries(sizes.map((s) => [s, blank()]));
    const grandTotals = blank();
    const rows = matrix.colors.map((c) => {
      const key = ck(c.color);
      const bySize: Record<string, Cell> = {};
      const totals = blank();
      for (const s of sizes) {
        const t = agg.bySizeByColor.get(key)?.[s];
        const cell: Cell = {
          order: c.bySize[s]?.orderQty || 0,
          willBeCut: c.bySize[s]?.willBeCutQty || 0,
          cutting: cut.get(key)?.[s] || 0,
          sent: t?.sent || 0,
          received: t?.received || 0,
          returned: t?.returned || 0,
          balance: 0,
        };
        // Balance = Order − Received + Return: pieces still owed by the factory. A piece sent back for
        // repair is owed again (+Return) until it is received again (Received includes Received (Repair)).
        cell.balance = cell.order - cell.received + cell.returned;
        bySize[s] = cell;
        addTo(totals, cell);
        addTo(grandBySize[s], cell);
      }
      addTo(grandTotals, totals);
      const q = agg.qualityByColor.get(key);
      const byQuality: Record<string, number> = {};
      if (q) for (const [id, qty] of q) byQuality[String(id)] = qty;
      return { color: c.color, cells: mats.cellsByColor.get(key) || {}, bySize, totals, byQuality };
    });
    const qualityTotals: Record<string, number> = {};
    for (const r of rows) for (const [id, qty] of Object.entries(r.byQuality)) qualityTotals[id] = (qualityTotals[id] || 0) + qty;
    return {
      sizes,
      extraCuttingPercent: matrix.extraCuttingPercent,
      materialColumns: mats.columns,
      qualityColumns: qualityTypes,
      rows,
      grandTotal: { bySize: grandBySize, totals: grandTotals, byQuality: qualityTotals },
    };
  }

  private async header(workOrderId: number, processIdParam: number | null) {
    const wo: any = await this.workOrderSvc.get(workOrderId);
    const [rawProc, accounts] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "ProcessId" as pid FROM "MA_WorkOrder" WHERE "RecId" = ${workOrderId}`),
      this.accountNames([wo.currentAccountId]),
    ]);
    const processId = processIdParam ?? (rawProc[0]?.pid != null ? Number(rawProc[0].pid) : null);
    const [process, style] = await Promise.all([
      this.processInfo(processId),
      wo.styleCardId ? this.prisma.styleCard.findUnique({ where: { id: wo.styleCardId }, select: { id: true, styleNumber: true, title: true, attachments: true } }) : Promise.resolve(null),
    ]);
    const att = Array.isArray(style?.attachments) ? (style!.attachments as any[]) : [];
    const image = att.find((a) => typeof a?.type === 'string' && a.type.startsWith('image/') && a.url);
    const cust = wo.currentAccountId != null ? accounts.get(Number(wo.currentAccountId)) : undefined;
    return {
      workOrder: { id: workOrderId, workOrderNo: wo.workOrderNo as string, customerId: wo.currentAccountId ?? null, customerCode: cust?.code ?? null, customerName: cust?.name ?? null },
      style: style ? { id: style.id, styleNumber: style.styleNumber, title: style.title, imageUrl: (image?.url as string) ?? null } : null,
      process,
      lockReason: await this.lockReason(workOrderId),
    };
  }

  // Main screen read model.
  async getContext(workOrderId: number, processId?: number | null) {
    const head = await this.header(workOrderId, processId ?? null);
    const model = await this.buildReadModel(workOrderId, head.process?.id ?? null);
    return { ...head, ...model };
  }

  // ── child screen: one (Work Order, Process, Color, mode) ─────────────────────────────────
  private async loadEntries(workOrderId: number, processId: number, color: string, mode: ManufacturingMode, onlyIds?: number[]) {
    const def = MODES[mode];
    const idFilter = onlyIds?.length ? Prisma.sql`AND p."RecId" IN (${Prisma.join(onlyIds)})` : Prisma.sql``;
    const heads = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT p."RecId" as id, p."CurrentAccountId" as "factoryId", to_char(p."ProductionDate", 'YYYY-MM-DD') as date, p."Explanation" as explanation,
             p."AdditionalInformation" as "additionalInformation", p."PartyNo" as "partyNo", p."DocumentNo" as "documentNo",
             p."ProductionSubType" as "qualityTypeId", p."Weight" as weight
      FROM "MA_WorkOrderProduction" p
      JOIN "MA_WorkOrderItem" it ON it."RecId" = p."WorkOrderItemId"
      WHERE it."WorkOrderId" = ${workOrderId} AND p."IsDeleted" = 0 AND p."ProcessId" = ${processId}
        AND p."InOut" = ${def.inOut} AND COALESCE(p."IsRepair", 0) = ${def.isRepair} ${idFilter}
      ORDER BY p."ProductionDate" NULLS LAST, p."RecId"
    `);
    if (!heads.length) return [] as (NormalizedEntry & { variantIdBySize: Record<string, number> })[];
    const vars = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT v."WorkOrderProductionId" as pid, v."RecId" as vid, v."Quantity" as quantity, iv."Explanation" as explanation
      FROM "MA_WorkOrderProductionVariant" v
      JOIN "MA_WorkOrderItemVariant" iv ON iv."RecId" = v."WorkOrderItemVariantId"
      WHERE COALESCE(v."IsDeleted", 0) = 0 AND v."WorkOrderProductionId" IN (${Prisma.join(heads.map((h) => Number(h.id)))})
    `);
    const byPid = new Map<number, { color: string; sizes: Record<string, number>; variantIdBySize: Record<string, number> }>();
    for (const v of vars) {
      const [c, s] = String(v.explanation || '').split(COLOR_SIZE_SEP);
      if (!c?.trim() || !s?.trim()) continue;
      const e = byPid.get(Number(v.pid)) ?? { color: c.trim(), sizes: {}, variantIdBySize: {} };
      e.sizes[s.trim()] = (e.sizes[s.trim()] || 0) + (Number(v.quantity) || 0);
      e.variantIdBySize[s.trim()] = Number(v.vid);
      byPid.set(Number(v.pid), e);
    }
    const out: (NormalizedEntry & { variantIdBySize: Record<string, number> })[] = [];
    for (const h of sanitizeRawRow(heads)) {
      const e = byPid.get(Number(h.id));
      if (!e || ck(e.color) !== ck(color)) continue; // entry belongs to another color (or has no size rows at all)
      out.push({
        id: Number(h.id), factoryId: h.factoryId != null ? Number(h.factoryId) : null, date: dayOf(h.date),
        explanation: text(h.explanation), additionalInformation: text(h.additionalInformation), partyNo: text(h.partyNo), documentNo: text(h.documentNo),
        qualityTypeId: h.qualityTypeId != null ? Number(h.qualityTypeId) : null, weight: numOrNull(h.weight),
        sizes: e.sizes, variantIdBySize: e.variantIdBySize,
      });
    }
    return out;
  }

  async getEntries(workOrderId: number, processId: number, color: string, mode: string) {
    const def = this.modeDef(mode);
    const m = mode as ManufacturingMode;
    const head = await this.header(workOrderId, processId);
    if (!head.process) throw new BadRequestException('A valid Process is required.');
    const model = await this.buildReadModel(workOrderId, processId);
    const row = model.rows.find((r) => ck(r.color) === ck(color));
    if (!row) throw new NotFoundException(`"${color}" is not a Production Color of this Work Order.`);
    const entries = await this.loadEntries(workOrderId, processId, row.color, m);
    const names = await this.accountNames(entries.map((e) => e.factoryId));
    return {
      ...head,
      mode: m,
      modeLabel: def.label,
      color: row.color,
      sizes: model.sizes,
      materialColumns: model.materialColumns,
      colorCells: row.cells,
      qualityTypes: model.qualityColumns,
      entries: entries.map(({ variantIdBySize: _v, ...e }) => {
        const f = e.factoryId != null ? names.get(e.factoryId) : undefined;
        return { ...e, factoryCode: f?.code ?? null, factoryName: f?.name ?? null, total: Object.values(e.sizes).reduce((a, b) => a + b, 0) };
      }),
      summary: { color: row, grandTotal: model.grandTotal },
    };
  }

  private normalizeRow(r: EntryRowDto, sizes: string[]): NormalizedEntry {
    const sz: Record<string, number> = {};
    for (const s of sizes) sz[s] = Number(r.sizes?.[s]) || 0;
    return {
      id: intOrNull(r.id), factoryId: intOrNull(r.factoryId), date: dayOf(r.date), explanation: text(r.explanation),
      additionalInformation: text(r.additionalInformation), partyNo: text(r.partyNo), documentNo: text(r.documentNo),
      qualityTypeId: intOrNull(r.qualityTypeId), weight: numOrNull(r.weight), sizes: sz,
    };
  }
  private hasData(e: NormalizedEntry) {
    return e.factoryId != null || e.explanation || e.additionalInformation || e.partyNo || e.documentNo || (e.weight ?? 0) > 0 || Object.values(e.sizes).some((q) => q > 0);
  }

  private snapshot(e: NormalizedEntry, ctx: { workOrderNo: string; process: { id: number; code: string | null; name: string | null }; color: string; modeLabel: string; sizes: string[] }, accounts: Names, quality: Map<number, { code: string | null; name: string | null }>) {
    const ref = (id: number | null, m: Names) => (id == null ? null : { id, code: m.get(id)?.code ?? null, name: m.get(id)?.name ?? null });
    return {
      'Work Order': ctx.workOrderNo,
      Process: ctx.process,
      'Production Color': ctx.color,
      'Transaction': ctx.modeLabel,
      Factory: ref(e.factoryId, accounts),
      Date: e.date,
      Explanation: e.explanation,
      'Additional Information': e.additionalInformation,
      'Party No': e.partyNo,
      'Document No': e.documentNo,
      Type: ref(e.qualityTypeId, quality),
      Weight: e.weight,
      // Canonical size order with 0 for a size the row has no value for — so a before/after diff
      // compares like with like regardless of the order the DB returned the size rows in.
      Sizes: Object.fromEntries(ctx.sizes.map((s) => [s, e.sizes[s] || 0])),
      Total: Object.values(e.sizes).reduce((a, b) => a + b, 0),
    };
  }

  // Save = insert new rows, update changed existing rows (matched by RecId, never by content, so a
  // repeated Save can never duplicate), soft-delete removed rows. Nothing is written for an unchanged
  // row and no audit event is created for it (hasRealChanges).
  async saveEntries(dto: SaveEntriesDto, currentUserId: string, companyId: string) {
    const def = this.modeDef(dto.mode);
    const workOrderId = Number(dto.workOrderId);
    const processId = Number(dto.processId);
    if (!workOrderId || !processId) throw new BadRequestException('Work Order and Process are required.');
    await this.assertOpen(workOrderId);
    const head = await this.header(workOrderId, processId);
    if (!head.process) throw new BadRequestException('A valid Process is required.');
    const items = await this.workOrderSvc.listItems(workOrderId);
    const primaryItemId = items[0]?.id;
    if (primaryItemId == null) throw new BadRequestException('This Work Order has no Style Info line yet.');
    const variants = await this.workOrderSvc.listItemVariants(primaryItemId);
    const colorLower = ck(dto.color || '');
    const liveVariantBySize = new Map<string, number>();
    let canonicalColor: string | null = null;
    for (const v of variants as any[]) {
      const [c, s] = String(v.explanation || '').split(COLOR_SIZE_SEP);
      if (!c?.trim() || !s?.trim() || ck(c) !== colorLower) continue;
      canonicalColor = canonicalColor ?? c.trim();
      if (!liveVariantBySize.has(s.trim())) liveVariantBySize.set(s.trim(), Number(v.id));
    }
    if (!canonicalColor) throw new NotFoundException(`"${dto.color}" is not a Production Color of this Work Order.`);
    const sizes = Array.from(liveVariantBySize.keys());

    const quality = await this.qualityTypes();
    const qualityMap = new Map(quality.map((q) => [q.id, q]));
    const existing = await this.loadEntries(workOrderId, processId, canonicalColor, dto.mode);
    const existingById = new Map(existing.map((e) => [e.id!, e]));

    const incoming = (dto.rows || []).map((r) => this.normalizeRow(r, sizes));
    for (const r of incoming) {
      assertAllNonNegative({ Weight: r.weight, ...Object.fromEntries(Object.entries(r.sizes).map(([s, q]) => [`Quantity (${s})`, q])) });
      if (r.qualityTypeId != null && !qualityMap.has(r.qualityTypeId)) throw new BadRequestException('Unknown Type (Quality Type).');
      if (r.id != null && !existingById.has(r.id)) throw new NotFoundException('Manufacturing entry not found for this Work Order / Process / Color.');
    }
    const deletedIds = Array.from(new Set((dto.deletedIds || []).map(Number))).filter((id) => existingById.has(id));
    const foreignDeleted = (dto.deletedIds || []).map(Number).filter((id) => !existingById.has(id));
    if (foreignDeleted.length) throw new NotFoundException('Manufacturing entry not found for this Work Order / Process / Color.');

    // A Document No is unique per (Factory, Process, Color, transaction kind) among the non-deleted
    // entries — so a re-submitted / double-clicked Save can never silently create the same entry twice.
    const docKey = (factoryId: number | null, documentNo: string | null) => `${factoryId ?? ''}|${(documentNo ?? '').toLowerCase()}`;
    const takenDocs = new Set(existing.filter((e) => e.documentNo && !deletedIds.includes(e.id!)).map((e) => docKey(e.factoryId, e.documentNo)));
    for (const r of incoming) {
      if (!r.documentNo) continue;
      const key = docKey(r.factoryId, r.documentNo);
      const own = r.id != null ? existingById.get(r.id) : undefined;
      if (own && docKey(own.factoryId, own.documentNo) === key) continue; // unchanged identity of an existing row
      if (takenDocs.has(key)) throw new BadRequestException(`Document No "${r.documentNo}" already exists for this Factory in ${def.label} (${canonicalColor}).`);
      takenDocs.add(key);
    }
    const accounts = await this.accountNames([...incoming.map((r) => r.factoryId), ...existing.map((e) => e.factoryId)]);
    for (const r of incoming) if (r.factoryId != null && !accounts.has(r.factoryId)) throw new BadRequestException('Unknown Factory.');
    const ctx = { workOrderNo: head.workOrder.workOrderNo, process: head.process, color: canonicalColor, modeLabel: def.label, sizes };
    const userInt = Number(currentUserId) || 1;
    const auditQueue: Parameters<AuditService['recordSafe']>[0][] = [];
    const audit = (action: string, id: number, before?: unknown, after?: unknown, documentNo?: string | null) =>
      auditQueue.push({
        userId: currentUserId, companyId, screenKey: ORDER_MANUFACTURING_SCREEN_KEY, entityType: 'MA_WorkOrderProduction', entityId: String(id), action,
        documentNo: documentNo ?? head.workOrder.workOrderNo, parentEntityType: 'MA_WorkOrder', parentEntityId: String(workOrderId), parentDocumentNo: head.workOrder.workOrderNo,
        ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
      });

    await this.prisma.$transaction(async (tx) => {
      const writeVariants = async (pid: number, e: NormalizedEntry, current: Record<string, number>) => {
        for (const [idx, s] of sizes.entries()) {
          const liveId = liveVariantBySize.get(s)!;
          const q = e.sizes[s] || 0;
          if (current[s] != null) {
            await tx.$executeRaw(Prisma.sql`UPDATE "MA_WorkOrderProductionVariant" SET "Quantity" = ${q}, "WorkOrderItemVariantId" = ${liveId}, "UpdatedAt" = now(), "UpdatedBy" = ${userInt} WHERE "RecId" = ${current[s]}`);
          } else {
            await tx.$executeRaw(Prisma.sql`INSERT INTO "MA_WorkOrderProductionVariant" ("WorkOrderProductionId","WorkOrderItemVariantId","SubNo","Quantity","InsertedAt","InsertedBy","IsDeleted","UUID") VALUES (${pid}, ${liveId}, ${idx + 1}, ${q}, now(), ${userInt}, 0, gen_random_uuid())`);
          }
        }
      };
      for (const id of deletedIds) {
        const before = existingById.get(id)!;
        await tx.$executeRaw(Prisma.sql`UPDATE "MA_WorkOrderProductionVariant" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userInt} WHERE "WorkOrderProductionId" = ${id} AND COALESCE("IsDeleted", 0) = 0`);
        await tx.$executeRaw(Prisma.sql`UPDATE "MA_WorkOrderProduction" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userInt} WHERE "RecId" = ${id}`);
        audit(AUDIT_ACTIONS.DELETE, id, { 'Manufacturing Entry': this.snapshot(before, ctx, accounts, qualityMap) }, undefined, before.documentNo);
      }
      for (const e of incoming) {
        const total = Object.values(e.sizes).reduce((a, b) => a + b, 0);
        if (e.id == null) {
          if (!this.hasData(e)) continue; // the trailing blank grid row
          const rows = await tx.$queryRaw<any[]>(Prisma.sql`
            INSERT INTO "MA_WorkOrderProduction"
              ("WorkOrderItemId","ProductionType","ProcessId","CurrentAccountId","DocumentNo","InOut","IsRepair","ProductionSubType","ProductionDate","Quantity","Weight","Explanation","AdditionalInformation","PartyNo","InsertedAt","InsertedBy","IsDeleted","UUID")
            VALUES (${primaryItemId}, ${PRODUCTION_TYPE_MANUFACTURING}, ${processId}, ${e.factoryId}, ${e.documentNo}, ${def.inOut}, ${def.isRepair}, ${e.qualityTypeId}, ${e.date}::date, ${total}, ${e.weight}, ${e.explanation}, ${e.additionalInformation}, ${e.partyNo}, now(), ${userInt}, 0, gen_random_uuid())
            RETURNING "RecId" as id
          `);
          const newId = Number(rows[0].id);
          await writeVariants(newId, e, {});
          audit(AUDIT_ACTIONS.CREATE, newId, undefined, { 'Manufacturing Entry': this.snapshot({ ...e, id: newId }, ctx, accounts, qualityMap) }, e.documentNo);
        } else {
          const before = existingById.get(e.id)!;
          const beforeSnap = this.snapshot(before, ctx, accounts, qualityMap);
          const afterSnap = this.snapshot(e, ctx, accounts, qualityMap);
          if (!hasRealChanges({ v: beforeSnap }, { v: afterSnap })) continue; // unchanged -> no write, no audit
          await tx.$executeRaw(Prisma.sql`
            UPDATE "MA_WorkOrderProduction" SET "CurrentAccountId" = ${e.factoryId}, "DocumentNo" = ${e.documentNo}, "ProductionSubType" = ${e.qualityTypeId},
              "ProductionDate" = ${e.date}::date, "Quantity" = ${total}, "Weight" = ${e.weight}, "Explanation" = ${e.explanation},
              "AdditionalInformation" = ${e.additionalInformation}, "PartyNo" = ${e.partyNo}, "UpdatedAt" = now(), "UpdatedBy" = ${userInt}
            WHERE "RecId" = ${e.id}
          `);
          await writeVariants(e.id, e, before.variantIdBySize);
          audit(AUDIT_ACTIONS.UPDATE, e.id, { 'Manufacturing Entry': beforeSnap }, { 'Manufacturing Entry': afterSnap }, e.documentNo);
        }
      }
    });
    for (const a of auditQueue) await this.audit.recordSafe(a);
    return this.getEntries(workOrderId, processId, canonicalColor, dto.mode);
  }

  // ── Price Contract: SM_ServicePriceList rows linked to the Work Order's own Style Info line(s) ──
  // SM_ServicePriceList already has WorkOrderItemId / CurrAccId (Factory) / Price / ForexId /
  // StartDate / EndDate / Quantity / Explanation. No Price Contract screen/service existed anywhere
  // in the app before this (only Purchase/Sale Contract on SM_Contract, a different document), so
  // this is the minimum real flow over that one table. It has no Process column, so a price
  // contract is per Work Order + Factory, not per Process.
  async listPriceContracts(workOrderId: number) {
    const wo: any = await this.workOrderSvc.get(workOrderId);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT sp."RecId" as id, sp."CurrAccId" as "factoryId", sp."Price" as price, sp."ForexId" as "forexId", sp."Quantity" as quantity,
             to_char(sp."StartDate", 'YYYY-MM-DD') as "startDate", to_char(sp."EndDate", 'YYYY-MM-DD') as "endDate", sp."Explanation" as explanation
      FROM "SM_ServicePriceList" sp JOIN "MA_WorkOrderItem" it ON it."RecId" = sp."WorkOrderItemId"
      WHERE it."WorkOrderId" = ${workOrderId} AND COALESCE(sp."IsDeleted", 0) = 0 ORDER BY sp."RecId"
    `);
    const clean = sanitizeRawRow(rows);
    const forexIds = Array.from(new Set(clean.map((r: any) => r.forexId).filter((i: any) => i != null)));
    const [accounts, forex] = await Promise.all([
      this.accountNames(clean.map((r: any) => (r.factoryId != null ? Number(r.factoryId) : null))),
      forexIds.length ? this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "RecId" as id, "ForexCode" as code FROM "MD_Forex" WHERE "RecId" IN (${Prisma.join(forexIds)})`) : Promise.resolve([] as any[]),
    ]);
    const forexById = new Map(forex.map((f) => [Number(f.id), f.code as string]));
    return {
      workOrder: { id: workOrderId, workOrderNo: wo.workOrderNo as string },
      lockReason: await this.lockReason(workOrderId),
      rows: clean.map((r: any) => ({
        id: Number(r.id), factoryId: r.factoryId != null ? Number(r.factoryId) : null,
        factoryCode: accounts.get(Number(r.factoryId))?.code ?? null, factoryName: accounts.get(Number(r.factoryId))?.name ?? null,
        price: numOrNull(r.price), forexId: r.forexId != null ? Number(r.forexId) : null, forexCode: forexById.get(Number(r.forexId)) ?? null,
        quantity: numOrNull(r.quantity), startDate: dayOf(r.startDate), endDate: dayOf(r.endDate), explanation: text(r.explanation),
      })),
    };
  }

  async savePriceContracts(workOrderId: number, rows: PriceContractRowDto[], deletedIds: number[] | undefined, currentUserId: string, companyId: string) {
    await this.assertOpen(workOrderId);
    const wo: any = await this.workOrderSvc.get(workOrderId);
    const items = await this.workOrderSvc.listItems(workOrderId);
    const primaryItemId = items[0]?.id;
    if (primaryItemId == null) throw new BadRequestException('This Work Order has no Style Info line yet.');
    const current = await this.listPriceContracts(workOrderId);
    const byId = new Map(current.rows.map((r) => [r.id, r]));
    const userInt = Number(currentUserId) || 1;
    const norm = (r: PriceContractRowDto) => ({
      id: intOrNull(r.id), factoryId: intOrNull(r.factoryId), price: numOrNull(r.price), forexId: intOrNull(r.forexId), quantity: numOrNull(r.quantity),
      startDate: dayOf(r.startDate), endDate: dayOf(r.endDate), explanation: text(r.explanation),
    });
    const incoming = (rows || []).map(norm);
    for (const r of incoming) {
      assertAllNonNegative({ Price: r.price, Quantity: r.quantity });
      if (r.id != null && !byId.has(r.id)) throw new NotFoundException('Price contract not found for this Work Order.');
      if (r.startDate && r.endDate && r.endDate < r.startDate) throw new BadRequestException('End Date cannot be before Start Date.');
    }
    const removed = (deletedIds || []).map(Number);
    if (removed.some((id) => !byId.has(id))) throw new NotFoundException('Price contract not found for this Work Order.');
    const snap = (r: any) => ({ 'Work Order': wo.workOrderNo, Factory: r.factoryId, Price: r.price, Currency: r.forexId, Quantity: r.quantity, 'Start Date': r.startDate, 'End Date': r.endDate, Explanation: r.explanation });
    const auditQueue: Parameters<AuditService['recordSafe']>[0][] = [];
    const audit = (action: string, id: number, before?: unknown, after?: unknown) => auditQueue.push({
      userId: currentUserId, companyId, screenKey: ORDER_MANUFACTURING_SCREEN_KEY, entityType: 'SM_ServicePriceList', entityId: String(id), action,
      documentNo: wo.workOrderNo, parentEntityType: 'MA_WorkOrder', parentEntityId: String(workOrderId), parentDocumentNo: wo.workOrderNo,
      ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
    });
    await this.prisma.$transaction(async (tx) => {
      for (const id of removed) {
        await tx.$executeRaw(Prisma.sql`UPDATE "SM_ServicePriceList" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userInt} WHERE "RecId" = ${id}`);
        audit(AUDIT_ACTIONS.DELETE, id, { 'Price Contract': snap(byId.get(id)) });
      }
      for (const r of incoming) {
        if (r.id == null) {
          if (r.factoryId == null && r.price == null && !r.explanation) continue; // blank grid row
          const ins = await tx.$queryRaw<any[]>(Prisma.sql`
            INSERT INTO "SM_ServicePriceList" ("WorkOrderItemId","CurrAccId","Price","ForexId","Quantity","StartDate","EndDate","Explanation","InUse","InsertedAt","InsertedBy","IsDeleted","UUID")
            VALUES (${primaryItemId}, ${r.factoryId}, ${r.price}, ${r.forexId}, ${r.quantity}, ${r.startDate}::date, ${r.endDate}::date, ${r.explanation}, 1, now(), ${userInt}, 0, gen_random_uuid()) RETURNING "RecId" as id
          `);
          audit(AUDIT_ACTIONS.CREATE, Number(ins[0].id), undefined, { 'Price Contract': snap(r) });
        } else {
          const before = byId.get(r.id)!;
          if (!hasRealChanges({ v: snap(before) }, { v: snap(r) })) continue;
          await tx.$executeRaw(Prisma.sql`
            UPDATE "SM_ServicePriceList" SET "CurrAccId" = ${r.factoryId}, "Price" = ${r.price}, "ForexId" = ${r.forexId}, "Quantity" = ${r.quantity},
              "StartDate" = ${r.startDate}::date, "EndDate" = ${r.endDate}::date, "Explanation" = ${r.explanation}, "UpdatedAt" = now(), "UpdatedBy" = ${userInt} WHERE "RecId" = ${r.id}
          `);
          audit(AUDIT_ACTIONS.UPDATE, r.id, { 'Price Contract': snap(before) }, { 'Price Contract': snap(r) });
        }
      }
    });
    for (const a of auditQueue) await this.audit.recordSafe(a);
    return this.listPriceContracts(workOrderId);
  }
}
