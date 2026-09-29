import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PipelineService } from './pipeline.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Pipeline')
@PermissionModule('crm', 'CRM')
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly svc: PipelineService) {}

  // Pipelines
  @Get() getPipelines(@CurrentUser() u: any) { return this.svc.getPipelines(u.companyId, u.branchId); }
  @Get(':id') getPipeline(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getPipeline(id, u.companyId); }
  @Post() createPipeline(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createPipeline(dto, u.companyId, u.branchId); }
  @Patch(':id') updatePipeline(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updatePipeline(id, dto, u.companyId); }
  @Delete(':id') deletePipeline(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deletePipeline(id, u.companyId); }

  // Stages
  @Post(':pipelineId/stages') createStage(@Param('pipelineId') pid: string, @Body() dto: any) { return this.svc.createStage(pid, dto); }
  @Patch('stages/:id') updateStage(@Param('id') id: string, @Body() dto: any) { return this.svc.updateStage(id, dto); }
  @Delete('stages/:id') deleteStage(@Param('id') id: string) { return this.svc.deleteStage(id); }

  // Connections
  @Post('connections') createConnection(@Body() dto: any) { return this.svc.createConnection(dto); }
  @Delete('connections/:id') deleteConnection(@Param('id') id: string) { return this.svc.deleteConnection(id); }

  // Dashboards
  @Get('dashboards/list') getDashboards(@CurrentUser() u: any) { return this.svc.getDashboards(u.companyId, u.id); }
  @Get('dashboards/:id') getDashboard(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getDashboard(id, u.companyId); }
  @Post('dashboards') createDashboard(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDashboard(dto, u.id, u.companyId, u.branchId); }
  @Patch('dashboards/:id') updateDashboard(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateDashboard(id, dto, u.companyId); }
  @Delete('dashboards/:id') deleteDashboard(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteDashboard(id, u.companyId); }
  @Patch('dashboards/:id/prefs') updateDashboardPref(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.upsertDashboardPref(id, u.id, dto);
  }
}
