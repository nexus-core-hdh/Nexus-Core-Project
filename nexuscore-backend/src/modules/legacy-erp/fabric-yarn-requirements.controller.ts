import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FabricYarnRequirementsService, RequirementTab } from './fabric-yarn-requirements.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

const asTab = (q?: string): RequirementTab => (q === 'yarn' || q === 'trim' ? q : 'fabric');

@ApiTags('Legacy ERP - Fabric/Trim/Yarn Requirements')
@Controller('legacy-erp/work-orders/:id/requirements')
export class FabricYarnRequirementsController {
  constructor(private readonly svc: FabricYarnRequirementsService) {}

  @Get() getRequirementsGrid(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    const tab = asTab(type);
    return tab === 'yarn' ? this.svc.getYarnRequirements(id) : this.svc.getMaterialRequirements(id, tab);
  }

  @Get('saved') getSavedRequirements(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.getSavedRequirements(id, asTab(type));
  }

  // See hasSavedHistory's own comment — lets the frontend's reload tell "never saved" apart from
  // "saved, then explicitly Deleted/Delete-All'd" instead of silently regenerating a live preview
  // of the material the user just deleted.
  @Get('has-history') hasSavedHistory(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.hasSavedHistory(id, asTab(type));
  }

  @Get('total') getTotalRequirements(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.getTotalRequirements(id, asTab(type));
  }

  @Get('manufacturing-quantity') getManufacturingQuantitySummary(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getManufacturingQuantitySummary(id);
  }

  // Additive — Multi-Color BOM mapping validation. New endpoint, does not change any existing
  // response shape (see the service's own comment on why this is separate from
  // getRequirementsGrid/calculate rather than folded into them).
  @Get('mapping-warnings') getMappingWarnings(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.getMappingWarnings(id, asTab(type));
  }

  // Optional ?inventoryId=&colorCardId= — when the user clicks a specific item on the
  // Requirements/Total Requirements grid, this scopes the receipts shown to exactly that
  // material (and, if the clicked row had one, that Material Color) instead of every receipt
  // linked to the whole Work Order. Omitted (the default, e.g. the initial page load), every
  // receipt for this Work Order is still returned, unchanged from before.
  @Get('transactions') getTransactionDetails(
    @Param('id', ParseIntPipe) id: number,
    @Query('inventoryId') inventoryId?: string,
    @Query('colorCardId') colorCardId?: string,
  ) {
    return this.svc.getTransactionDetails(id, inventoryId ? Number(inventoryId) : undefined, colorCardId || undefined);
  }

  // Manual Material Color selection directly on this Requirements screen — Fabric/Trim only (the
  // `type` query param is validated the same way every other route here already does; a bad/yarn
  // value simply falls through to "fabric" via asTab, matching this route's own DirectBomTab
  // restriction on the service side). `lineId` is a live requirement row's own `id` (see
  // getMaterialRequirements' own comment on what that id actually is).
  @Post('material-color') setMaterialColorForLine(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: string | undefined,
    @Body() body: { lineId: string; colorCardId: string | null },
    @CurrentUser('id') userId: string,
  ) {
    const tab = asTab(type);
    const lineType = tab === 'yarn' ? 'fabric' : tab;
    return this.svc.setMaterialColorForLine(id, lineType, String(body.lineId), body.colorCardId ?? null, Number(userId) || 1, userId);
  }

  // Manual Consumption edit directly on this Requirements screen — Fabric/Trim only, same
  // fallback-promotion rules as material-color above.
  @Post('consumption') setConsumptionForLine(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: string | undefined,
    @Body() body: { lineId: string; quantity: number },
    @CurrentUser('id') userId: string,
  ) {
    const tab = asTab(type);
    const lineType = tab === 'yarn' ? 'fabric' : tab;
    return this.svc.setConsumptionForLine(id, lineType, String(body.lineId), Number(body.quantity) || 0, Number(userId) || 1, userId);
  }

  // Visible to any authenticated user (same baseline as every other GET here) — canUnlock in the
  // response is what tells THIS viewer's own UI whether to show an enabled/disabled Unlock action.
  @Get('lock-status') getLockStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.getLockStatus(id, asTab(type), userId);
  }

  @Post('calculate') calculate(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.calculate(id, asTab(type), userId);
  }

  @Post('save') save(@Param('id', ParseIntPipe) id: number, @Query('type') type: string | undefined, @CurrentUser('id') userId: string) {
    return this.svc.save(id, asTab(type), Number(userId) || 1, userId);
  }

  // Route-level enforcement — RolesGuard rejects any caller without this permission before the
  // handler (or service method) ever runs. "Any normal user with lock permission" per the task.
  @Post('lock')
  @Permissions({ module: 'requirements', action: 'lock' })
  lock(@Param('id', ParseIntPipe) id: number, @Query('type') type: string | undefined, @CurrentUser('id') userId: string) {
    return this.svc.lockRequirement(id, asTab(type), userId);
  }

  // Route-level enforcement — "the most important rule" per the task: only a user explicitly
  // granted requirements:unlock can reach this at all, regardless of who locked it.
  @Post('unlock')
  @Permissions({ module: 'requirements', action: 'unlock' })
  unlock(@Param('id', ParseIntPipe) id: number, @Query('type') type: string | undefined, @CurrentUser('id') userId: string) {
    return this.svc.unlockRequirement(id, asTab(type), userId);
  }

  // Delete All — declared BEFORE the parameterized :recordId route just below (NestJS/Express
  // resolves DELETE routes in declaration order; :recordId would otherwise swallow a literal
  // "all" segment as an attempted numeric id and fail with 400 before this handler ever ran).
  // `type` scopes this to exactly the ONE Requirement type the caller's own screen is on — see
  // the service's own comment on why (this used to delete all three types at once, a real bug).
  // Open to any authenticated user when UNLOCKED (unchanged baseline, no new permission
  // introduced for the unlocked case); the service layer's own assertMutationAllowed() is what
  // blocks this once locked — see fabric-yarn-requirements.service.ts's own comment on why this
  // lives in the service rather than a route guard here, and on why locking now blocks
  // unconditionally (no unlock-permission bypass).
  @Delete('all') deleteAllRequirements(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: string | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.deleteAllRequirements(id, asTab(type), userId, companyId);
  }

  // Delete ONE selected Requirement record — recordId is a real MA_Requirement.RecId, from
  // getSavedRequirements' own `id` field. Same lock enforcement as above.
  @Delete(':recordId') deleteRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Query('type') type: string | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.deleteRequirement(id, asTab(type), recordId, userId, companyId);
  }
}
