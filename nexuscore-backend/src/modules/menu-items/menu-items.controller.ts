import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiTags } from '@nestjs/swagger';
import { MenuItemsService } from './menu-items.service';

@ApiTags('Menu Items')
@PermissionModule('menu', 'Navigation menu')
@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly svc: MenuItemsService) {}

  @Get()
  getMenuItems(
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.svc.getMenuItems(companyId, branchId);
  }

  @Post('reorder')
  reorderMenuItems(@Body() body: { items: any[]; companyId?: string; branchId?: string }) {
    return this.svc.reorderMenuItems(body.items, body.companyId, body.branchId);
  }

  @Post()
  createMenuItem(@Body() dto: any) {
    return this.svc.createMenuItem(dto);
  }

  @Put(':id')
  updateMenuItem(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateMenuItem(id, dto);
  }

  @Delete(':id')
  deleteMenuItem(@Param('id') id: string) {
    return this.svc.deleteMenuItem(id);
  }
}
