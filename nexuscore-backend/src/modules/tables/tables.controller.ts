import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Tables')
@PermissionModule('collaboration', 'Collaboration')
@Controller('tables')
export class TablesController {
  constructor(private readonly svc: TablesService) {}

  @Get('categories') getCategories(@CurrentUser() u: any) { return this.svc.getCategories(u.companyId, u.branchId); }
  @Post('categories') createCategory(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCategory(dto, u.companyId, u.branchId); }
  @Patch('categories/:id') updateCategory(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCategory(id, dto); }
  @Delete('categories/:id') deleteCategory(@Param('id') id: string) { return this.svc.deleteCategory(id); }

  @Get()
  @ApiOperation({ summary: 'Get restaurant tables' })
  getTables(@CurrentUser() u: any, @Query('categoryId') categoryId?: string) {
    return this.svc.getTables(u.companyId, u.branchId, categoryId);
  }

  @Get(':id') getTable(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getTable(id, u.companyId); }
  @Post() createTable(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createTable(dto, u.companyId, u.branchId); }
  @Patch(':id') updateTable(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateTable(id, dto, u.companyId); }
  @Delete(':id') deleteTable(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteTable(id, u.companyId); }
}
