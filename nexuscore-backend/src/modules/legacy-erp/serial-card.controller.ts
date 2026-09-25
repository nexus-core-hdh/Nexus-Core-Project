import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SerialCardService, ProduceSerialCardsDto, UpdateSerialCardDto } from './serial-card.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Generate Serial Cards')
@Controller('legacy-erp/inventory-receipts/:receiptId/items/:itemId/serial-cards')
export class SerialCardController {
  constructor(private readonly svc: SerialCardService) {}

  @Get('context')
  getContext(
    @Param('receiptId', ParseIntPipe) receiptId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.svc.getContext(receiptId, itemId);
  }

  @Get()
  list(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.svc.list(itemId);
  }

  @Post()
  produce(
    @Param('receiptId', ParseIntPipe) receiptId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: ProduceSerialCardsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.produce(receiptId, itemId, dto, userId, companyId);
  }

  @Patch()
  update(
    @Body() items: UpdateSerialCardDto[],
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.update(items, userId, companyId);
  }
}

// Flat, receipt-agnostic routes for the dedicated Serial Cards LIST view — a row shown there can
// belong to any receipt item (when the list is browsed unscoped), so Update/Delete on a given
// row can't rely on a fixed :receiptId/:itemId in the URL the way the nested controller above
// does. Reuses the exact same SerialCardService.update()/remove() this feature already has —
// no new persistence logic, just a route shape that fits browsing/acting on arbitrary rows.
@ApiTags('Legacy ERP - Serial Cards List')
@Controller('legacy-erp/serial-cards')
export class SerialCardListController {
  constructor(private readonly svc: SerialCardService) {}

  @Get()
  listAll(
    @Query('receiptItemId') receiptItemId?: string,
    @Query('inventoryId') inventoryId?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('search') search?: string,
    @Query('serialNo') serialNo?: string,
    @Query('inventoryQuery') inventoryQuery?: string,
    @Query('receiptNo') receiptNo?: string,
    @Query('workOrderNo') workOrderNo?: string,
    @Query('variantQuery') variantQuery?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: 'has' | 'none',
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.svc.listAll({
      receiptItemId: receiptItemId ? Number(receiptItemId) : undefined,
      inventoryId: inventoryId ? Number(inventoryId) : undefined,
      workOrderId: workOrderId ? Number(workOrderId) : undefined,
      search, serialNo, inventoryQuery, receiptNo, workOrderNo, variantQuery, dateFrom, dateTo, status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Patch()
  update(
    @Body() items: UpdateSerialCardDto[],
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.update(items, userId, companyId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.remove(id, userId, companyId);
  }
}
