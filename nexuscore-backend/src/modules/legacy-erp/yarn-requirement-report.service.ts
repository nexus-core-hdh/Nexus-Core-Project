import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';
import { FabricPlanningService } from './fabric-planning.service';

// Cumulative material requirement — the data of the Report Builder's Yarn / Fabric / Trim
// Requirement document sources (reports/yarn-requirement.report.ts lays them out; Work Orders →
// right-click / ⋮ → Print → Yarn / Fabric / Trim Requirement runs them). Read-only, for one or more
// Work Orders: each Work Order's own material table, then Cumulative Totals across them. No
// calculation of its own — every figure comes from the services the Requirements and Planning
// screens already use:
//  - Requirement: FabricYarnRequirementsService.getRequirementDetail(workOrderId, material) — the
//    rows last SAVED on the Requirements screen's tab (MA_Requirement, RequirementType 1 Fabric /
//    2 Yarn / 3 Trim), else its live calculation (Fabric / Trim: BOM Consumption × Will Be Cut per
//    production color; Yarn: the fabric requirement × Yarn Recipe %), in the item's Requirement unit.
//    Process / Variant-1 are the BOM line's (Fabric, Trim) or the yarn recipe line's (Yarn); Production
//    Color is the garment color the row is for, Material Color the BOM line's chosen color.
//  - Pur.Order: FabricPlanningService.aggregatePurchase — Purchase Order lines (IM_OrderReceiptItem,
//    ReceiptType 1) linked to the Work Order by ManufacturingOrderId, for that item.
//  - Purchase Current Account: the supplier (IM_OrderReceipt.CurrentAccountId → FI_Account) of those
//    same Purchase Order lines.
//  - Received / Out.Qty. (to production): FabricPlanningService.aggregateReceipts — receipt lines
//    linked to the Work Order (WorkOrderReceiptItemId), Purchase Receipt (type 2) / Manufacture Send
//    (type 140), for that item.
// Those three are kept per (Work Order, item) by the ERP — not per variant, color or process — so
// they are printed once per item (on its first row) and never repeated on its other rows, which
// would double them in any total.

export type RequirementMaterial = 'yarn' | 'fabric' | 'trim';

/** Most Work Orders one run may print. */
export const MATERIAL_REPORT_MAX_WORK_ORDERS = 100;
export const YARN_REPORT_MAX_WORK_ORDERS = MATERIAL_REPORT_MAX_WORK_ORDERS;

export interface YarnReportSelection {
  /** Specific Work Orders (RecId). */
  workOrderIds?: number[];
  /** Work Orders by Order No ("W/O-4280" with startsWith covers W/O-4280-A, -B, -C). */
  workOrderNo?: { operator: 'startsWith' | 'contains' | 'equals'; value: string };
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Row identity per material. Yarn lists one row per yarn, process and variant (as the legacy Yarn
 * Requirement Report); Fabric and Trim requirement rows are color-wise in the ERP, so their production
 * and material colors stay separate rows too. Cumulative rows drop what is specific to one Work
 * Order (its recipe's Process, the garment's Production Color) and keep material, variant, material
 * color and unit apart — different units are never added.
 */
const ROW_KEY: Record<RequirementMaterial, (r: any) => unknown[]> = {
  yarn: (r) => [r.process, norm(r.variant1)],
  fabric: (r) => [r.process, norm(r.variant1), norm(r.productionColor), norm(r.materialColor)],
  trim: (r) => [r.process, norm(r.variant1), norm(r.productionColor), norm(r.materialColor)],
};
const CUMULATIVE_KEY: Record<RequirementMaterial, (r: any) => unknown[]> = {
  yarn: (r) => [norm(r.variant1)],
  fabric: (r) => [norm(r.variant1), norm(r.materialColor)],
  trim: (r) => [norm(r.variant1), norm(r.materialColor)],
};

@Injectable()
export class YarnRequirementReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requirementsSvc: FabricYarnRequirementsService,
    private readonly planningSvc: FabricPlanningService,
  ) {}

  /** The selected Work Orders (non-deleted), newest Order No first — both filters must match. */
  private async selectWorkOrders(sel: YarnReportSelection): Promise<number[]> {
    const where: Prisma.Sql[] = [Prisma.sql`wo."IsDeleted" = 0`];
    if (sel.workOrderIds) where.push(sel.workOrderIds.length ? Prisma.sql`wo."RecId" IN (${Prisma.join(sel.workOrderIds)})` : Prisma.sql`FALSE`);
    if (sel.workOrderNo) {
      const v = sel.workOrderNo.value.trim();
      const esc = v.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      where.push(sel.workOrderNo.operator === 'equals'
        ? Prisma.sql`lower(wo."WorkOrderNo") = lower(${v})`
        : Prisma.sql`wo."WorkOrderNo" ILIKE ${sel.workOrderNo.operator === 'startsWith' ? `${esc}%` : `%${esc}%`}`);
    }
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT wo."RecId" as id FROM "MA_WorkOrder" wo WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY wo."WorkOrderNo" DESC, wo."RecId" DESC LIMIT ${MATERIAL_REPORT_MAX_WORK_ORDERS + 1}
    `);
    if (rows.length > MATERIAL_REPORT_MAX_WORK_ORDERS) {
      throw new BadRequestException(`More than ${MATERIAL_REPORT_MAX_WORK_ORDERS} Work Orders match — narrow the Work Order filter.`);
    }
    return rows.map((r) => Number(r.id));
  }

  /** Supplier names of the Purchase Order lines aggregatePurchase counts, per "workOrderId:inventoryId". */
  private async purchaseAccounts(workOrderIds: number[], inventoryIds: number[]) {
    const out = new Map<string, string[]>();
    if (!workOrderIds.length || !inventoryIds.length) return out;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT poi."ManufacturingOrderId" as "workOrderId", poi."InventoryId" as "inventoryId", acc."CurrentAccountName" as name
      FROM "IM_OrderReceiptItem" poi
      JOIN "IM_OrderReceipt" po ON po."RecId" = poi."OrderReceiptId" AND po."IsDeleted" = 0
      JOIN "FI_Account" acc ON acc."RecId" = po."CurrentAccountId"
      WHERE poi."IsDeleted" = 0 AND poi."ReceiptType" = 1
        AND poi."ManufacturingOrderId" IN (${Prisma.join(workOrderIds)})
        AND poi."InventoryId" IN (${Prisma.join(inventoryIds)})
      ORDER BY 3
    `);
    for (const r of sanitizeRawRow(rows)) {
      const key = `${r.workOrderId}:${r.inventoryId}`;
      out.set(key, [...(out.get(key) ?? []), r.name]);
    }
    return out;
  }

  /**
   * `calculateFromBom`: a Work Order with no saved requirement rows for this material is printed with
   * the Requirements screen's live BOM calculation only when true. When false (the default) it is
   * printed with no rows (status 'not-saved') and contributes nothing to the Cumulative Totals.
   * Saved rows are always used as saved.
   */
  async build(sel: YarnReportSelection, material: RequirementMaterial = 'yarn', opts: { calculateFromBom?: boolean } = {}) {
    const workOrderIds = await this.selectWorkOrders(sel);
    const headers = await this.planningSvc.resolveHeaders(workOrderIds);
    const details = await Promise.all(workOrderIds.map(async (id) => {
      const detail = await this.requirementsSvc.getRequirementDetail(id, material);
      // 'calculated' = no saved rows: keep the live BOM calculation only when asked.
      const status: 'saved' | 'calculated' | 'not-saved' = detail.source === 'saved' ? 'saved' : opts.calculateFromBom ? 'calculated' : 'not-saved';
      return { id, status, detail: status === 'not-saved' ? { ...detail, rows: [] } : detail };
    }));
    const inventoryIds = [...new Set(details.flatMap((d) => d.detail.rows.map((r) => r.inventoryId)).filter((id): id is number => id != null))];
    const [purchase, receipts, accounts] = await Promise.all([
      this.planningSvc.aggregatePurchase(workOrderIds, inventoryIds),
      this.planningSvc.aggregateReceipts(workOrderIds, inventoryIds),
      this.purchaseAccounts(workOrderIds, inventoryIds),
    ]);
    const procurement = (workOrderId: number, inventoryId: number | null) => {
      if (inventoryId == null) return null;
      const key = `${workOrderId}:${inventoryId}`;
      const rec = receipts.get(key);
      return {
        purchaseAccount: (accounts.get(key) ?? []).join(', ') || null,
        purchaseOrdered: r4(purchase.get(key) ?? 0),
        received: r4(rec?.received ?? 0),
        outQty: r4(rec?.manufacturingSend ?? 0),
      };
    };
    const itemKey = (r: any) => (r.inventoryId != null ? String(r.inventoryId) : `name:${r.name}`);

    const workOrders = details.map(({ id, status, detail }) => {
      const h = headers.get(id) ?? {};
      // The requirement rows of one item summed per row identity (ROW_KEY).
      const groups = new Map<string, any>();
      for (const r of detail.rows as any[]) {
        const row = {
          inventoryId: r.inventoryId, code: r.inventoryCode, name: r.inventoryName, process: r.process ?? null,
          variant1: r.variant1 ?? null, productionColor: material === 'yarn' ? null : r.productionColor ?? null,
          materialColor: material === 'yarn' ? null : r.colorName ?? null, unit: r.unit ?? null,
        };
        const key = JSON.stringify([itemKey(row), ...ROW_KEY[material](row), row.unit ?? '']);
        const g = groups.get(key);
        if (g) g.requirement = r4(g.requirement + (Number(r.quantity) || 0));
        else groups.set(key, { ...row, requirement: r4(Number(r.quantity) || 0) });
      }
      // Procurement figures once per item: on its first row only.
      const seen = new Set<string>();
      const rows = [...groups.values()].map((g) => {
        const first = !seen.has(itemKey(g));
        seen.add(itemKey(g));
        const p = first ? procurement(id, g.inventoryId) : null;
        return { ...g, purchaseAccount: p?.purchaseAccount ?? null, purchaseOrdered: p?.purchaseOrdered ?? null, received: p?.received ?? null, outQty: p?.outQty ?? null };
      });
      return {
        workOrderId: id,
        header: {
          workOrderNo: h.workOrderNo ?? null, styleCode: h.styleCode ?? null, styleName: h.styleName ?? null,
          customer: h.customerName ?? null, customerCode: h.customerCode ?? null, orderDate: h.workOrderDate ?? null,
          quantity: h.quantity != null ? Number(h.quantity) : null, customerOrderNo: h.customerOrderNo ?? null, deliveryDate: h.deliveryDate ?? null,
        },
        source: detail.source,
        status,
        rows,
      };
    });

    // Cumulative Totals: Requirement summed per CUMULATIVE_KEY across the Work Orders. Procurement
    // summed per item across the Work Orders (each Work Order's figure counted once — its first-row
    // values), on the item's first cumulative row.
    const cumulative = new Map<string, any>();
    for (const wo of workOrders) {
      for (const r of wo.rows) {
        const key = JSON.stringify([itemKey(r), ...CUMULATIVE_KEY[material](r), r.unit ?? '']);
        const c = cumulative.get(key);
        if (c) c.requirement = r4(c.requirement + r.requirement);
        else {
          cumulative.set(key, {
            inventoryId: r.inventoryId, code: r.code, name: r.name, variant1: r.variant1, materialColor: r.materialColor, unit: r.unit, requirement: r.requirement,
          });
        }
      }
    }
    const perItem = new Map<string, { accounts: Set<string>; purchaseOrdered: number; received: number; outQty: number }>();
    for (const wo of workOrders) {
      for (const r of wo.rows) {
        if (r.purchaseOrdered == null) continue; // not the item's first row in this Work Order
        const t = perItem.get(itemKey(r)) ?? { accounts: new Set<string>(), purchaseOrdered: 0, received: 0, outQty: 0 };
        if (r.purchaseAccount) r.purchaseAccount.split(', ').forEach((a: string) => t.accounts.add(a));
        t.purchaseOrdered = r4(t.purchaseOrdered + r.purchaseOrdered);
        t.received = r4(t.received + (r.received ?? 0));
        t.outQty = r4(t.outQty + (r.outQty ?? 0));
        perItem.set(itemKey(r), t);
      }
    }
    const seenCumulative = new Set<string>();
    const cumulativeRows = [...cumulative.values()].map((c) => {
      const t = !seenCumulative.has(itemKey(c)) ? perItem.get(itemKey(c)) : undefined;
      seenCumulative.add(itemKey(c));
      return {
        ...c,
        purchaseAccount: t ? [...t.accounts].sort((a, b) => a.localeCompare(b)).join(', ') || null : null,
        purchaseOrdered: t?.purchaseOrdered ?? null, received: t?.received ?? null, outQty: t?.outQty ?? null,
      };
    });

    return { generatedAt: new Date().toISOString(), material, calculateFromBom: !!opts.calculateFromBom, workOrders, cumulative: cumulativeRows };
  }
}

export type YarnRequirementReport = Awaited<ReturnType<YarnRequirementReportService['build']>>;
