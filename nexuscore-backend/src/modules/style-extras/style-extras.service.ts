import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LegacyMasterLookupService } from '../legacy-erp/legacy-master-lookup.service';
import { resolveLineUnitId, assertValidItemUnit } from '../legacy-erp/unit-conversion.util';

const BOM_LINE_FIELDS = [
  'lineType', 'fabricInventoryId', 'fabricCode', 'fabricName', 'unitId', 'explanation', 'placement', 'process', 'variant',
  'rowColumn', 'swatchCardId', 'willBeCut', 'mainFabric', 'unit', 'quantity', 'wastePct',
  'dyeWastagePct', 'otherWastagePct', 'unitPrice', 'component', 'dia', 'gauge',
  'finishWidth', 'finishRoute', 'revision',
  // Real StyleBomLine columns (added — see the model's own comment). Previously absent from this
  // whitelist, which is the actual root cause of the reported bug: bom-tab.tsx's save() already
  // sent these 3 values in every row's payload, but pickBomLine() below silently drops any key
  // not listed here before the row ever reaches Prisma, so they were never persisted regardless
  // of what the frontend sent — always reloading back as 0.
  'marketLength', 'marketWidth', 'marketWeight',
];

function pickBomLine(l: any) {
  const out: any = {};
  for (const f of BOM_LINE_FIELDS) if (l[f] !== undefined) out[f] = l[f];
  // swatchCardId is a real FK to SwatchCard (nullable) — the BOM grid's "Choose Color" cell
  // sends "" (its own <select> empty-option value), not null, when no color is picked. "" isn't
  // a valid SwatchCard.id, so Postgres rejects it as a foreign key violation on insert; only an
  // actual NULL satisfies "no color selected".
  if (out.swatchCardId === '') out.swatchCardId = null;
  return out;
}

const WASH_CARE_FIELDS = [
  'washing', 'bleaching', 'tumbleDrying', 'naturalDrying', 'ironing', 'chemicalCleaning', 'wetCleaning',
];

function pickWashCare(dto: any) {
  const out: any = {};
  for (const f of WASH_CARE_FIELDS) if (dto[f] !== undefined) out[f] = dto[f];
  return out;
}

@Injectable()
export class StyleExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterLookupSvc: LegacyMasterLookupService,
  ) {}

  private async findStyleCardOrThrow(styleCardId: string) {
    const style = await this.prisma.styleCard.findUnique({ where: { id: styleCardId } });
    if (!style) throw new NotFoundException('Style card not found');
    return style;
  }

  private async findSampleCardOrThrow(sampleCardId: string) {
    const sample = await this.prisma.sampleCard.findUnique({ where: { id: sampleCardId } });
    if (!sample) throw new NotFoundException('Sample card not found');
    return sample;
  }

  // ── BOM Lines ────────────────────────────────────────────────────────────────

  async getBomLines(styleCardId: string) {
    return this.prisma.styleBomLine.findMany({
      where: { styleCardId },
      include: { swatchCard: { select: { id: true, colorName: true, colorCode: true, pantoneCode: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertBomLines(styleCardId: string, lines: any[]) {
    await this.findStyleCardOrThrow(styleCardId);
    await this.prisma.styleBomLine.deleteMany({ where: { styleCardId } });
    if (lines?.length) {
      // Fabric/Trim Card = IM_Item (fabricInventoryId is that Item's RecId — see bom-tab.tsx's
      // own comment) so the exact same Item -> Unit resolution/validation Purchase Order and
      // Purchase Receipt already enforce (unit-conversion.util.ts, reused as-is) applies here:
      // a stale/foreign/hand-crafted unitId from the client is normalized to one of the card's
      // own configured units rather than trusted outright. Lines with no fabricInventoryId
      // (Ornament/Process, or a Fabric/Trim line with no card selected) pass through untouched —
      // resolveLineUnitId/assertValidItemUnit are both no-ops when inventoryId is null.
      const picked = await Promise.all(lines.map(async (l) => {
        const line = pickBomLine(l);
        line.unitId = await resolveLineUnitId(this.masterLookupSvc, line.fabricInventoryId, line.unitId);
        await assertValidItemUnit(this.prisma, line.fabricInventoryId, line.unitId);
        return line;
      }));
      await this.prisma.styleBomLine.createMany({
        data: picked.map((line, i) => ({ ...line, sortOrder: i, styleCardId })),
      });
    }
    return this.getBomLines(styleCardId);
  }

  // ── Sample Card BOM Lines — exact mirror of Style Card's above, own SampleBomLine table ─────

  async getSampleBomLines(sampleCardId: string) {
    return this.prisma.sampleBomLine.findMany({
      where: { sampleCardId },
      include: { swatchCard: { select: { id: true, colorName: true, colorCode: true, pantoneCode: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertSampleBomLines(sampleCardId: string, lines: any[]) {
    await this.findSampleCardOrThrow(sampleCardId);
    await this.prisma.sampleBomLine.deleteMany({ where: { sampleCardId } });
    if (lines?.length) {
      const picked = await Promise.all(lines.map(async (l) => {
        const line = pickBomLine(l);
        line.unitId = await resolveLineUnitId(this.masterLookupSvc, line.fabricInventoryId, line.unitId);
        await assertValidItemUnit(this.prisma, line.fabricInventoryId, line.unitId);
        return line;
      }));
      await this.prisma.sampleBomLine.createMany({
        data: picked.map((line, i) => ({ ...line, sortOrder: i, sampleCardId })),
      });
    }
    return this.getSampleBomLines(sampleCardId);
  }

  // ── Wash & Care ──────────────────────────────────────────────────────────────

  async getWashCare(styleCardId: string) {
    return this.prisma.styleWashCare.findUnique({ where: { styleCardId } });
  }

  async upsertWashCare(styleCardId: string, dto: any) {
    await this.findStyleCardOrThrow(styleCardId);
    const data = pickWashCare(dto || {});
    return this.prisma.styleWashCare.upsert({
      where: { styleCardId },
      create: { ...data, styleCardId },
      update: data,
    });
  }

  // ── Sample Card Wash & Care — exact mirror of Style Card's above, own SampleWashCare table ──

  async getSampleWashCare(sampleCardId: string) {
    return this.prisma.sampleWashCare.findUnique({ where: { sampleCardId } });
  }

  async upsertSampleWashCare(sampleCardId: string, dto: any) {
    await this.findSampleCardOrThrow(sampleCardId);
    const data = pickWashCare(dto || {});
    return this.prisma.sampleWashCare.upsert({
      where: { sampleCardId },
      create: { ...data, sampleCardId },
      update: data,
    });
  }

  // ── Expense Lines ────────────────────────────────────────────────────────────

  async getExpenseLines(styleCardId: string) {
    return this.prisma.styleExpenseLine.findMany({ where: { styleCardId }, orderBy: { sortOrder: 'asc' } });
  }

  async upsertExpenseLines(styleCardId: string, lines: any[]) {
    await this.findStyleCardOrThrow(styleCardId);
    await this.prisma.styleExpenseLine.deleteMany({ where: { styleCardId } });
    if (lines?.length) {
      await this.prisma.styleExpenseLine.createMany({
        data: lines.map((l, i) => ({
          expenseType: l.expenseType, explanation: l.explanation, quantity: l.quantity ?? 0,
          unitPrice: l.unitPrice ?? 0, forex: l.forex, sortOrder: i, styleCardId,
        })),
      });
    }
    return this.getExpenseLines(styleCardId);
  }
}
