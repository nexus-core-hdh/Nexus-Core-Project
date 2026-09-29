import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from './config.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Config')
@PermissionModule('settings', 'System settings & report configuration')
@Controller('config')
export class AppConfigController {
  constructor(private readonly svc: AppConfigService) {}

  // System Settings (key-value rows)
  @Get('system')
  getSystemSettings(@CurrentUser() u: any) { return this.svc.getSystemSettings(u.companyId); }

  @Patch('system')
  updateSystemSettings(@Body() dto: Record<string, string>, @CurrentUser() u: any) {
    return this.svc.upsertSystemSettings(u.companyId, dto, u.branchId);
  }

  // Menu Items
  @Get('menu') getMenuItems(@CurrentUser() u: any) { return this.svc.getMenuItems(u.companyId, u.branchId); }
  @Post('menu') createMenuItem(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createMenuItem(dto, u.companyId, u.branchId); }
  @Patch('menu/:id') updateMenuItem(@Param('id') id: string, @Body() dto: any) { return this.svc.updateMenuItem(id, dto); }
  @Delete('menu/:id') deleteMenuItem(@Param('id') id: string) { return this.svc.deleteMenuItem(id); }

  // Auto Numbering
  @Get('auto-numbering') getAutoNumbering(@CurrentUser() u: any) { return this.svc.getAutoNumberings(u.companyId); }
  @Patch('auto-numbering/:entity')
  upsertAutoNumbering(@Param('entity') entity: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.upsertAutoNumbering(u.companyId, entity, dto, u.branchId);
  }

  // Business Processes
  @Get('business-processes') getBPs(@CurrentUser() u: any) { return this.svc.getBusinessProcesses(u.companyId, u.branchId); }
  @Post('business-processes') createBP(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createBusinessProcess(dto, u.companyId, u.branchId); }
  @Patch('business-processes/:id') updateBP(@Param('id') id: string, @Body() dto: any) { return this.svc.updateBusinessProcess(id, dto); }
  @Delete('business-processes/:id') deleteBP(@Param('id') id: string) { return this.svc.deleteBusinessProcess(id); }

  // Analytical Reports
  @Get('analytical-reports') getReports(@CurrentUser() u: any) { return this.svc.getAnalyticalReports(u.companyId, u.branchId); }
  @Post('analytical-reports') createReport(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createAnalyticalReport(dto, u.companyId, u.branchId); }
  @Patch('analytical-reports/:id') updateReport(@Param('id') id: string, @Body() dto: any) { return this.svc.updateAnalyticalReport(id, dto); }
  @Delete('analytical-reports/:id') deleteReport(@Param('id') id: string) { return this.svc.deleteAnalyticalReport(id); }

  // Pricing Plans
  @Get('pricing-plans') getPricingPlans(@CurrentUser() u: any) { return this.svc.getPricingPlans(u.companyId); }
  @Post('pricing-plans') createPlan(@Body() dto: any) { return this.svc.createPricingPlan(dto); }
  @Patch('pricing-plans/:id') updatePlan(@Param('id') id: string, @Body() dto: any) { return this.svc.updatePricingPlan(id, dto); }
  @Delete('pricing-plans/:id') deletePlan(@Param('id') id: string) { return this.svc.deletePricingPlan(id); }

  // CRM Roles
  @Get('crm-roles') getCrmRoles(@CurrentUser() u: any) { return this.svc.getCrmRoles(u.companyId, u.branchId); }
  @Post('crm-roles') createCrmRole(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCrmRole(dto, u.companyId, u.branchId); }
  @Patch('crm-roles/:id') updateCrmRole(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCrmRole(id, dto); }
  @Delete('crm-roles/:id') deleteCrmRole(@Param('id') id: string) { return this.svc.deleteCrmRole(id); }

  // Access Control (list of rules per company)
  @Get('access-control') getAccessControl(@CurrentUser() u: any) { return this.svc.getAccessControls(u.companyId); }
  @Post('access-control') createAccessControl(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createAccessControl(u.companyId, dto); }
  @Patch('access-control/:id') updateAccessControl(@Param('id') id: string, @Body() dto: any) { return this.svc.updateAccessControl(id, dto); }
  @Delete('access-control/:id') deleteAccessControl(@Param('id') id: string) { return this.svc.deleteAccessControl(id); }

  // Security (list of settings per company)
  @Get('security') getSecuritySettings(@CurrentUser() u: any) { return this.svc.getSecuritySettings(u.companyId); }
  @Post('security') createSecuritySetting(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSecuritySetting(u.companyId, dto); }
  @Patch('security/:id') updateSecuritySetting(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSecuritySetting(id, dto); }
  @Delete('security/:id') deleteSecuritySetting(@Param('id') id: string) { return this.svc.deleteSecuritySetting(id); }

  // Permission Settings
  @Get('permissions')
  getPermissions(@CurrentUser() u: any, @Query('crmRoleId') crmRoleId?: string) {
    return this.svc.getPermissionSettings(u.companyId, crmRoleId);
  }

  @Post('permissions')
  createPermission(@Body() dto: any) { return this.svc.createPermissionSetting(dto); }

  @Patch('permissions/:id')
  updatePermission(@Param('id') id: string, @Body() dto: any) { return this.svc.updatePermissionSetting(id, dto); }

  @Delete('permissions/:id')
  deletePermission(@Param('id') id: string) { return this.svc.deletePermissionSetting(id); }

  // Report Templates
  @Get('report-templates') getReportTemplates(@CurrentUser() u: any) { return this.svc.getReportTemplates(u.companyId); }
  @Post('report-templates') createReportTemplate(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createReportTemplate(dto, u.companyId); }
  @Patch('report-templates/:id') updateReportTemplate(@Param('id') id: string, @Body() dto: any) { return this.svc.updateReportTemplate(id, dto); }
  @Delete('report-templates/:id') deleteReportTemplate(@Param('id') id: string) { return this.svc.deleteReportTemplate(id); }

  // PDF Reports
  @Get('pdf-reports') getPdfReports(@CurrentUser() u: any) { return this.svc.getPdfReports(u.companyId); }
  @Post('pdf-reports') createPdfReport(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createPdfReport(dto, u.companyId, u.id); }
  @Delete('pdf-reports/:id') deletePdfReport(@Param('id') id: string) { return this.svc.deletePdfReport(id); }
}
