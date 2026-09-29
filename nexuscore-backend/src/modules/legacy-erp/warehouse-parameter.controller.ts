import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiTags } from '@nestjs/swagger';
import { WarehouseParameterService } from './warehouse-parameter.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Warehouse Parameters')
@PermissionModule('warehouses', 'Warehouses')
@Controller('legacy-erp/warehouse-parameters')
export class WarehouseParameterController {
  constructor(private readonly svc: WarehouseParameterService) {}

  @Get() get(@Query('module') module: string, @Query('warehouseId') warehouseId: string) {
    return this.svc.get(module, Number(warehouseId));
  }

  @Put() upsert(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.upsert(dto, Number(userId) || 1);
  }
}
