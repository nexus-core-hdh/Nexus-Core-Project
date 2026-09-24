import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CuttingCardService } from './cutting-card.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Cutting Card')
// Registered BEFORE WorkOrderController in legacy-erp.module.ts — WorkOrderController's own
// '/:id/:tab' catch-all (Explanation/Activities/Expenses satellites) would otherwise swallow
// '/:id/cutting-card' first, same reasoning as FabricYarnRequirementsController's own comment.
@Controller('legacy-erp/work-orders/:id/cutting-card')
export class CuttingCardController {
  constructor(private readonly svc: CuttingCardService) {}

  private requireColorAndFabric(color: string | undefined, materialKey: string | undefined) {
    if (!color || !color.trim()) throw new BadRequestException('A Production Color is required.');
    if (!materialKey || !materialKey.trim()) throw new BadRequestException('A Fabric must be selected.');
  }

  // Cutting Card MAIN screen — every real Production Color on this Work Order (from Manufacturing
  // Quantities, never invented) with its own per-size Order/Will-Be-Cut. No color/materialKey
  // query needed; this is the entry point BEFORE either is chosen.
  @Get('matrix') matrix(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getColorMatrix(id);
  }

  // Applicable Fabrics for ONE color — populates the Cutting Entry screen's own Fabric dropdown.
  @Get('fabrics') fabrics(@Param('id', ParseIntPipe) id: number, @Query('color') color: string | undefined) {
    if (!color || !color.trim()) throw new BadRequestException('A Production Color is required to list its applicable Fabrics.');
    return this.svc.listApplicableFabrics(id, color);
  }

  // Read-only aggregate (sum across every Fabric's own saved Cut Qty for this color) — the main
  // screen's own preview panel for a selected color, before the user has opened any one Fabric's
  // Cutting Entry.
  @Get('color-totals') colorTotals(@Param('id', ParseIntPipe) id: number, @Query('color') color: string | undefined) {
    if (!color || !color.trim()) throw new BadRequestException('A Production Color is required.');
    return this.svc.getColorCutTotals(id, color);
  }

  // Cutting Entry — one (Work Order, Color, Fabric) context. materialLabel is accepted here too
  // (not just on the mutating routes) purely so a get-or-create on first open already has a real
  // display label to store, instead of an empty string until the first write.
  @Get() get(
    @Param('id', ParseIntPipe) id: number,
    @Query('color') color: string | undefined,
    @Query('materialKey') materialKey: string | undefined,
    @Query('materialLabel') materialLabel: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    this.requireColorAndFabric(color, materialKey);
    return this.svc.getCuttingCard(id, color!, materialKey!, materialLabel || '', userId);
  }

  // Cutting Analysis Detail panel — Marker No/Spreader/CAD Operator/Cutter/Special Code/
  // Explanation/Fabric Type/Marker Weight/Plies/Count/Sent for Cutting/Increase/Return/End of
  // Roll/Clipping/Marker (Grams)/Actual (Grams). Cutting Loss % is never sent — it's always
  // computed server-side from Marker/Actual Grams (see getCuttingCard's own detail shape).
  @Post('detail') saveDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query('color') color: string | undefined,
    @Query('materialKey') materialKey: string | undefined,
    @Query('materialLabel') materialLabel: string | undefined,
    @Body() body: Record<string, any>,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    this.requireColorAndFabric(color, materialKey);
    return this.svc.saveCuttingCardDetail(id, color!, materialKey!, materialLabel || '', body || {}, userId, companyId);
  }

  // Cutting Entries log — one real, persisted row per actual cutting batch.
  @Post('entries') addEntry(
    @Param('id', ParseIntPipe) id: number,
    @Query('color') color: string | undefined,
    @Query('materialKey') materialKey: string | undefined,
    @Query('materialLabel') materialLabel: string | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    this.requireColorAndFabric(color, materialKey);
    return this.svc.addCuttingEntry(id, color!, materialKey!, materialLabel || '', userId, companyId);
  }

  @Put('entries/:entryId') updateEntry(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId') entryId: string,
    @Query('color') color: string | undefined,
    @Query('materialKey') materialKey: string | undefined,
    @Query('materialLabel') materialLabel: string | undefined,
    @Body() body: { date?: string | null; factoryId?: number | null; partyNo?: string | null; document?: string | null; explanation?: string | null },
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    this.requireColorAndFabric(color, materialKey);
    return this.svc.updateCuttingEntry(id, color!, materialKey!, materialLabel || '', entryId, body || {}, userId, companyId);
  }

  @Post('entries/:entryId/size') setEntrySize(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId') entryId: string,
    @Query('color') color: string | undefined,
    @Query('materialKey') materialKey: string | undefined,
    @Query('materialLabel') materialLabel: string | undefined,
    @Body() body: { sizeCode: string; quantity: number },
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    this.requireColorAndFabric(color, materialKey);
    if (!body?.sizeCode) throw new BadRequestException('sizeCode is required.');
    return this.svc.setCuttingEntrySize(id, color!, materialKey!, materialLabel || '', entryId, body.sizeCode, Number(body.quantity) || 0, userId, companyId);
  }

  @Delete('entries/:entryId') deleteEntry(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId') entryId: string,
    @Query('color') color: string | undefined,
    @Query('materialKey') materialKey: string | undefined,
    @Query('materialLabel') materialLabel: string | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    this.requireColorAndFabric(color, materialKey);
    return this.svc.deleteCuttingEntry(id, color!, materialKey!, materialLabel || '', entryId, userId, companyId);
  }
}
