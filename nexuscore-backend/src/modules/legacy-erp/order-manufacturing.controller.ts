import { BadRequestException, Body, Controller, Get, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderManufacturingService, PriceContractRowDto, SaveEntriesDto } from './order-manufacturing.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Order Manufacturing Entry — main read model, the Manufacturing IN/OUT/Repair child screens'
// shared entries endpoint, and the Price Contract list/save. See order-manufacturing.service.ts for
// the table mapping (MA_WorkOrderProduction / MA_WorkOrderProductionVariant / SM_ServicePriceList).
@ApiTags('Legacy ERP - Order Manufacturing Entry')
@Controller('legacy-erp/order-manufacturing')
export class OrderManufacturingController {
  constructor(private readonly svc: OrderManufacturingService) {}

  @Get('context') context(
    @Query('workOrderId', ParseIntPipe) workOrderId: number,
    @Query('processId') processId?: string,
  ) {
    return this.svc.getContext(workOrderId, processId ? Number(processId) || null : null);
  }

  @Get('entries') entries(
    @Query('workOrderId', ParseIntPipe) workOrderId: number,
    @Query('processId', ParseIntPipe) processId: number,
    @Query('color') color: string | undefined,
    @Query('mode') mode: string | undefined,
  ) {
    if (!color?.trim()) throw new BadRequestException('A Production Color is required.');
    return this.svc.getEntries(workOrderId, processId, color, mode || '');
  }

  @Put('entries') saveEntries(@Body() body: SaveEntriesDto, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    return this.svc.saveEntries(body, userId, companyId);
  }

  @Get('price-contracts') listPriceContracts(@Query('workOrderId', ParseIntPipe) workOrderId: number) {
    return this.svc.listPriceContracts(workOrderId);
  }

  @Put('price-contracts') savePriceContracts(
    @Body() body: { workOrderId: number; rows: PriceContractRowDto[]; deletedIds?: number[] },
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.savePriceContracts(Number(body.workOrderId), body.rows || [], body.deletedIds, userId, companyId);
  }
}
