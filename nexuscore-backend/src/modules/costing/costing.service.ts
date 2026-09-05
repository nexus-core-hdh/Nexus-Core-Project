import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));

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
  constructor(private readonly prisma: PrismaService) {}

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
    return { ...sheet, totals: computeTotals(sheet) };
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
    await this.prisma.costingRawMaterialLine.deleteMany({ where: { costingSheetId: id } });
    if (lines?.length) {
      await this.prisma.costingRawMaterialLine.createMany({
        data: lines.map((l, i) => ({
          groupCode: l.groupCode, groupName: l.groupName, inventoryCode: l.inventoryCode,
          inventoryName: l.inventoryName, quantity: l.quantity ?? 0, wastePct: l.wastePct ?? 0,
          unitPrice: l.unitPrice ?? 0, forex: l.forex, unit: l.unit, explanation: l.explanation,
          costDetail: l.costDetail ?? undefined, sortOrder: i, costingSheetId: id,
        })),
      });
    }
    return this.prisma.costingRawMaterialLine.findMany({ where: { costingSheetId: id }, orderBy: { sortOrder: 'asc' } });
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
