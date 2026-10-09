import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Res, Type } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AllowAuthenticated, PermissionModule, Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportBuilderService, ReportDefinitionInput, ReportParams } from './report-builder.service';
import { ReportExportFormat, ReportExportService } from './report-export.service';
import { REPORT_MODULES, ReportModuleConfig } from './report-modules';

const FORMATS: ReportExportFormat[] = ['csv', 'xlsx', 'pdf'];

/**
 * User-defined reports of one module, at /report-builder/<module>. Create/update/delete need
 * `<permission>:create|update|delete` (via @PermissionModule); running and previewing need
 * `<permission>:view`, exporting `<permission>:export`. All five are added to the permission
 * catalog at startup and granted to the system Admin role, so they can be assigned to any other
 * role from the Roles screen. One controller class per module, so each has its own permissions.
 */
function createReportBuilderController(mod: ReportModuleConfig): Type<unknown> {
  const VIEW = { module: mod.permission, action: 'view' };
  const EXPORT = { module: mod.permission, action: 'export' };

  @ApiTags(`Report Builder · ${mod.label}`)
  @PermissionModule(mod.permission, `${mod.label} Reports`)
  @Controller(`report-builder/${mod.key}`)
  class ReportBuilderController {
    constructor(
      readonly reports: ReportBuilderService,
      readonly exporter: ReportExportService,
    ) {}

    @Get('catalog')
    @AllowAuthenticated()
    @ApiOperation({ summary: 'Data sources, fields, operators and the current user\'s report rights' })
    catalog(@CurrentUser() u: any) {
      return this.reports.catalog(mod.key, u);
    }

    @Get('reports')
    @Permissions(VIEW)
    @ApiOperation({ summary: `List ${mod.label} reports` })
    list(@CurrentUser() u: any) {
      return this.reports.list(mod.key, u);
    }

    @Get('reports/:id')
    @Permissions(VIEW)
    @ApiOperation({ summary: `Get a ${mod.label} report definition` })
    get(@Param('id') id: string, @CurrentUser() u: any) {
      return this.reports.get(mod.key, id, u);
    }

    @Post('reports')
    @ApiOperation({ summary: `Create a ${mod.label} report (also adds its menu entry)` })
    create(@Body() dto: ReportDefinitionInput, @CurrentUser() u: any) {
      return this.reports.create(mod.key, dto, u);
    }

    @Patch('reports/:id')
    @ApiOperation({ summary: `Update a ${mod.label} report` })
    update(@Param('id') id: string, @Body() dto: ReportDefinitionInput, @CurrentUser() u: any) {
      return this.reports.update(mod.key, id, dto, u);
    }

    @Delete('reports/:id')
    @ApiOperation({ summary: `Delete a ${mod.label} report (and its menu entry)` })
    remove(@Param('id') id: string, @CurrentUser() u: any) {
      return this.reports.remove(mod.key, id, u);
    }

    @Post('reports/:id/run')
    @Permissions(VIEW)
    @ApiOperation({ summary: `Run a saved ${mod.label} report` })
    run(@Param('id') id: string, @Body('params') params: ReportParams, @CurrentUser() u: any) {
      return this.reports.run(mod.key, id, params ?? {}, u);
    }

    @Post('preview')
    @Permissions(VIEW)
    @ApiOperation({ summary: 'Preview an unsaved report definition (first rows only)' })
    preview(@Body('definition') definition: ReportDefinitionInput, @Body('params') params: ReportParams, @CurrentUser() u: any) {
      return this.reports.preview(mod.key, definition, params ?? {}, u);
    }

    @Post('reports/:id/export')
    @Permissions(EXPORT)
    @ApiOperation({ summary: `Export a saved ${mod.label} report as CSV, Excel or PDF` })
    async export(
      @Param('id') id: string,
      @Body('format') format: ReportExportFormat,
      @Body('params') params: ReportParams,
      @CurrentUser() u: any,
      @Res() res: Response,
    ) {
      if (!FORMATS.includes(format)) throw new BadRequestException('Format must be csv, xlsx or pdf');
      const result = await this.reports.run(mod.key, id, params ?? {}, u);
      const file = await this.exporter.export(result, format, u.company?.name ?? '');
      res.set({
        'Content-Type': file.contentType,
        'Content-Length': String(file.buffer.length),
        'Content-Disposition': `attachment; filename="${file.fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'no-store',
      });
      res.send(file.buffer);
    }
  }

  // Distinct class names keep Swagger and Nest's own logs readable.
  Object.defineProperty(ReportBuilderController, 'name', { value: `${mod.label.replace(/\W/g, '')}ReportBuilderController` });
  return ReportBuilderController;
}

export const REPORT_BUILDER_CONTROLLERS = Object.values(REPORT_MODULES).map(createReportBuilderController);
