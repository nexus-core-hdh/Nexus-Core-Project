import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FabricCardService } from './fabric-card.service';
import { YarnCardService } from './yarn-card.service';
import { assertAllNonNegative } from './numeric-guards.util';

// A row with no Yarn selected and no % typed yet (a just-added, still-empty grid row) is dropped
// before validation/save rather than treated as an invalid 0% line — the same "don't validate an
// obviously-incomplete draft row" convention BOM lines already follow.
function isBlankLine(l: any): boolean {
  return l.yarnInventoryId == null && !(Number(l.percentage) > 0);
}

@Injectable()
export class FabricYarnRecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fabricCardSvc: FabricCardService,
    private readonly yarnCardSvc: YarnCardService,
  ) {}

  // colorCardId omitted/undefined -> the Fabric's Common/Overall recipe (rows with colorCardId
  // NULL). A real ColorCard.id -> that ONE color's own override recipe, exact match only — this
  // never falls back to Common on its own; resolveEffectiveRecipe below is what applies the
  // Color-Specific-then-Common priority. Used directly by the dialog (which always knows exactly
  // which bucket it's editing) and internally by resolveEffectiveRecipe.
  async getRecipe(fabricInventoryId: number, colorCardId?: string | null) {
    return this.prisma.fabricYarnRecipeLine.findMany({
      where: { fabricInventoryId, colorCardId: colorCardId ?? null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Recipe priority — Color-Specific overrides Common/Overall ──────────────────────────────
  // Color-Specific Recipe exists for this exact (fabricInventoryId, colorCardId) -> use it.
  // Otherwise -> the Fabric's Common/Overall recipe. Neither exists -> empty array, meaning "Yarn
  // Recipe Not Defined" to every caller (fabric-yarn-requirements.service.ts's own
  // getYarnRequirements already treats an empty recipe as "nothing to explode for this line", and
  // separately surfaces a non-fatal warning for exactly this case — see that file's own
  // buildYarnRecipeWarnings). This is the ONLY new calculation/selection logic this feature adds;
  // the Yarn math itself (percentage x Fabric Requirement, wastage, unit conversion) is completely
  // untouched and lives entirely in the caller.
  async resolveEffectiveRecipe(fabricInventoryId: number, colorCardId: string | null | undefined) {
    if (colorCardId) {
      const colorSpecific = await this.getRecipe(fabricInventoryId, colorCardId);
      if (colorSpecific.length) return colorSpecific;
    }
    return this.getRecipe(fabricInventoryId, null);
  }

  // Color dropdown source for the Yarn Recipe dialog — ONLY colors actually assigned to THIS
  // Fabric's own BOM "Choose Color" cell, i.e. StyleBomLine.colorCardId / SampleBomLine.colorCardId
  // (the same two back-relations ColorCard itself declares — styleBomLines/sampleBomLines — the
  // app's one real "a user picked this Material Color on this Fabric's BOM line" signal), scoped to
  // this fabric's own fabricInventoryId.
  //
  // Deliberately EXCLUDES two sources an earlier version of this method unioned in, both proven
  // wrong by a real-data audit (Fabric-00007/id 24): MA_RecipeItem.ColorCardId (a Work Order's own
  // transferred BOM) pulled in colors from EVERY Work Order that has ever produced this Fabric
  // Card, across unrelated Styles/orders — including colors a common/unmapped BOM line only ever
  // received via assignProductionColorCycle's ordinal Nth-color assignment at transfer time, never
  // a real "Choose Color" selection (confirmed live: Fabric-00007's own StyleBomLine has exactly 4
  // colors — Dark Denim/Deep Lichen Green/Navy Blue/Oxford Tan — while its MA_RecipeItem rows, from
  // 9 different Work Orders, additionally pulled in 19-5414 TCX/Snow White/PTA NI KI NAME, none of
  // which are on the Fabric's own BOM). FabricYarnRecipeLine.colorCardId (a color that already has
  // a saved Color-Specific recipe) was also wrong to include: whether a color's recipe HAS been
  // configured is exactly the question resolveEffectiveRecipe/the dialog itself already answers —
  // it must never feed back into "is this color even selectable," or a stale/orphaned override
  // (BOM since changed) would keep offering a color with no real BOM connection at all.
  async listAvailableColors(fabricInventoryId: number) {
    await this.fabricCardSvc.get(fabricInventoryId);
    const rows = await this.prisma.$queryRaw<{ colorCardId: string }[]>`
      SELECT DISTINCT "colorCardId" FROM "StyleBomLine" WHERE "fabricInventoryId" = ${fabricInventoryId} AND "colorCardId" IS NOT NULL
      UNION
      SELECT DISTINCT "colorCardId" FROM "SampleBomLine" WHERE "fabricInventoryId" = ${fabricInventoryId} AND "colorCardId" IS NOT NULL
    `;
    const ids = rows.map((r) => r.colorCardId);
    if (!ids.length) return [];
    const cards = await this.prisma.colorCard.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, color: true } });
    return cards.sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || ''));
  }

  // Yarn Recipe list screen (legacy-erp/yarn-recipes) — one summary row per bucket that actually
  // HAS rows saved: the Fabric's Common/Overall bucket (colorCardId NULL) if it has any rows, plus
  // one row per color that has its OWN Color-Specific override actually saved (distinct colorCardId
  // among FabricYarnRecipeLine itself — NOT listAvailableColors' wider BOM-availability list, which
  // deliberately includes colors that could still receive an override but don't have one yet; the
  // list screen only ever shows overrides that genuinely exist, per the "Color Override rows only
  // exist when an actual override has been configured" rule). totalPct/updatedAt are derived from
  // each bucket's own rows — the same total-percentage figure the dialog itself computes, and the
  // most recent write among that bucket's rows (Prisma's own @updatedAt on this model).
  async listRecipeSummaries(fabricInventoryId: number) {
    const rows = await this.prisma.fabricYarnRecipeLine.findMany({
      where: { fabricInventoryId },
      orderBy: { sortOrder: 'asc' },
    });
    if (!rows.length) return [];

    const byBucket = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const key = r.colorCardId ?? null;
      const list = byBucket.get(key) ?? [];
      list.push(r);
      byBucket.set(key, list);
    }

    const colorIds = Array.from(byBucket.keys()).filter((k): k is string => !!k);
    const colors = await this.resolveColors(colorIds);

    const summaries = Array.from(byBucket.entries()).map(([colorCardId, bucketRows]) => {
      const totalPct = bucketRows.reduce((sum, r) => sum + Number(r.percentage), 0);
      const updatedAt = bucketRows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), bucketRows[0].updatedAt);
      const color = colorCardId ? colors.get(colorCardId) : null;
      return {
        recipeType: colorCardId ? ('color' as const) : ('common' as const),
        colorCardId,
        colorCode: color?.code ?? null,
        colorName: color?.name ?? null,
        colorSwatch: color?.color ?? null,
        rowCount: bucketRows.length,
        totalPct: Math.round(totalPct * 10000) / 10000,
        updatedAt,
      };
    });

    // Common first (colorCardId null sorts first), then colors alphabetically by code/name.
    summaries.sort((a, b) => {
      if (!a.colorCardId && !b.colorCardId) return 0;
      if (!a.colorCardId) return -1;
      if (!b.colorCardId) return 1;
      return (a.colorCode || a.colorName || '').localeCompare(b.colorCode || b.colorName || '');
    });
    return summaries;
  }

  private async resolveColors(colorCardIds: string[]): Promise<Map<string, { code: string; name: string; color: string }>> {
    if (!colorCardIds.length) return new Map();
    const cards = await this.prisma.colorCard.findMany({ where: { id: { in: colorCardIds } }, select: { id: true, code: true, name: true, color: true } });
    return new Map(cards.map((c) => [c.id, { code: c.code, name: c.name, color: c.color }]));
  }

  async upsertRecipe(fabricInventoryId: number, lines: any[], colorCardId?: string | null) {
    // Reuses FabricCardService.get's own existence check (AccessCode='FABRIC', not deleted) —
    // throws NotFoundException itself, nothing to duplicate here.
    await this.fabricCardSvc.get(fabricInventoryId);
    // A Color-Specific recipe must be linked to a REAL ColorCard — same existence-check convention
    // as the Fabric/Yarn Card checks just below, never trusting a client-sent id alone. Common/
    // Overall (colorCardId omitted/null) has nothing extra to validate.
    if (colorCardId) {
      const card = await this.prisma.colorCard.findUnique({ where: { id: colorCardId } });
      if (!card) throw new BadRequestException('Selected color was not found — pick a color from the list.');
    }
    const scopedColorCardId = colorCardId ?? null;

    const cleaned = (lines || []).filter((l) => !isBlankLine(l));

    for (const l of cleaned) {
      const pct = Number(l.percentage);
      if (!Number.isFinite(pct) || pct < 0) {
        throw new BadRequestException(`Invalid % for Yarn row "${l.yarnCode || l.yarnName || ''}" — must be a number >= 0`);
      }
      assertAllNonNegative({ 'Waste %': l.wastePct, 'Dye Wastage %': l.dyeWastagePct });
      // Reuses YarnCardService.get's own existence check (AccessCode='YARN', not deleted) —
      // throws NotFoundException for an invalid/foreign id, never trusts the client's id alone.
      if (l.yarnInventoryId != null) await this.yarnCardSvc.get(Number(l.yarnInventoryId));
    }

    if (cleaned.length) {
      const total = cleaned.reduce((sum, l) => sum + (Number(l.percentage) || 0), 0);
      // Small tolerance for floating-point/rounding noise from the client, not a relaxed rule —
      // 99.99% or 100.01% still means "not 100%" to a user, this only absorbs 0.005 (400 * 12.5%
      // stored to 2 decimals) style rounding.
      if (Math.abs(total - 100) > 0.01) {
        throw new BadRequestException(`Total Yarn % must equal 100% (currently ${total.toFixed(2)}%)`);
      }
    }

    // Scoped to (fabricInventoryId, colorCardId) — deliberately NOT fabricInventoryId alone: this
    // bucket's own delete-then-recreate must never touch the Common/Overall recipe or any OTHER
    // color's own recipe for the same fabric. This is the one change that actually makes "Common =
    // default, Color-Specific = optional override, never duplicated" hold at the storage layer —
    // saving Red's override recipe leaves Dark Denim/Navy Blue/Oxford Tan (which have no rows of
    // their own at all) and the Common recipe completely untouched.
    await this.prisma.fabricYarnRecipeLine.deleteMany({ where: { fabricInventoryId, colorCardId: scopedColorCardId } });
    if (cleaned.length) {
      await this.prisma.fabricYarnRecipeLine.createMany({
        data: cleaned.map((l, i) => ({
          fabricInventoryId,
          colorCardId: scopedColorCardId,
          yarnInventoryId: l.yarnInventoryId != null ? Number(l.yarnInventoryId) : null,
          yarnCode: l.yarnCode || null,
          yarnName: l.yarnName || null,
          explanation: l.explanation || null,
          variant1: l.variant1 || null,
          variant2: l.variant2 || null,
          process: l.process || null,
          knittedInVariants: l.knittedInVariants || null,
          percentage: l.percentage ?? 0,
          wastePct: l.wastePct ?? 0,
          dyeWastagePct: l.dyeWastagePct ?? 0,
          sortOrder: i,
        })),
      });
    }
    return this.getRecipe(fabricInventoryId, scopedColorCardId);
  }
}
