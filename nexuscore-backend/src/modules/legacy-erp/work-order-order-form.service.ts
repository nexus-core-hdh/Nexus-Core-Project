import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { WorkOrderService, calculatedBomConsumption } from './work-order.service';
import { FabricYarnRequirementsService } from './fabric-yarn-requirements.service';
import { CuttingCardService } from './cutting-card.service';

// Work Order "Order Form" — the data of the Report Builder's Order Form document source
// (reports/work-order-order-form.report.ts lays it out as report sections; Work Orders list →
// right-click → Print → Order Form runs that report). Read-only, assembled from the same sources the
// Work Order screens already use, so the printout can never disagree with them:
//  - Header: MA_WorkOrder (WorkOrderService.get) + its Customer (FI_Account) + linked Style Card.
//  - Color/Size Chart: CuttingCardService.getColorMatrix — Order / Will Be Cut / Cut per color+size.
//  - Fabric / Trim Recipe Detail: the effective Work Order BOM (FabricYarnRequirementsService.
//    resolveBomLines: the Work Order's own MA_RecipeItem lines, else its Style Card's BOM).
//  - Fabric / Yarn / Trim Requirement Detail: FabricYarnRequirementsService.getRequirementDetail —
//    the saved MA_Requirement rows, else the live calculation (each section says which).
//  - Embellishment Details: the Style Card's Ornament BOM lines (Body / Print Color, Placement live
//    only on StyleBomLine), else the Work Order's own Ornament lines.
// Fields with no source in this database are returned as null and printed blank — never invented.

const r2 = (n: number) => Math.round(n * 10000) / 10000;
/** First value that is not null / blank — a Work Order field left empty falls back to its Style Card's. */
const pick = (...values: any[]) => values.find((v) => v != null && String(v).trim() !== '') ?? null;
/** First set number (Work Order line, else Style Card line), as a number. */
const pickNum = (...values: any[]) => { const v = pick(...values); return v == null || !Number.isFinite(Number(v)) ? null : Number(v); };
/** A legacy 0/1 flag (or a boolean) — null when neither line sets it. */
const pickFlag = (...values: any[]) => { const v = values.find((x) => x != null); return v == null ? null : typeof v === 'boolean' ? v : Number(v) === 1; };
const materialKey = (inventoryId: any, variant: any) => `${inventoryId ?? ''}|${String(variant ?? '').trim().toLowerCase()}`;

@Injectable()
export class WorkOrderOrderFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrderSvc: WorkOrderService,
    private readonly requirementsSvc: FabricYarnRequirementsService,
    private readonly cuttingSvc: CuttingCardService,
  ) {}

  async build(workOrderId: number, companyId?: string | null) {
    const header: any = await this.workOrderSvc.get(workOrderId); // 404s for a missing / deleted Work Order
    const [extraRows, items, chart, fabricLines, trimLines, ownOrnaments, fabricReq, yarnReq, trimReq, company] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT wo."IsApproved" as "isApproved", a."CurrentAccountCode" as "customerCode", a."CurrentAccountName" as "customerName"
        FROM "MA_WorkOrder" wo LEFT JOIN "FI_Account" a ON a."RecId" = wo."CurrentAccountId"
        WHERE wo."RecId" = ${workOrderId}
      `),
      this.workOrderSvc.listItems(workOrderId),
      this.cuttingSvc.getColorMatrix(workOrderId),
      this.requirementsSvc.resolveBomLines(workOrderId, 'fabric'),
      this.requirementsSvc.resolveBomLines(workOrderId, 'trim'),
      this.workOrderSvc.listBom(workOrderId, 'ornament'),
      this.requirementsSvc.getRequirementDetail(workOrderId, 'fabric'),
      this.requirementsSvc.getRequirementDetail(workOrderId, 'yarn'),
      this.requirementsSvc.getRequirementDetail(workOrderId, 'trim'),
      companyId ? this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }) : null,
    ]);
    const extra = sanitizeRawRow(extraRows)[0] ?? {};
    const styleCard = header.styleCardId
      ? await this.prisma.styleCard.findUnique({
        where: { id: header.styleCardId },
        select: {
          styleNumber: true, title: true, category: true, season: true, brand: true, customerStyleNo: true, attachments: true,
          bomLines: { orderBy: { sortOrder: 'asc' } },
        },
      })
      : null;
    const styleLines = styleCard?.bomLines ?? [];
    const styleLineByMaterial = new Map<string, (typeof styleLines)[number]>();
    for (const l of styleLines) {
      const key = `${l.lineType}:${materialKey(l.fabricInventoryId, l.variant)}`;
      if (!styleLineByMaterial.has(key)) styleLineByMaterial.set(key, l);
    }
    const styleLineFor = (lineType: string, l: any) => styleLineByMaterial.get(`${lineType}:${materialKey(l.inventoryId, l.variant1)}`) ?? null;

    const [names, units, colors] = await Promise.all([
      this.inventoryNames([...fabricLines, ...trimLines].map((l: any) => l.inventoryId)),
      this.unitCodes([...fabricLines, ...trimLines].map((l: any) => l.unitId)),
      this.colorNames([...fabricLines, ...trimLines].map((l: any) => l.colorCardId)),
    ]);
    const itemName = (id: any) => (id != null ? names.get(Number(id)) ?? null : null);

    // ── Fabric Recipe Detail ─────────────────────────────────────────────────────────────────
    const fabricRecipe = fabricLines.map((l: any) => {
      const s = styleLineFor('fabric', l);
      const total = Number(l.wastage) || 0;
      // Dye / Cut waste are separate only on the Style Card BOM line (MA_RecipeItem keeps their
      // combined Wastage); shown only while the Work Order's total still equals that split's sum.
      const styleTotal = s ? Number(s.wastePct) + Number(s.dyeWastagePct) + Number(s.otherWastagePct) + Number(s.printWastagePct) : null;
      const split = s && styleTotal != null && Math.abs(styleTotal - total) < 1e-6;
      return {
        fabric: itemName(l.inventoryId)?.name ?? s?.fabricName ?? null,
        fabricCode: itemName(l.inventoryId)?.code ?? s?.fabricCode ?? null,
        dia: pick(l.uD_Dia, s?.dia),
        gauge: pick(l.uD_Guage, s?.gauge),
        finishWidth: pick(l.uD_FinishWidth, s?.finishWidth),
        variant: l.variant1 ?? null,
        productionColor: l.variant2 ?? null,
        materialColor: l.colorCardId ? colors.get(String(l.colorCardId)) ?? null : null,
        explanation: pick(l.explanation, s?.explanation),
        process: pick(l.uD_Remarks, s?.process),
        rawQty: r2(Number(l.quantity) || 0),
        dyeWastePct: split ? Number(s!.dyeWastagePct) : null,
        cutWastePct: split ? Number(s!.wastePct) : null,
        totalWastePct: r2(total),
        unit: l.unitId != null ? units.get(Number(l.unitId)) ?? null : s?.unit ?? null,
        finalQty: calculatedBomConsumption(l),
        // Further BOM line fields (MA_RecipeItem, else the Style Card's StyleBomLine) — optional columns.
        component: pick(l.uD_Component, s?.component),
        placement: pick(l.uD_Placement, s?.placement),
        finishRoute: pick(l.uD_FinishRoute, s?.finishRoute),
        revision: pick(l.uD_Revision, s?.revision),
        markerWidth: pickNum(l.markerWidth, s?.marketWidth),
        markerLength: pickNum(l.markerLength, s?.marketLength),
        markerWeight: pickNum(l.m2Weight, s?.marketWeight),
        price: pickNum(l.price, s?.unitPrice),
        mainFabric: pickFlag(l.isMaster, s?.mainFabric),
        willBeCut: pickFlag(l.isCutting, s?.willBeCut),
      };
    });

    // ── Fabric Requirement Detail: per saved/calculated row, with its BOM line's specs ─────────
    const fabricLineFor = (inventoryId: any, productionColor: any) =>
      fabricLines.find((l: any) => Number(l.inventoryId) === Number(inventoryId) && String(l.variant2 ?? '').trim().toLowerCase() === String(productionColor ?? '').trim().toLowerCase())
      ?? fabricLines.find((l: any) => Number(l.inventoryId) === Number(inventoryId)) ?? null;
    const fabricRequirement = fabricReq.rows.map((r: any) => {
      const l = fabricLineFor(r.inventoryId, r.productionColor);
      const s = l ? styleLineFor('fabric', l) : null;
      return {
        fabric: r.inventoryName, fabricCode: r.inventoryCode,
        dia: pick(l?.uD_Dia, s?.dia), gauge: pick(l?.uD_Guage, s?.gauge), finishWidth: pick(l?.uD_FinishWidth, s?.finishWidth),
        variant: [r.variant1, r.productionColor].filter(Boolean).join(' / ') || null,
        variant1: r.variant1 ?? null,
        productionColor: r.productionColor ?? null,
        materialColor: r.colorName,
        explanation: pick(l?.explanation, s?.explanation),
        unit: r.unit, quantity: r.quantity,
        revision: pick(l?.uD_Revision, s?.revision),
        dyeingInstruction: pick(s?.dyeingInstruction),
        remarks: pick(s?.remarks),
      };
    });

    // ── Yarn Requirement Detail: one row per yarn (the legacy report's own grouping) ─────────
    const yarnByItem = new Map<string, any>();
    for (const r of yarnReq.rows as any[]) {
      const key = r.inventoryId != null ? String(r.inventoryId) : `${r.inventoryName}`;
      const y = yarnByItem.get(key);
      if (!y) {
        yarnByItem.set(key, {
          yarn: r.inventoryName, yarnCode: r.inventoryCode, variant: r.variant1 ?? null,
          knittingWastePct: r.wastePct, dyeWastePct: r.dyeWastagePct, unit: r.unit, quantity: r.quantity, bags: r.bags,
        });
      } else {
        y.quantity = r2(y.quantity + r.quantity);
        y.bags = y.bags != null && r.bags != null ? Math.round((y.bags + r.bags) * 100) / 100 : null;
      }
    }
    const yarnRequirement = [...yarnByItem.values()];

    // ── Trim Recipe / Requirement Detail ─────────────────────────────────────────────────────
    const trimRecipe = trimLines.map((l: any) => ({
      trim: itemName(l.inventoryId)?.name ?? styleLineFor('trim', l)?.fabricName ?? null,
      trimCode: itemName(l.inventoryId)?.code ?? null,
      variant: [l.variant1, l.variant2].filter(Boolean).join(' / ') || null,
      variant1: l.variant1 ?? null,
      productionColor: l.variant2 ?? null,
      explanation: pick(l.explanation, styleLineFor('trim', l)?.explanation),
      process: pick(l.uD_Remarks, styleLineFor('trim', l)?.process),
      component: pick(l.uD_Component, styleLineFor('trim', l)?.component),
      placement: pick(l.uD_Placement, styleLineFor('trim', l)?.placement),
      price: pickNum(l.price, styleLineFor('trim', l)?.unitPrice),
      color: l.colorCardId ? colors.get(String(l.colorCardId)) ?? null : null,
      wastagePct: r2(Number(l.wastage) || 0),
      unit: l.unitId != null ? units.get(Number(l.unitId)) ?? null : styleLineFor('trim', l)?.unit ?? null,
      quantity: r2(Number(l.quantity) || 0),
    }));
    const trimRequirement = (trimReq.rows as any[]).map((r) => ({
      trim: r.inventoryName, trimCode: r.inventoryCode,
      variant: [r.variant1, r.productionColor].filter(Boolean).join(' / ') || null,
      variant1: r.variant1 ?? null, productionColor: r.productionColor ?? null,
      materialColor: r.colorName, unit: r.unit, quantity: r.quantity,
    }));

    // ── Embellishment Details ────────────────────────────────────────────────────────────────
    const styleOrnaments = styleLines.filter((l) => l.lineType === 'ornament');
    const embellishments = styleOrnaments.length
      ? styleOrnaments.map((l) => ({
        embellishment: l.fabricName || l.explanation || l.component || null,
        bodyColor: l.bodyColor ?? null, printColor: l.printColor ?? null,
        placement: [l.component, l.placement].filter(Boolean).join(' — ') || null,
        component: l.component ?? null, process: l.process ?? null,
      }))
      : (ownOrnaments as any[]).map((l) => ({
        embellishment: l.explanation ?? null, bodyColor: null, printColor: null,
        placement: [l.uD_Component, l.uD_Placement].filter(Boolean).join(' — ') || null,
        component: l.uD_Component ?? null, process: l.uD_Remarks ?? null,
      }));

    const attachments = Array.isArray(styleCard?.attachments) ? (styleCard!.attachments as any[]) : [];
    const image = attachments.find((a) => String(a?.type || '').startsWith('image/') && a?.url) ?? null;
    const primaryItem: any = items[0] ?? null;

    return {
      generatedAt: new Date().toISOString(),
      company: { name: company?.name ?? null },
      header: {
        workOrderId,
        workOrderNo: header.workOrderNo,
        poNumber: header.customerOrderNo ?? null,
        brand: pick(header.uD_Brands, styleCard?.brand),
        customer: extra.customerName ?? null,
        customerCode: extra.customerCode ?? null,
        category: styleCard?.category ?? null,
        styleName: styleCard?.title ?? null,
        styleNo: styleCard?.styleNumber ?? null,
        customerStyleNo: styleCard?.customerStyleNo ?? null,
        season: pick(header.seasonCode, styleCard?.season),
        orderConfirmationDate: header.workOrderDate ?? null,
        shipmentHandoverDate: header.handoverDate ?? null,
        deliveryDate: header.deliveryDate ?? null,
        orderQuantity: header.quantity != null ? Number(header.quantity) : null,
        remarks: header.explanation ?? null,
        cuttingExtraPct: header.quantity2 != null ? Number(header.quantity2) : null,
        approved: Number(extra.isApproved) === 1,
        closed: Number(header.isClosed) === 1,
        imageUrl: image?.url ?? null,
      },
      colorSizeChart: {
        sizes: chart.sizes,
        customerOrderNo: primaryItem?.customerOrderNo ?? null,
        colors: chart.colors,
      },
      fabricRecipe,
      fabricRequirement: { source: fabricReq.source, rows: fabricRequirement },
      yarnRequirement: { source: yarnReq.source, rows: yarnRequirement },
      trimRecipe,
      trimRequirement: { source: trimReq.source, rows: trimRequirement },
      embellishments,
    };
  }

  private async inventoryNames(ids: any[]) {
    const distinct = [...new Set(ids.filter((id) => id != null).map(Number))];
    if (!distinct.length) return new Map<number, { code: string; name: string }>();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name FROM "IM_Item" WHERE "RecId" IN (${Prisma.join(distinct)})
    `);
    return new Map(sanitizeRawRow(rows).map((r: any) => [Number(r.id), { code: r.code, name: r.name }]));
  }

  private async unitCodes(ids: any[]) {
    const distinct = [...new Set(ids.filter((id) => id != null).map(Number))];
    if (!distinct.length) return new Map<number, string>();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "UnitCode" as code FROM "MD_UnitSetItem" WHERE "RecId" IN (${Prisma.join(distinct)})
    `);
    return new Map(sanitizeRawRow(rows).map((r: any) => [Number(r.id), String(r.code ?? '')]));
  }

  private async colorNames(ids: any[]) {
    const distinct = [...new Set(ids.filter(Boolean).map(String))];
    if (!distinct.length) return new Map<string, string>();
    const rows = await this.prisma.colorCard.findMany({ where: { id: { in: distinct } }, select: { id: true, code: true, name: true } });
    return new Map(rows.map((c) => [c.id, c.name || c.code]));
  }
}

export type WorkOrderOrderForm = Awaited<ReturnType<WorkOrderOrderFormService['build']>>;
