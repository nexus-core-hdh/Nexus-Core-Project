import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlmDefinitionsService } from './plm-definitions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('PLM Definitions')
@Controller('plm')
export class PlmDefinitionsController {
  constructor(private readonly svc: PlmDefinitionsService) {}

  // Style Sample Types
  @Get('style-sample-types') listSampleTypes() { return this.svc.listSampleTypes(); }
  @Post('style-sample-types') createSampleType(@Body() dto: any) { return this.svc.createSampleType(dto); }
  @Get('style-sample-types/:id') getSampleType(@Param('id') id: string) { return this.svc.getSampleType(id); }
  @Put('style-sample-types/:id') updateSampleType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSampleType(id, dto); }
  @Delete('style-sample-types/:id') deleteSampleType(@Param('id') id: string) { return this.svc.deleteSampleType(id); }

  // Design Detail Types
  @Get('design-detail-types') listDesignDetailTypes() { return this.svc.listDesignDetailTypes(); }
  @Post('design-detail-types') createDesignDetailType(@Body() dto: any) { return this.svc.createDesignDetailType(dto); }
  @Get('design-detail-types/:id') getDesignDetailType(@Param('id') id: string) { return this.svc.getDesignDetailType(id); }
  @Put('design-detail-types/:id') updateDesignDetailType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateDesignDetailType(id, dto); }
  @Delete('design-detail-types/:id') deleteDesignDetailType(@Param('id') id: string) { return this.svc.deleteDesignDetailType(id); }

  // Measurement Definitions
  @Get('measurement-definitions') listMeasurementDefs() { return this.svc.listMeasurementDefs(); }
  @Post('measurement-definitions') createMeasurementDef(@Body() dto: any) { return this.svc.createMeasurementDef(dto); }
  @Get('measurement-definitions/:id') getMeasurementDef(@Param('id') id: string) { return this.svc.getMeasurementDef(id); }
  @Put('measurement-definitions/:id') updateMeasurementDef(@Param('id') id: string, @Body() dto: any) { return this.svc.updateMeasurementDef(id, dto); }
  @Delete('measurement-definitions/:id') deleteMeasurementDef(@Param('id') id: string) { return this.svc.deleteMeasurementDef(id); }

  // Measurement Charts
  @Get('measurement-charts') listMeasurementCharts(@CurrentUser() u: any, @Query('branchId') branchId?: string) { return this.svc.listMeasurementCharts(branchId || u.branchId); }
  @Post('measurement-charts') createMeasurementChart(@Body() dto: any) { return this.svc.createMeasurementChart(dto); }
  @Get('measurement-charts/:id') getMeasurementChart(@Param('id') id: string) { return this.svc.getMeasurementChart(id); }
  @Put('measurement-charts/:id') updateMeasurementChart(@Param('id') id: string, @Body() dto: any) { return this.svc.updateMeasurementChart(id, dto); }
  @Delete('measurement-charts/:id') deleteMeasurementChart(@Param('id') id: string) { return this.svc.deleteMeasurementChart(id); }
  @Put('measurement-charts/:id/lines') upsertChartLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertChartLines(id, lines); }

  // Departments
  @Get('department-cards') listDepartments(@CurrentUser() u: any, @Query('branchId') b?: string) { return this.svc.listDepartments(b || u.branchId); }
  @Post('department-cards') createDepartment(@Body() dto: any) { return this.svc.createDepartment(dto); }
  @Get('department-cards/:id') getDepartment(@Param('id') id: string) { return this.svc.getDepartment(id); }
  @Put('department-cards/:id') updateDepartment(@Param('id') id: string, @Body() dto: any) { return this.svc.updateDepartment(id, dto); }
  @Delete('department-cards/:id') deleteDepartment(@Param('id') id: string) { return this.svc.deleteDepartment(id); }
  @Get('department-cards/:id/employees') getDeptEmployees(@Param('id') id: string) { return this.svc.getDepartmentEmployees(id); }

  // Process Cards
  @Get('process-cards') listProcessCards(@Query('departmentId') d?: string) { return this.svc.listProcessCards(d); }
  @Post('process-cards') createProcessCard(@Body() dto: any) { return this.svc.createProcessCard(dto); }
  @Get('process-cards/:id') getProcessCard(@Param('id') id: string) { return this.svc.getProcessCard(id); }
  @Put('process-cards/:id') updateProcessCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateProcessCard(id, dto); }
  @Delete('process-cards/:id') deleteProcessCard(@Param('id') id: string) { return this.svc.deleteProcessCard(id); }

  // Employee Cards
  @Get('employee-cards') listEmployees(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('departmentId') d?: string) { return this.svc.listEmployees(b || u.branchId, d); }
  @Post('employee-cards') createEmployee(@Body() dto: any) { return this.svc.createEmployee(dto); }
  @Get('employee-cards/:id') getEmployee(@Param('id') id: string) { return this.svc.getEmployee(id); }
  @Put('employee-cards/:id') updateEmployee(@Param('id') id: string, @Body() dto: any) { return this.svc.updateEmployee(id, dto); }
  @Delete('employee-cards/:id') deleteEmployee(@Param('id') id: string) { return this.svc.deleteEmployee(id); }

  // Resource Cards
  @Get('resource-cards') listResources(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('type') t?: string) { return this.svc.listResources(b || u.branchId, t); }
  @Post('resource-cards') createResource(@Body() dto: any) { return this.svc.createResource(dto); }
  @Get('resource-cards/:id') getResource(@Param('id') id: string) { return this.svc.getResource(id); }
  @Put('resource-cards/:id') updateResource(@Param('id') id: string, @Body() dto: any) { return this.svc.updateResource(id, dto); }
  @Delete('resource-cards/:id') deleteResource(@Param('id') id: string) { return this.svc.deleteResource(id); }

  // Study Templates
  @Get('study-templates') listStudyTemplates(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('styleCardId') s?: string) { return this.svc.listStudyTemplates(b || u.branchId, s); }
  @Post('study-templates') @ApiOperation({ summary: 'Create study template' }) createStudyTemplate(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createStudyTemplate(dto, u.id); }
  @Get('study-templates/:id') getStudyTemplate(@Param('id') id: string) { return this.svc.getStudyTemplate(id); }
  @Put('study-templates/:id') updateStudyTemplate(@Param('id') id: string, @Body() dto: any) { return this.svc.updateStudyTemplate(id, dto); }
  @Delete('study-templates/:id') deleteStudyTemplate(@Param('id') id: string) { return this.svc.deleteStudyTemplate(id); }
  @Put('study-templates/:id/lines') upsertTemplateLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertStudyTemplateLines(id, lines); }
  @Delete('study-templates/:id/lines/:lineId') deleteTemplateLine(@Param('id') id: string, @Param('lineId') lineId: string) { return this.svc.deleteStudyTemplateLine(id, lineId); }

  // Activity Type Cards
  @Get('activity-type-cards') listActivityTypes(@CurrentUser() u: any, @Query('branchId') b?: string) { return this.svc.listActivityTypes(b || u.branchId); }
  @Post('activity-type-cards') createActivityType(@Body() dto: any) { return this.svc.createActivityType(dto); }
  @Get('activity-type-cards/:id') getActivityType(@Param('id') id: string) { return this.svc.getActivityType(id); }
  @Put('activity-type-cards/:id') updateActivityType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateActivityType(id, dto); }
  @Delete('activity-type-cards/:id') deleteActivityType(@Param('id') id: string) { return this.svc.deleteActivityType(id); }

  // Color Cards
  @Get('color-cards') listColors(@CurrentUser() u: any, @Query('branchId') b?: string) { return this.svc.listColors(b || u.branchId); }
  @Post('color-cards') createColor(@Body() dto: any) { return this.svc.createColor(dto); }
  @Get('color-cards/:id') getColor(@Param('id') id: string) { return this.svc.getColor(id); }
  @Put('color-cards/:id') updateColor(@Param('id') id: string, @Body() dto: any) { return this.svc.updateColor(id, dto); }
  @Delete('color-cards/:id') deleteColor(@Param('id') id: string) { return this.svc.deleteColor(id); }

  // Brand Cards
  @Get('brand-cards') listBrands(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('search') search?: string) { return this.svc.listBrands(b || u.branchId, search); }
  @Post('brand-cards') createBrand(@Body() dto: any) { return this.svc.createBrand(dto); }
  @Get('brand-cards/:id') getBrand(@Param('id') id: string) { return this.svc.getBrand(id); }
  @Put('brand-cards/:id') updateBrand(@Param('id') id: string, @Body() dto: any) { return this.svc.updateBrand(id, dto); }
  @Delete('brand-cards/:id') deleteBrand(@Param('id') id: string) { return this.svc.deleteBrand(id); }

  // Season Cards
  @Get('season-cards') listSeasons(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('search') search?: string) { return this.svc.listSeasons(b || u.branchId, search); }
  @Post('season-cards') createSeason(@Body() dto: any) { return this.svc.createSeason(dto); }
  @Get('season-cards/:id') getSeason(@Param('id') id: string) { return this.svc.getSeason(id); }
  @Put('season-cards/:id') updateSeason(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSeason(id, dto); }
  @Delete('season-cards/:id') deleteSeason(@Param('id') id: string) { return this.svc.deleteSeason(id); }

  // Gender Cards
  @Get('gender-cards') listGenders(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('search') search?: string) { return this.svc.listGenders(b || u.branchId, search); }
  @Post('gender-cards') createGender(@Body() dto: any) { return this.svc.createGender(dto); }
  @Get('gender-cards/:id') getGender(@Param('id') id: string) { return this.svc.getGender(id); }
  @Put('gender-cards/:id') updateGender(@Param('id') id: string, @Body() dto: any) { return this.svc.updateGender(id, dto); }
  @Delete('gender-cards/:id') deleteGender(@Param('id') id: string) { return this.svc.deleteGender(id); }

  // Size Cards
  @Get('size-cards') listSizes(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('search') search?: string) { return this.svc.listSizes(b || u.branchId, search); }
  @Post('size-cards') createSize(@Body() dto: any) { return this.svc.createSize(dto); }
  @Get('size-cards/:id') getSize(@Param('id') id: string) { return this.svc.getSize(id); }
  @Put('size-cards/:id') updateSize(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSize(id, dto); }
  @Delete('size-cards/:id') deleteSize(@Param('id') id: string) { return this.svc.deleteSize(id); }

  // Company Cards
  @Get('company-cards') listCompanyCards() { return this.svc.listCompanyCards(); }
  @Post('company-cards') createCompanyCard(@Body() dto: any) { return this.svc.createCompanyCard(dto); }
  @Get('company-cards/:id') getCompanyCard(@Param('id') id: string) { return this.svc.getCompanyCard(id); }
  @Put('company-cards/:id') updateCompanyCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCompanyCard(id, dto); }
  @Delete('company-cards/:id') deleteCompanyCard(@Param('id') id: string) { return this.svc.deleteCompanyCard(id); }

  // Sample Task Types
  @Get('sample-task-types') listSampleTaskTypes(@CurrentUser() u: any, @Query('branchId') b?: string) { return this.svc.listSampleTaskTypes(b || u.branchId); }
  @Post('sample-task-types') createSampleTaskType(@Body() dto: any) { return this.svc.createSampleTaskType(dto); }
  @Get('sample-task-types/:id') getSampleTaskType(@Param('id') id: string) { return this.svc.getSampleTaskType(id); }
  @Put('sample-task-types/:id') updateSampleTaskType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSampleTaskType(id, dto); }
  @Delete('sample-task-types/:id') deleteSampleTaskType(@Param('id') id: string) { return this.svc.deleteSampleTaskType(id); }

  // Route Cards
  @Get('route-cards') listRouteCards(@CurrentUser() u: any, @Query('branchId') b?: string) { return this.svc.listRouteCards(b || u.branchId); }
  @Post('route-cards') createRouteCard(@Body() dto: any) { return this.svc.createRouteCard(dto); }
  @Get('route-cards/:id') getRouteCard(@Param('id') id: string) { return this.svc.getRouteCard(id); }
  @Put('route-cards/:id') updateRouteCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateRouteCard(id, dto); }
  @Delete('route-cards/:id') deleteRouteCard(@Param('id') id: string) { return this.svc.deleteRouteCard(id); }
  @Post('route-cards/:id/lines') addRouteCardLine(@Param('id') id: string, @Body() dto: any) { return this.svc.addRouteCardLine(id, dto); }
  @Put('route-cards/:id/lines/:lineId') updateRouteCardLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: any) { return this.svc.updateRouteCardLine(lineId, dto); }
  @Delete('route-cards/:id/lines/:lineId') deleteRouteCardLine(@Param('lineId') lineId: string) { return this.svc.deleteRouteCardLine(lineId); }

  // PLM Templates
  @Get('templates') listTemplates(@CurrentUser() u: any, @Query('branchId') b?: string, @Query('type') t?: string) { return this.svc.listTemplates(b || u.branchId, t); }
  @Post('templates') createTemplate(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createTemplate(dto, u.id); }
  @Get('templates/:id') getTemplate(@Param('id') id: string) { return this.svc.getTemplate(id); }
  @Put('templates/:id') updateTemplate(@Param('id') id: string, @Body() dto: any) { return this.svc.updateTemplate(id, dto); }
  @Delete('templates/:id') deleteTemplate(@Param('id') id: string) { return this.svc.deleteTemplate(id); }
  @Post('templates/:id/duplicate') duplicateTemplate(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.duplicateTemplate(id, u.id); }
}
