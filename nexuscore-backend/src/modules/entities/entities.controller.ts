import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntitiesService } from './entities.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Entities')
@PermissionModule('crm', 'CRM')
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  // ── Custom Entity Pages ────────────────────────────────────────────────────

  @Get('pages')
  @ApiOperation({ summary: 'Get all custom entity pages' })
  getPages(@CurrentUser() user: any, @Query('branchId') branchId?: string) {
    return this.entitiesService.getCustomEntityPages(user.companyId, branchId || user.branchId);
  }

  @Get('pages/slug/:slug')
  @ApiOperation({ summary: 'Get custom entity page by slug' })
  getPageBySlug(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.entitiesService.getCustomEntityPageBySlug(slug, user.companyId, user.branchId);
  }

  @Get('pages/:id')
  @ApiOperation({ summary: 'Get custom entity page by ID' })
  getPage(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.getCustomEntityPage(id, user.companyId);
  }

  @Post('pages')
  @ApiOperation({ summary: 'Create custom entity page' })
  createPage(@Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.createCustomEntityPage(dto, user.companyId, user.branchId);
  }

  @Patch('pages/:id')
  @ApiOperation({ summary: 'Update custom entity page' })
  updatePage(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.updateCustomEntityPage(id, dto, user.companyId);
  }

  @Delete('pages/:id')
  @ApiOperation({ summary: 'Delete custom entity page' })
  deletePage(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.deleteCustomEntityPage(id, user.companyId);
  }

  // ── Form Templates ─────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'Get form templates' })
  getTemplates(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.entitiesService.getFormTemplates(user.companyId, branchId || user.branchId, entityType);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get form template by ID' })
  getTemplate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.getFormTemplate(id, user.companyId);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create form template' })
  createTemplate(@Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.createFormTemplate(dto, user.companyId, user.branchId);
  }

  @Patch('templates/:id')
  @ApiOperation({ summary: 'Update form template' })
  updateTemplate(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.updateFormTemplate(id, dto, user.companyId);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete form template' })
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.deleteFormTemplate(id, user.companyId);
  }

  // ── Entity Data ────────────────────────────────────────────────────────────

  @Get('data')
  @ApiOperation({ summary: 'Get entity data records' })
  getData(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
    @Query('entityType') entityType?: string,
    @Query('customEntityName') customEntityName?: string,
  ) {
    return this.entitiesService.getEntityData(user.companyId, branchId || user.branchId, entityType, customEntityName);
  }

  @Get('data/:id')
  @ApiOperation({ summary: 'Get entity data by ID' })
  getDataById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.getEntityDataById(id, user.companyId);
  }

  @Post('data')
  @ApiOperation({ summary: 'Create entity data record' })
  createData(@Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.createEntityData(dto, user.companyId, user.branchId);
  }

  @Patch('data/:id')
  @ApiOperation({ summary: 'Update entity data record' })
  updateData(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.updateEntityData(id, dto, user.companyId);
  }

  @Delete('data/:id')
  @ApiOperation({ summary: 'Delete entity data record' })
  deleteData(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.deleteEntityData(id, user.companyId);
  }

  // ── Entity Schema ──────────────────────────────────────────────────────────

  @Get('schema/:entityName')
  @ApiOperation({ summary: 'Get default + custom fields for an entity' })
  getEntitySchema(
    @Param('entityName') entityName: string,
    @CurrentUser() user: any,
  ) {
    return this.entitiesService.getEntitySchema(entityName, user.companyId, user.branchId);
  }

  // ── Custom Fields ──────────────────────────────────────────────────────────

  @Get('custom-fields')
  @ApiOperation({ summary: 'Get custom fields' })
  getCustomFields(@CurrentUser() user: any, @Query('entity') entity?: string) {
    return this.entitiesService.getCustomFields(user.companyId, user.branchId, entity);
  }

  @Post('custom-fields')
  @ApiOperation({ summary: 'Create custom field' })
  createCustomField(@Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.createCustomField(dto, user.companyId, user.branchId);
  }

  @Patch('custom-fields/:id')
  @ApiOperation({ summary: 'Update custom field' })
  updateCustomField(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.updateCustomField(id, dto, user.companyId);
  }

  @Delete('custom-fields/:id')
  @ApiOperation({ summary: 'Delete custom field' })
  deleteCustomField(@Param('id') id: string, @CurrentUser() user: any) {
    return this.entitiesService.deleteCustomField(id, user.companyId);
  }

  // ── Custom Field Values ──────────────────────────────────────────────────────

  @Get('custom-field-values')
  @ApiOperation({ summary: 'Get custom field values for an entity record' })
  getCustomFieldValues(@Query('entity') entity: string, @Query('entityId') entityId: string) {
    return this.entitiesService.getCustomFieldValues(entity, entityId);
  }

  @Put('custom-field-values')
  @ApiOperation({ summary: 'Replace custom field values for an entity record' })
  upsertCustomFieldValues(@Body() body: { entity: string; entityId: string; values: any[] }) {
    return this.entitiesService.upsertCustomFieldValues(body.entity, body.entityId, body.values);
  }

  // ── Form Sections ──────────────────────────────────────────────────────────

  @Get('sections')
  @ApiOperation({ summary: 'Get form sections' })
  getSections(@CurrentUser() user: any) {
    return this.entitiesService.getFormSections(user.companyId, user.branchId);
  }

  @Post('sections')
  @ApiOperation({ summary: 'Create form section' })
  createSection(@Body() dto: any, @CurrentUser() user: any) {
    return this.entitiesService.createFormSection(dto, user.companyId, user.branchId);
  }

  @Patch('sections/:id')
  @ApiOperation({ summary: 'Update form section' })
  updateSection(@Param('id') id: string, @Body() dto: any) {
    return this.entitiesService.updateFormSection(id, dto);
  }

  @Delete('sections/:id')
  @ApiOperation({ summary: 'Delete form section' })
  deleteSection(@Param('id') id: string) {
    return this.entitiesService.deleteFormSection(id);
  }

  @Post('sections/:sectionId/fields')
  @ApiOperation({ summary: 'Create form field in section' })
  createField(@Param('sectionId') sectionId: string, @Body() dto: any) {
    return this.entitiesService.createFormField(sectionId, dto);
  }

  @Patch('fields/:id')
  @ApiOperation({ summary: 'Update form field' })
  updateField(@Param('id') id: string, @Body() dto: any) {
    return this.entitiesService.updateFormField(id, dto);
  }

  @Delete('fields/:id')
  @ApiOperation({ summary: 'Delete form field' })
  deleteField(@Param('id') id: string) {
    return this.entitiesService.deleteFormField(id);
  }
}
