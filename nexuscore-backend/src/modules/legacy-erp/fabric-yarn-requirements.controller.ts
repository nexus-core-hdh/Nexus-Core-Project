import { Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
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

  @Get('transactions') getTransactionDetails(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTransactionDetails(id);
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
  // Open to any authenticated user when UNLOCKED (unchanged baseline, no new permission
  // introduced for the unlocked case); the service layer's own assertMutationAllowed() is what
  // blocks this once locked — see fabric-yarn-requirements.service.ts's own comment on why this
  // lives in the service rather than a route guard here, and on why locking now blocks
  // unconditionally (no unlock-permission bypass).
  @Delete('all') deleteAllRequirements(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.deleteAllRequirements(id, userId);
  }

  // Delete ONE selected Requirement record — recordId is a real MA_Requirement.RecId, from
  // getSavedRequirements' own `id` field. Same lock enforcement as above.
  @Delete(':recordId') deleteRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Query('type') type: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.deleteRequirement(id, asTab(type), recordId, userId);
  }
}
