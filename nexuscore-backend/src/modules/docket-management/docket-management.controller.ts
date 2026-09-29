import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiTags } from '@nestjs/swagger';
import { DocketManagementService } from './docket-management.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Docket Setup')
@PermissionModule('dockets', 'Dockets')
@Controller('docket-setup')
export class DocketManagementController {
  constructor(private readonly svc: DocketManagementService) {}

  // Document Types
  @Get('document-types') listDocumentTypes(@CurrentUser() u: any, @Query() q: any) { return this.svc.listDocumentTypes(u.branchId, q); }
  @Post('document-types') createDocumentType(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDocumentType(dto, u.branchId); }
  @Get('document-types/:id') getDocumentType(@Param('id') id: string) { return this.svc.getDocumentType(id); }
  @Put('document-types/:id') updateDocumentType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateDocumentType(id, dto); }
  @Delete('document-types/:id') deleteDocumentType(@Param('id') id: string) { return this.svc.deleteDocumentType(id); }
  @Patch('document-types/:id/toggle') toggleDocumentType(@Param('id') id: string) { return this.svc.toggleDocumentType(id); }

  // Templates
  @Get('templates') listTemplates(@CurrentUser() u: any, @Query() q: any) { return this.svc.listTemplates(u.branchId, q); }
  @Post('templates') createTemplate(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createTemplate(dto, u.branchId, u.id); }
  @Get('templates/:id') getTemplate(@Param('id') id: string) { return this.svc.getTemplate(id); }
  @Put('templates/:id') updateTemplate(@Param('id') id: string, @Body() dto: any) { return this.svc.updateTemplate(id, dto); }
  @Delete('templates/:id') deleteTemplate(@Param('id') id: string) { return this.svc.deleteTemplate(id); }
  @Post('templates/:id/items') addTemplateItem(@Param('id') id: string, @Body() dto: any) { return this.svc.addTemplateItem(id, dto); }
  @Put('templates/:id/items/:itemId') updateTemplateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: any) { return this.svc.updateTemplateItem(id, itemId, dto); }
  @Delete('templates/:id/items/:itemId') deleteTemplateItem(@Param('id') id: string, @Param('itemId') itemId: string) { return this.svc.deleteTemplateItem(id, itemId); }
  @Post('templates/:id/duplicate') duplicateTemplate(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.duplicateTemplate(id, dto, u.branchId, u.id); }
  @Patch('templates/:id/set-default') setDefaultTemplate(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.setDefaultTemplate(id, u.branchId); }

  // Approval Workflows
  @Get('approval-workflows') listWorkflows(@CurrentUser() u: any, @Query() q: any) { return this.svc.listWorkflows(u.branchId, q); }
  @Post('approval-workflows') createWorkflow(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createWorkflow(dto, u.branchId); }
  @Get('approval-workflows/:id') getWorkflow(@Param('id') id: string) { return this.svc.getWorkflow(id); }
  @Put('approval-workflows/:id') updateWorkflow(@Param('id') id: string, @Body() dto: any) { return this.svc.updateWorkflow(id, dto); }
  @Delete('approval-workflows/:id') deleteWorkflow(@Param('id') id: string) { return this.svc.deleteWorkflow(id); }
}
