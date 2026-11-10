import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { itemUnitNameLateral } from '../legacy-erp/inventory-card.service';
import { legacyCompanyOrNull } from '../legacy-erp/legacy-company-scope';
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

// Calculation-panel amounts the user may override (CostingSheet.manualAmounts, PKR). Same keys as
// the Costing Sheet screen's MANUAL_KEYS.
export const MANUAL_AMOUNT_KEYS = [
  'overhead', 'others', 'waste', 'gSupplies', 'excessProduction', 'profit', 'financialCost', 'commission', 'commission3',
] as const;
type ManualAmountKey = (typeof MANUAL_AMOUNT_KEYS)[number];
const MAX_AMOUNT = 9_999_999_999; // Decimal(14, 4) range of every other costing amount

/** Only known keys with finite, non-negative numbers (rounded to 4 dp) survive; null when empty. */
export function sanitizeManualAmounts(v: unknown): Partial<Record<ManualAmountKey, number>> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Partial<Record<ManualAmountKey, number>> = {};
  for (const k of MANUAL_AMOUNT_KEYS) {
    const raw = (v as any)[k];
    if (raw === null || raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`Manual amount "${k}" must be a non-negative number`);
    if (n > MAX_AMOUNT) throw new BadRequestException(`Manual amount "${k}" is too large`);
    out[k] = Math.round(n * 10000) / 10000;
  }
  return Object.keys(out).length ? out : null;
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
  manualAmounts?: any;
}) {
  // A manually overridden amount replaces its automatic value in the cascade; everything after
  // it (subtotals, prices) is still derived from the formulas below.
  const manual = (sheet.manualAmounts && typeof sheet.manualAmounts === 'object' ? sheet.manualAmounts : {}) as Record<string, any>;
  const pick = (k: ManualAmountKey, auto: number) => (manual[k] !== undefined && manual[k] !== null && Number.isFinite(Number(manual[k])) ? Number(manual[k]) : auto);
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
  const overheadAmt = pick('overhead', materialLabor * (num(sheet.overheadPct) / 100));
  // Others row of the panel (the Others grid's own total unless overridden).
  const othersAmt = pick('others', otherTotal);
  const costingSubtotal = materialLabor + overheadAmt + othersAmt;
  const wasteAmt = pick('waste', costingSubtotal * (num(sheet.wastePct) / 100));
  const gSuppliesAmt = pick('gSupplies', costingSubtotal * (num(sheet.gSuppliesPct) / 100));
  const excessProdAmt = pick('excessProduction', costingSubtotal * (num(sheet.excessProductionPct) / 100));
  const wasteTotal = wasteAmt + gSuppliesAmt + excessProdAmt;
  const profitAmt = pick('profit', (costingSubtotal + wasteTotal) * (num(sheet.profitPct) / 100));
  const financialCostAmt = pick('financialCost', (costingSubtotal + wasteTotal + profitAmt) * (num(sheet.financialCostPct) / 100));
  const commissionAmt = pick('commission', (costingSubtotal + wasteTotal + profitAmt) * (num(sheet.commissionPct) / 100));
  const commission3Amt = pick('commission3', (costingSubtotal + wasteTotal + profitAmt) * (num(sheet.commission3Pct) / 100));
  const commissionTotal = commissionAmt + commission3Amt;
  const calculatedPrice = costingSubtotal + wasteTotal + profitAmt + financialCostAmt + commissionTotal;
  const netPrice = calculatedPrice;
  const usdRate = num(sheet.foreignRate) || 1;
  const secondRate = num((sheet as any).secondForeignRate) || 1;
  const costForex1 = netPrice / usdRate;
  const costForex2 = netPrice / secondRate;

  return {
    rawTotal, laborTotal, otherTotal, othersAmt, materialLabor,
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
  'manualAmounts',
];

function pickHeader(dto: any) {
  const out: any = {};
  for (const f of HEADER_FIELDS) if (dto[f] !== undefined) out[f] = dto[f];
  if (out.costingDate) out.costingDate = new Date(out.costingDate);
  // Validated; an empty/cleared set is stored as SQL NULL (= every amount automatic).
  if (out.manualAmounts !== undefined) out.manualAmounts = sanitizeManualAmounts(out.manualAmounts) ?? Prisma.DbNull;
  return out;
}

@Injectable()
export class CostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterLookupSvc: LegacyMasterLookupService,
    private readonly audit: AuditService,
  ) {}

  // Every way a sheet is created (Costing Sheets screen, Issue from a Style/Sample Card) records
  // its CREATE audit event — what the dashboard's Recent Activity and the Audit Log read. Sheet and
  // event are written in one transaction: never a sheet missing from the activity, never an event
  // for a sheet that failed to save.
  private async createSheet(data: Prisma.CostingSheetUncheckedCreateInput, companyId: string | undefined, parent?: { type: string; id: string; documentNo: string | null }) {
    if (!companyId) return this.prisma.costingSheet.create({ data });
    return this.prisma.$transaction(async (tx) => {
      const sheet = await tx.costingSheet.create({ data });
      await this.audit.record({
        userId: data.createdBy as string,
        companyId,
        screenKey: '/plm/costing-sheets',
        entityType: 'CostingSheet',
        entityId: sheet.id,
        action: AUDIT_ACTIONS.CREATE,
        documentNo: sheet.costingNo,
        parentEntityType: parent?.type ?? null,
        parentEntityId: parent?.id ?? null,
        parentDocumentNo: parent?.documentNo ?? null,
        after: sheet,
      }, tx);
      return sheet;
    });
  }

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

  async create(dto: any, branchId: string, createdBy: string, companyId?: string) {
    const costingNo = dto.costingNo || `CS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    return this.createSheet({ ...pickHeader(dto), costingNo, branchId, createdBy }, companyId);
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
    const lockedBy = sheet.isLocked && sheet.lockedById
      ? await this.prisma.user.findUnique({ where: { id: sheet.lockedById }, select: { id: true, name: true } })
      : null;
    return { ...sheet, lockedBy, rawMaterialLines: await this.withInventory(sheet.rawMaterialLines), totals: computeTotals(sheet) };
  }

  // ── Lock / Unlock ──────────────────────────────────────────────────────────────────────────
  // A locked sheet refuses every change — header, lines, delete — for every user, the same rule
  // as the Work Order Requirements lock (fabric-yarn-requirements.service.ts): to change it, a
  // user with costing:unlock unlocks it first. Enforced here in the service, so no direct API
  // call can bypass it; the lock/unlock routes themselves are gated by @Permissions.

  /** The sheet, refusing with 409 when it is locked (every write path goes through this). */
  private async findUnlocked(id: string) {
    const sheet = await this.findOrThrow(id);
    if (sheet.isLocked) {
      const by = sheet.lockedById ? await this.prisma.user.findUnique({ where: { id: sheet.lockedById }, select: { name: true } }) : null;
      throw new ConflictException(`Costing sheet ${sheet.costingNo} is locked${by?.name ? ` by ${by.name}` : ''}. Unlock it before making changes.`);
    }
    return sheet;
  }

  // Same Role -> RolePermission -> Permission check RolesGuard runs (the existing module:action
  // RBAC) — used to tell the screens whether to offer Lock / Unlock, and as a second check inside
  // unlock() in case a future route reaches it without the guard.
  private async userHasPermission(userId: string, module: string, action: string): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return userRoles.some((ur) => ur.role.permissions.some((rp) => rp.permission.module === module && rp.permission.action === action));
  }

  // ── Lookup (Work Order → Detail → Initial Cost) ──────────────────────────────────────────────
  /**
   * Costing Sheets to pick from: the user's own branch (exactly what the Costing Sheets list shows
   * them), newest first, searched by Costing No / Style / Style Name / Buyer / Buyer Code / Brand,
   * at most `take` (≤ 50) per request with the total so the picker can say there are more. `id`
   * resolves one already-linked sheet for display — any branch of the user's company, since a Work
   * Order is the company's and may have been linked by another branch.
   */
  async lookup(user: { branchId?: string | null; companyId?: string | null }, q: { search?: string; id?: string; take?: string | number }) {
    const select = { id: true, costingNo: true, costingDate: true, styleCode: true, styleName: true, accountName: true, brand: true, isLocked: true } as const;
    if (q.id) {
      if (!user.companyId) return { data: [], total: 0 };
      // CostingSheet.branchId has no Prisma relation — the company's branches, then the sheet.
      const branches = await this.prisma.branch.findMany({ where: { companyId: user.companyId }, select: { id: true } });
      const one = await this.prisma.costingSheet.findFirst({ where: { id: String(q.id), branchId: { in: branches.map((b) => b.id) } }, select });
      return { data: one ? [one] : [], total: one ? 1 : 0 };
    }
    if (!user.branchId) return { data: [], total: 0 };
    const term = String(q.search ?? '').trim();
    const where: Prisma.CostingSheetWhereInput = {
      branchId: user.branchId,
      ...(term ? { OR: (['costingNo', 'styleCode', 'styleName', 'accountName', 'accountCode', 'brand'] as const).map((f) => ({ [f]: { contains: term, mode: 'insensitive' } })) } : {}),
    };
    const take = Math.min(Math.max(Number(q.take) || 50, 1), 50);
    const [data, total] = await Promise.all([
      this.prisma.costingSheet.findMany({ where, select, orderBy: [{ costingDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take }),
      this.prisma.costingSheet.count({ where }),
    ]);
    return { data, total };
  }

  async lockPermissions(userId: string) {
    const [canLock, canUnlock] = await Promise.all([
      this.userHasPermission(userId, 'costing', 'lock'),
      this.userHasPermission(userId, 'costing', 'unlock'),
    ]);
    return { canLock, canUnlock };
  }

  /** Only the user's own branch's sheets can be locked/unlocked (sheets are kept per branch). */
  private async ownSheet(id: string, branchId: string) {
    const sheet = await this.prisma.costingSheet.findUnique({ where: { id }, select: { id: true, costingNo: true, branchId: true, isLocked: true, lockedAt: true, lockedById: true } });
    if (!sheet || sheet.branchId !== branchId) throw new NotFoundException('Costing sheet not found');
    return sheet;
  }

  private async lockState(id: string) {
    const s = await this.prisma.costingSheet.findUnique({ where: { id }, select: { isLocked: true, lockedAt: true, lockedById: true } });
    const lockedBy = s?.isLocked && s.lockedById ? await this.prisma.user.findUnique({ where: { id: s.lockedById }, select: { id: true, name: true } }) : null;
    return { isLocked: !!s?.isLocked, lockedAt: s?.isLocked ? s.lockedAt : null, lockedBy };
  }

  async lock(id: string, user: { id: string; companyId?: string | null }, branchId: string) {
    const sheet = await this.ownSheet(id, branchId);
    // Conditional update: two users locking at once — exactly one wins, the other gets 409.
    const { count } = await this.prisma.costingSheet.updateMany({
      where: { id, isLocked: false },
      data: { isLocked: true, lockedAt: new Date(), lockedById: user.id },
    });
    if (!count) throw new ConflictException(`Costing sheet ${sheet.costingNo} is already locked.`);
    if (user.companyId) {
      await this.audit.recordSafe({
        userId: user.id, companyId: user.companyId, screenKey: '/plm/costing-sheets', entityType: 'CostingSheet',
        entityId: id, action: AUDIT_ACTIONS.LOCK, documentNo: sheet.costingNo,
        before: { isLocked: false }, after: { isLocked: true },
      });
    }
    return this.lockState(id);
  }

  async unlock(id: string, user: { id: string; companyId?: string | null }, branchId: string) {
    if (!(await this.userHasPermission(user.id, 'costing', 'unlock'))) {
      throw new ForbiddenException('You do not have permission to unlock costing sheets.');
    }
    const sheet = await this.ownSheet(id, branchId);
    const { count } = await this.prisma.costingSheet.updateMany({
      where: { id, isLocked: true },
      data: { isLocked: false, lockedAt: null, lockedById: null },
    });
    if (!count) throw new ConflictException(`Costing sheet ${sheet.costingNo} is not locked.`);
    if (user.companyId) {
      await this.audit.recordSafe({
        userId: user.id, companyId: user.companyId, screenKey: '/plm/costing-sheets', entityType: 'CostingSheet',
        entityId: id, action: AUDIT_ACTIONS.UNLOCK, documentNo: sheet.costingNo,
        before: { isLocked: true, lockedAt: sheet.lockedAt, lockedById: sheet.lockedById }, after: { isLocked: false },
      });
    }
    return this.lockState(id);
  }

  // ── Costing Form (Manage Reports document source, reports/costing-form.report.ts) ──────────
  /**
   * One saved sheet as the Costing Form prints it — every value is the sheet's own saved data or
   * computed with the screen's own formulas (computeTotals; the Cost Detail dialog's row amounts),
   * nothing invented. Looked up by Costing No within the user's own branch only.
   *
   * Sections: Raw Material lines whose Inventory item is a TRIM card → Trims & Accessories; every
   * other Raw Material line → Fabric & Lining (each with its saved Cost Detail raw / labor rows);
   * Others lines → Decoration & Testing; Labor lines → Cost of Labor.
   */
  async costingForm(costingNo: string, branchId: string | null | undefined) {
    const found = await this.prisma.costingSheet.findUnique({ where: { costingNo }, select: { id: true, branchId: true } });
    if (!found || !branchId || found.branchId !== branchId) throw new NotFoundException(`Costing sheet ${costingNo} was not found`);
    const sheet = await this.get(found.id);
    const t = sheet.totals;
    const n = (v: any) => num(v);
    const r4 = (v: number) => Math.round(v * 10000) / 10000;

    // Item type (IM_Item.AccessCode: FABRIC / TRIM / YARN) of the bound lines, company-scoped like
    // every other IM_Item read here.
    const invIds = Array.from(new Set(sheet.rawMaterialLines.map((l: any) => l.inventoryId).filter((x: any) => x != null).map(Number)));
    const access = new Map<number, string>();
    if (invIds.length) {
      const rows = await this.prisma.$queryRaw<{ id: number; access: string | null }[]>(Prisma.sql`
        SELECT "RecId"::int AS id, "AccessCode" AS access FROM "IM_Item"
        WHERE "RecId" IN (${Prisma.join(invIds)}) AND "CompanyId" = ${(await legacyCompanyOrNull(this.prisma))?.legacyCompanyId ?? -1}
      `);
      for (const r of rows) access.set(Number(r.id), String(r.access ?? '').toUpperCase());
    }

    const lineAmount = (l: any) => n(l.quantity) * n(l.unitPrice) * (1 + n(l.wastePct) / 100);
    const fabrics: any[] = [];
    const trims: any[] = [];
    for (const l of sheet.rawMaterialLines as any[]) {
      const base = {
        itemType: l.groupName || '', description: l.inventoryName || '', itemRef: l.inventoryCode || '', explanation: l.explanation || '',
        consumption: n(l.quantity), wastePct: n(l.wastePct), calculatedQty: r4(n(l.quantity) * (1 + n(l.wastePct) / 100)),
        unit: l.unit || '', rate: n(l.unitPrice), forex: l.forex || '', totalCost: r4(lineAmount(l)),
      };
      if (l.inventoryId != null && access.get(Number(l.inventoryId)) === 'TRIM') { trims.push(base); continue; }
      // Saved Cost Detail rows (Cost Detail Entry dialog): only rows that carry something; amounts
      // with the dialog's own formulas.
      const d = l.costDetail && typeof l.costDetail === 'object' ? (l.costDetail as any) : null;
      const raw = (Array.isArray(d?.materials) ? d.materials : [])
        .filter((m: any) => String(m?.explanation ?? '').trim() || n(m?.price) || n(m?.pct) || n(m?.laborAmount))
        .map((m: any) => ({
          detail: 'Raw', explanation: String(m.explanation ?? ''), price: n(m.price), pct: n(m.pct), wastePct: n(m.wastePct),
          wasteType: String(m.wasteType ?? ''), laborType: String(m.laborType ?? ''), laborAmount: n(m.laborAmount),
          amount: r4(n(m.price) * (n(m.pct) / 100) * (1 + n(m.wastePct) / 100) + n(m.laborAmount)),
        }));
      const labor = (Array.isArray(d?.labor) ? d.labor : [])
        .filter((x: any) => String(x?.explanation ?? '').trim() || n(x?.price) || n(x?.pct))
        .map((x: any) => ({
          detail: 'Labor', explanation: String(x.explanation ?? ''), price: n(x.price), pct: n(x.pct), type: String(x.type ?? ''),
          amount: r4(n(x.price) * (1 + n(x.pct) / 100)),
        }));
      const manufacturingWaste = parseFloat(d?.manufacturingWaste) || 0;
      const dyePrintWaste = parseFloat(d?.dyePrintWastagePct) || 0;
      fabrics.push({
        ...base, raw, labor,
        manufacturingPrice: n(d?.manufacturingPrice), manufacturingWastePct: manufacturingWaste,
        manufacturingAmount: r4(n(d?.manufacturingPrice) * (1 + manufacturingWaste / 100)),
        dyePrintPrice: n(d?.dyePrintPrice), dyePrintWastePct: dyePrintWaste,
        dyePrintAmount: r4(n(d?.dyePrintPrice) * (1 + dyePrintWaste / 100)),
      });
    }
    const decoration = (sheet.otherLines as any[]).map((l) => ({
      item: l.groupName || '', itemRef: l.explanation || '', groupCode: l.groupCode || '', quantity: n(l.quantity), forex: l.forex || '',
      unitPrice: n(l.unitPrice), totalCost: r4(n(l.quantity) * n(l.unitPrice)),
    }));
    const labor = (sheet.laborLines as any[]).map((l) => ({
      item: l.groupName || '', itemRef: l.explanation || '', groupCode: l.groupCode || '', quantity: n(l.quantity), wastePct: n(l.wastePct),
      forex: l.forex || '', unitPrice: n(l.unitPrice), totalCost: r4(lineAmount(l)),
    }));

    // Summary: each amount as computeTotals has it (manual overrides included) with its effective %
    // (the saved % column, which the screen keeps in step with a manual amount on save).
    const fc = sheet.foreignCurrency || 'Forex';
    const rate = t.usdRate;
    const summaryLine = (key: string, label: string, pct: number | null, pkr: number) => ({ key, label, pct, forex: r4(pkr / rate), pkr: r4(pkr) });
    const summary = [
      summaryLine('overhead', 'Overhead Value', n(sheet.overheadPct), t.overheadAmt),
      summaryLine('commission', 'Buying House Commission', n(sheet.commissionPct), t.commissionAmt),
      summaryLine('commission3', 'Buying House Commission (3)', n(sheet.commission3Pct), t.commission3Amt),
      summaryLine('financialCost', 'Financial Cost', n(sheet.financialCostPct), t.financialCostAmt),
      summaryLine('waste', 'Waste', n(sheet.wastePct), t.wasteAmt),
      summaryLine('gSupplies', 'G. Supplies', n(sheet.gSuppliesPct), t.gSuppliesAmt),
      summaryLine('excessProduction', 'Excess Production', n(sheet.excessProductionPct), t.excessProdAmt),
      summaryLine('profit', 'Profit', n(sheet.profitPct), t.profitAmt),
      summaryLine('netFob', 'Net FOB', null, t.netPrice),
    ];

    const styleCard = sheet.styleCardId
      ? await this.prisma.styleCard.findUnique({ where: { id: sheet.styleCardId }, select: { season: true } })
      : null;
    return {
      header: {
        costingNo: sheet.costingNo, costingDate: sheet.costingDate, buyer: sheet.accountName || '', accountCode: sheet.accountCode || '',
        brand: sheet.brand || '', category: sheet.category || '', season: styleCard?.season || '',
        styleCode: sheet.styleCode || '', styleName: sheet.styleName || '', orderQuantity: n(sheet.orderQuantity),
        currency: 'PKR', exchangeRate: n(sheet.pkrRate) || 1, foreignCurrency: fc, foreignRate: n(sheet.foreignRate),
        paymentTerms: sheet.paymentTerms || '', shippingTerms: sheet.shippingTerms || '',
        excessProductionPct: n(sheet.excessProductionPct), fobPrice: r4(t.netPrice), fobPriceForex: r4(t.netPrice / rate),
        overheadPct: n(sheet.overheadPct), overheadAmount: r4(t.overheadAmt),
        excessProductionAmount: r4(t.excessProdAmt), financialCostPct: n(sheet.financialCostPct), financialCostAmount: r4(t.financialCostAmt),
        quotedPriceForex: sheet.quotedPriceForex || '', quotedPrice: n(sheet.quotedPrice), locked: sheet.isLocked,
      },
      fabrics, trims, decoration, labor, summary,
      totals: {
        fabric: r4(fabrics.reduce((s, x) => s + x.totalCost, 0)), trims: r4(trims.reduce((s, x) => s + x.totalCost, 0)),
        decoration: r4(decoration.reduce((s, x) => s + x.totalCost, 0)), labor: r4(labor.reduce((s, x) => s + x.totalCost, 0)),
      },
      foreignCurrency: fc,
    };
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
      WHERE i."RecId" IN (${Prisma.join(unique)}) AND i."IsDeleted" = 0 AND i."CompanyId" = ${(await legacyCompanyOrNull(this.prisma))?.legacyCompanyId ?? -1}
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
        FROM "IM_Item" WHERE "InventoryCode" IN (${Prisma.join(legacyCodes)}) AND "IsDeleted" = 0 AND "CompanyId" = ${(await legacyCompanyOrNull(this.prisma))?.legacyCompanyId ?? -1}
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
    await this.findUnlocked(id);
    return this.prisma.costingSheet.update({ where: { id }, data: pickHeader(dto) });
  }

  async delete(id: string) {
    const sheet = await this.findUnlocked(id);
    // A Work Order's Initial Cost (MA_WorkOrder."CostingSheetId", FK RESTRICT) — refuse with the
    // Work Order numbers instead of a raw constraint error; the link is never silently dropped.
    const linked = await this.prisma.$queryRaw<{ no: string | null; deleted: number }[]>(Prisma.sql`
      SELECT "WorkOrderNo" AS no, "IsDeleted"::int AS deleted FROM "MA_WorkOrder" WHERE "CostingSheetId" = ${id} ORDER BY "IsDeleted", "WorkOrderNo"
    `);
    if (linked.length) {
      const names = linked.slice(0, 5).map((w) => `${w.no ?? '?'}${w.deleted ? ' (deleted)' : ''}`).join(', ');
      throw new ConflictException(`Costing sheet ${sheet.costingNo} is the Initial Cost of Work Order ${names}${linked.length > 5 ? ` and ${linked.length - 5} more` : ''}. Change their Initial Cost first.`);
    }
    await this.prisma.costingSheet.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async upsertRawMaterialLines(id: string, lines: any[]) {
    await this.findUnlocked(id);
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
    await this.findUnlocked(id);
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
    await this.findUnlocked(id);
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

  async issueForStyleCard(styleCardId: string, dto: any, branchId: string, createdBy: string, companyId?: string) {
    const style = await this.prisma.styleCard.findUnique({ where: { id: styleCardId } });
    if (!style) throw new NotFoundException('Style card not found');
    const costingNo = dto?.costingNo || `CS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    return this.createSheet({
      ...pickHeader(dto || {}),
      costingNo,
      styleCardId,
      styleCode: style.styleNumber,
      styleName: style.title,
      branchId,
      createdBy,
    }, companyId, { type: 'StyleCard', id: styleCardId, documentNo: style.styleNumber });
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

  async issueForSampleCard(sampleCardId: string, dto: any, branchId: string, createdBy: string, companyId?: string) {
    const sample = await this.prisma.sampleCard.findUnique({ where: { id: sampleCardId } });
    if (!sample) throw new NotFoundException('Sample card not found');
    const costingNo = dto?.costingNo || `CS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    return this.createSheet({
      ...pickHeader(dto || {}),
      costingNo,
      sampleCardId,
      styleCode: sample.sampleNumber,
      styleName: sample.title,
      branchId,
      createdBy,
    }, companyId, { type: 'SampleCard', id: sampleCardId, documentNo: sample.sampleNumber });
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
