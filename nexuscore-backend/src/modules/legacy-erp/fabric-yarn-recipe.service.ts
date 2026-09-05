import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FabricCardService } from './fabric-card.service';
import { YarnCardService } from './yarn-card.service';

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

  async getRecipe(fabricInventoryId: number) {
    return this.prisma.fabricYarnRecipeLine.findMany({
      where: { fabricInventoryId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertRecipe(fabricInventoryId: number, lines: any[]) {
    // Reuses FabricCardService.get's own existence check (AccessCode='FABRIC', not deleted) —
    // throws NotFoundException itself, nothing to duplicate here.
    await this.fabricCardSvc.get(fabricInventoryId);

    const cleaned = (lines || []).filter((l) => !isBlankLine(l));

    for (const l of cleaned) {
      const pct = Number(l.percentage);
      if (!Number.isFinite(pct) || pct < 0) {
        throw new BadRequestException(`Invalid % for Yarn row "${l.yarnCode || l.yarnName || ''}" — must be a number >= 0`);
      }
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

    await this.prisma.fabricYarnRecipeLine.deleteMany({ where: { fabricInventoryId } });
    if (cleaned.length) {
      await this.prisma.fabricYarnRecipeLine.createMany({
        data: cleaned.map((l, i) => ({
          fabricInventoryId,
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
    return this.getRecipe(fabricInventoryId);
  }
}
