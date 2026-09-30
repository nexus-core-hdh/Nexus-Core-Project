import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { itemUnitNameLateral } from '../legacy-erp/inventory-card.service';
import { LegacyMasterLookupService } from '../legacy-erp/legacy-master-lookup.service';
import { resolveLineUnitId, assertValidItemUnit } from '../legacy-erp/unit-conversion.util';

const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));

// Unit display text as the Style Card BOM stores it (code, else name), and a Unit matched from an
// item's configured Units by id or by its Code/Name text (case-insensitive).
const itemUnitLabel = (u: any): string => u.code || u.name || '';
function matchItemUnit(units: any[], unitId: any, text: string | null | undefined) {
  if (unitId != null) return units.find((u) => Number(u.id) === Number(unitId));
  const t = (text ?? '').trim().toLowerCase();
  return t ? units.find((u) => [u.code, u.name].some((x) => (x ?? '').trim().toLowerCase() === t)) : undefined;
}

function computeTotals(sheet: {
  rawMaterialLines: any[];
  laborLines: any[];
  otherLines: any[];
  overheadPct: any;
  wastePct: any;
  gSuppliesPct: any;
  excessProductionPct: any;
  profitPct: any;
  financialCostPct: any;
  commissionPct: any;
  commission3Pct: any;
  foreignRate: any;
}) {
  const rawTotal = sheet.rawMaterialLines.reduce(
    (s, r) => s + num(r.quantity) * num(r.unitPrice) * (1 + num(r.wastePct) / 100),
    0,
  );
  const laborTotal = sheet.laborLines.reduce(
    (s, r) => s + num(r.quantity) * num(r.unitPrice) * (1 + num(r.wastePct) / 100),
    0,
  );
  const otherTotal = sheet.otherLines.reduce((s, r) => s + num(r.quantity) * num(r.unitPrice), 0);

  const materialLabor = rawTotal + laborTotal;
  const overheadAmt = materialLabor * (num(sheet.overheadPct) / 100);
  const costingSubtotal = materialLabor + overheadAmt + otherTotal;
  const wasteAmt = costingSubtotal * (num(sheet.wastePct) / 100);
  const gSuppliesAmt = costingSubtotal * (num(sheet.gSuppliesPct) / 100);
  const excessProdAmt = costingSubtotal * (num(sheet.excessProductionPct) / 100);
  const wasteTotal = wasteAmt + gSuppliesAmt + excessProdAmt;
  const profitAmt = (costingSubtotal + wasteTotal) * (num(sheet.profitPct) / 100);
  const financialCostAmt = (costingSubtotal + wasteTotal + profitAmt) * (num(sheet.financialCostPct) / 100);
  const commissionAmt = (costingSubtotal + wasteTotal + profitAmt) * (num(sheet.commissionPct) / 100);
  const commission3Amt = (costingSubtotal + wasteTotal + profitAmt) * (num(sheet.commission3Pct) / 100);
  const commissionTotal = commissionAmt + commission3Amt;
  const calculatedPrice = costingSubtotal + wasteTotal + profitAmt + financialCostAmt + commissionTotal;
  const netPrice = calculatedPrice;
  const usdRate = num(sheet.foreignRate) || 1;
  const secondRate = num((sheet as any).secondForeignRate) || 1;
  const costForex1 = netPrice / usdRate;
  const costForex2 = netPrice / secondRate;

  return {
    rawTotal, laborTotal, otherTotal, materialLabor,
    overheadAmt, costingSubtotal,
    wasteAmt, gSuppliesAmt, excessProdAmt, wasteTotal,
    profitAmt, financialCostAmt,
    commissionAmt, commission3Amt, commissionTotal,
    calculatedPrice, netPrice, usdRate,
    costForex1, costForex2,
  };
}

const HEADER_FIELDS = [
  'costingNo', 'costingDate', 'styleCardId', 'sampleCardId', 'styleId', 'styleCode', 'styleName', 'accountCode', 'accountName',
  'category', 'brand', 'pkrRate', 'foreignCurrency', 'foreignRate', 'secondForeignCurrency', 'secondForeignRate',
  'quotedPriceForex', 'quotedPrice',
  'orderQuantity', 'shippingTerms', 'paymentTerms', 'overheadPct', 'wastePct', 'gSuppliesPct',
  'excessProductionPct', 'profitPct', 'financialCostPct', 'commissionPct', 'commission3Pct',
];

function pickHeader(dto: any) {
  const out: any = {};
  for (const f of HEADER_FIELDS) if (dto[f] !== undefined) out[f] = dto[f];
  if (out.costingDate) out.costingDate = new Date(out.costingDate);
  return out;
}

@Injectable()
export class CostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterLookupSvc: LegacyMasterLookupService,
  ) {}

  async list(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.search) {
      where.OR = [
        { costingNo: { contains: q.search, mode: 'insensitive' } },
        { styleCode: { contains: q.search, mode: 'insensitive' } },
        { styleName: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.costingSheet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.costingSheet.count({ where }),
    ]);
    return { data, meta: { total, page, pages: Math.ceil(total / limit) || 1 } };
  }

  async create(dto: any, branchId: string, createdBy: string) {
    const costingNo = dto.costingNo || `CS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    return this.prisma.costingSheet.create({
      data: { ...pickHeader(dto), costingNo, branchId, createdBy },
    });
  }

  async findOrThrow(id: string) {
    const sheet = await this.prisma.costingSheet.findUnique({
      where: { id },
      include: {
        rawMaterialLines: { orderBy: { sortOrder: 'asc' } },
        laborLines: { orderBy: { sortOrder: 'asc' } },
        otherLines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!sheet) throw new NotFoundException('Costing sheet not found');
    return sheet;
  }

  async get(id: string) {
    const sheet = await this.findOrThrow(id);
    return { ...sheet, rawMaterialLines: await this.withInventory(sheet.rawMaterialLines), totals: computeTotals(sheet) };
  }

  // Inventory master = IM_Item (legacy raw-SQL table: RecId, InventoryCode, InventoryName; soft-
  // deleted via IsDeleted — the same "not deleted" rule the Inventory Card list/lookup applies).
  // Unit = the item's Unit exactly as the Inventory Card list returns it (itemUnitNameLateral).
  private async activeInventoryItems(ids: number[]) {
    const unique = Array.from(new Set(ids));
    if (!unique.length) return new Map<number, { code: string; name: string; unit: string }>();
    const rows = await this.prisma.$queryRaw<{ id: number; code: string | null; name: string | null; unit: string | null }[]>(Prisma.sql`
      SELECT i."RecId"::int AS id, i."InventoryCode" AS code, i."InventoryName" AS name, unit_lookup."unitName" AS unit
      FROM "IM_Item" i
      ${itemUnitNameLateral('i')}
      WHERE i."RecId" IN (${Prisma.join(unique)}) AND i."IsDeleted" = 0
    `);
    return new Map(rows.map((r) => [Number(r.id), { code: r.code ?? '', name: r.name ?? '', unit: r.unit ?? '' }]));
  }

  // Raw Material lines as the screen shows them: a line bound to an Inventory item shows that
  // item's current code/name and a Unit valid for that item. A line saved before the binding existed (text only) is shown
  // bound when its code matches exactly one non-deleted item — resolved for display only; the id
  // is stored the next time the sheet is saved. Anything else is returned exactly as stored.
  private async withInventory<T extends { inventoryId: number | null; inventoryCode: string | null; inventoryName: string | null; unit: string | null }>(lines: T[]) {
    const bound = await this.activeInventoryItems(lines.filter((l) => l.inventoryId != null).map((l) => l.inventoryId!));
    const legacyCodes = Array.from(new Set(lines.filter((l) => l.inventoryId == null && l.inventoryCode?.trim()).map((l) => l.inventoryCode!.trim())));
    const byCode = new Map<string, number>();
    if (legacyCodes.length) {
      const rows = await this.prisma.$queryRaw<{ code: string; id: number; n: number }[]>(Prisma.sql`
        SELECT "InventoryCode" AS code, min("RecId")::int AS id, count(*)::int AS n
        FROM "IM_Item" WHERE "InventoryCode" IN (${Prisma.join(legacyCodes)}) AND "IsDeleted" = 0
        GROUP BY "InventoryCode"
      `);
      for (const r of rows) if (r.n === 1) byCode.set(r.code, Number(r.id));
    }
    const matched = await this.activeInventoryItems(Array.from(byCode.values()));
    const unitsByItem = await this.itemUnits([...bound.keys(), ...matched.keys()]);
    // A bound line's Unit is its saved Unit when that is one of the item's configured Units;
    // otherwise (never set, or no longer configured) the item's Main Unit. unitId is resolved
    // for the Unit dropdown only — it is not a stored column.
    const withUnit = <L extends { unit: string | null }>(l: L, id: number, fallback: string) => {
      const units = unitsByItem.get(id) ?? [];
      if (!units.length) return { ...l, unit: fallback, unitId: null };
      const u = matchItemUnit(units, null, l.unit) ?? units[0];
      return { ...l, unit: itemUnitLabel(u), unitId: Number(u.id) };
    };
    return lines.map((l) => {
      if (l.inventoryId != null) {
        const item = bound.get(l.inventoryId);
        return item ? withUnit({ ...l, inventoryCode: item.code, inventoryName: item.name }, l.inventoryId, item.unit) : { ...l, unitId: null };
      }
      const id = l.inventoryCode ? byCode.get(l.inventoryCode.trim()) : undefined;
      const item = id != null ? matched.get(id) : undefined;
      return item ? withUnit({ ...l, inventoryId: id!, inventoryName: item.name }, id!, item.unit) : { ...l, unitId: null };
    });
  }

  // Each item's configured Units — LegacyMasterLookupService.listItemUnits, the same per-item
  // Unit source (IM_ItemUnitItemSize, Main Unit first) the Style Card BOM's Unit dropdown uses.
  private async itemUnits(ids: number[]) {
    const unique = Array.from(new Set(ids));
    const lists = await Promise.all(unique.map((id) => this.masterLookupSvc.listItemUnits(id)));
    return new Map<number, any[]>(unique.map((id, i) => [id, lists[i]]));
  }

  async update(id: string, dto: any) {
    await this.findOrThrow(id);
    return this.prisma.costingSheet.update({ where: { id }, data: pickHeader(dto) });
  }

  async delete(id: string) {
    await this.findOrThrow(id);
    await this.prisma.costingSheet.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async upsertRawMaterialLines(id: string, lines: any[]) {
    await this.findOrThrow(id);
    // inventoryId (IM_Item.RecId) is the source of truth: it must be an existing, non-deleted
    // Inventory item, and the line's Inventory Code/Name are taken from that item — never from the
    // client — and its Unit must be one of that item's configured Units (below), so values of two
    // different items can't be saved together. A line with no
    // inventoryId (saved before the binding existed) keeps its typed text/unit as before. Every line
    // is validated before anything is replaced, and the replace is one transaction.
    const rows = lines || [];
    const ids = rows.map((l) => {
      if (l.inventoryId === undefined || l.inventoryId === null || l.inventoryId === '') return null;
      const n = Number(l.inventoryId);
      if (!Number.isInteger(n) || n <= 0) throw new BadRequestException(`Invalid Inventory reference "${l.inventoryId}".`);
      return n;
    });
    const items = await this.activeInventoryItems(ids.filter((n): n is number => n != null));
    const missing = ids.filter((n): n is number => n != null && !items.has(n));
    if (missing.length) throw new BadRequestException(`Inventory item ${missing.map((n) => `#${n}`).join(', ')} does not exist or has been deleted.`);
    // Unit of a bound line: resolved against that item's own configured Units exactly as the Style
    // Card BOM does (resolveLineUnitId: a Unit not configured for the item falls back to its Main
    // Unit; then assertValidItemUnit). The client's unitId is used, or else its Unit text matched
    // to one of the item's Units. An item with no configured Units keeps its listed Unit as before.
    const unitsByItem = await this.itemUnits(ids.filter((n): n is number => n != null));
    const units = await Promise.all(rows.map(async (l, i) => {
      const invId = ids[i];
      if (invId == null) return l.unit;
      const configured = unitsByItem.get(invId) ?? [];
      if (!configured.length) return items.get(invId)!.unit || null;
      const requested = l.unitId != null && l.unitId !== '' ? l.unitId : matchItemUnit(configured, null, l.unit)?.id ?? null;
      const unitId = await resolveLineUnitId(this.masterLookupSvc, invId, requested);
      await assertValidItemUnit(this.prisma, invId, unitId);
      const u = configured.find((x) => Number(x.id) === Number(unitId));
      return u ? itemUnitLabel(u) : null;
    }));
    await this.prisma.$transaction([
      this.prisma.costingRawMaterialLine.deleteMany({ where: { costingSheetId: id } }),
      this.prisma.costingRawMaterialLine.createMany({
        data: rows.map((l, i) => {
          const item = ids[i] != null ? items.get(ids[i]!) : undefined;
          return {
            groupCode: l.groupCode, groupName: l.groupName, inventoryId: ids[i],
            inventoryCode: item ? item.code : l.inventoryCode, inventoryName: item ? item.name : l.inventoryName,
            quantity: l.quantity ?? 0, wastePct: l.wastePct ?? 0,
            unitPrice: l.unitPrice ?? 0, forex: l.forex, unit: units[i], explanation: l.explanation,
            costDetail: l.costDetail ?? undefined, sortOrder: i, costingSheetId: id,
          };
        }),
      }),
    ]);
    return this.withInventory(await this.prisma.costingRawMaterialLine.findMany({ where: { costingSheetId: id }, orderBy: { sortOrder: 'asc' } }));
  }

  async upsertLaborLines(id: string, lines: any[]) {
    await this.findOrThrow(id);
    await this.prisma.costingLaborLine.deleteMany({ where: { costingSheetId: id } });
    if (lines?.length) {
      await this.prisma.costingLaborLine.createMany({
        data: lines.map((l, i) => ({
          groupCode: l.groupCode, groupName: l.groupName, explanation: l.explanation,
          quantity: l.quantity ?? 0, wastePct: l.wastePct ?? 0, forex: l.forex,
          unitPrice: l.unitPrice ?? 0, sortOrder: i, costingSheetId: id,
        })),
      });
    }
    return this.prisma.costingLaborLine.findMany({ where: { costingSheetId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async upsertOtherLines(id: string, lines: any[]) {
    await this.findOrThrow(id);
    await this.prisma.costingOtherLine.deleteMany({ where: { costingSheetId: id } });
    if (lines?.length) {
      await this.prisma.costingOtherLine.createMany({
        data: lines.map((l, i) => ({
          groupCode: l.groupCode, groupName: l.groupName, explanation: l.explanation,
          quantity: l.quantity ?? 0, forex: l.forex, unitPrice: l.unitPrice ?? 0,
          sortOrder: i, costingSheetId: id,
        })),
      });
    }
    return this.prisma.costingOtherLine.findMany({ where: { costingSheetId: id }, orderBy: { sortOrder: 'asc' } });
  }

  async listForStyleCard(styleCardId: string) {
    const sheets = await this.prisma.costingSheet.findMany({
      where: { styleCardId },
      include: {
        rawMaterialLines: { orderBy: { sortOrder: 'asc' } },
        laborLines: { orderBy: { sortOrder: 'asc' } },
        otherLines: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sheets.map((sheet) => ({ ...sheet, totals: computeTotals(sheet) }));
  }

  async issueForStyleCard(styleCardId: string, dto: any, branchId: string, createdBy: string) {
    const style = await this.prisma.styleCard.findUnique({ where: { id: styleCardId } });
    if (!style) throw new NotFoundException('Style card not found');
    const costingNo = dto?.costingNo || `CS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    return this.prisma.costingSheet.create({
      data: {
        ...pickHeader(dto || {}),
        costingNo,
        styleCardId,
        styleCode: style.styleNumber,
        styleName: style.title,
        branchId,
        createdBy,
      },
    });
  }

  // Exact mirror of listForStyleCard/issueForStyleCard above, own sampleCardId column — the
  // sheet itself is the same CostingSheet/lines model either way, just tagged to a Sample Card
  // instead of a Style Card.
  async listForSampleCard(sampleCardId: string) {
    const sheets = await this.prisma.costingSheet.findMany({
      where: { sampleCardId },
      include: {
        rawMaterialLines: { orderBy: { sortOrder: 'asc' } },
        laborLines: { orderBy: { sortOrder: 'asc' } },
        otherLines: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sheets.map((sheet) => ({ ...sheet, totals: computeTotals(sheet) }));
  }

  async issueForSampleCard(sampleCardId: string, dto: any, branchId: string, createdBy: string) {
    const sample = await this.prisma.sampleCard.findUnique({ where: { id: sampleCardId } });
    if (!sample) throw new NotFoundException('Sample card not found');
    const costingNo = dto?.costingNo || `CS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    return this.prisma.costingSheet.create({
      data: {
        ...pickHeader(dto || {}),
        costingNo,
        sampleCardId,
        styleCode: sample.sampleNumber,
        styleName: sample.title,
        branchId,
        createdBy,
      },
    });
  }

  async getProfitBreakdown(id: string) {
    const sheet = await this.findOrThrow(id);
    const totals = computeTotals(sheet);
    const rows = Array.from({ length: 20 }, (_, i) => {
      const rate = (i + 1) * 5;
      const profit = totals.netPrice * (rate / 100);
      const salesPrice = totals.netPrice + profit;
      return {
        rate, profit, salesPrice,
        pkrProfit: profit, pkrSalesPrice: salesPrice,
        usdProfit: profit / totals.usdRate, usdSalesPrice: salesPrice / totals.usdRate,
      };
    });
    return { netPrice: totals.netPrice, usdRate: totals.usdRate, rows };
  }
}
