import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ItemAllocationService, SaveAllocationDto } from './item-allocation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Received Allocation — Fabric/Yarn/Trim Planning's own right-click "Received Allocation" action.
// See item-allocation.service.ts's own header comment for the real DB tables this reuses
// (IM_ItemAllocation/IM_ItemAllocationHistory) — a reservation against an already-received
// receipt line, never a new stock transaction.
@ApiTags('Legacy ERP - Received Allocation')
@Controller('legacy-erp/item-allocations')
export class ItemAllocationController {
  constructor(private readonly svc: ItemAllocationService) {}

  @Get('available-receipts') listAvailableReceipts(
    @Query('workOrderId', ParseIntPipe) workOrderId: number,
    @Query('inventoryId', ParseIntPipe) inventoryId: number,
    @Query('colorCardId') colorCardId?: string,
  ) {
    return this.svc.listAvailableReceipts(workOrderId, inventoryId, colorCardId || null);
  }

  // View Allocations — every live allocation of ONE receipt line, across all Work Orders.
  @Get('receipt-items/:id') receiptItemAllocations(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getReceiptItemAllocations(id);
  }

  @Get() listAllocations(
    @Query('workOrderId', ParseIntPipe) workOrderId: number,
    @Query('inventoryId', ParseIntPipe) inventoryId: number,
    @Query('colorCardId') colorCardId?: string,
  ) {
    return this.svc.listAllocations(workOrderId, inventoryId, colorCardId || null);
  }

  @Post() save(
    @Body() dto: SaveAllocationDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.saveAllocation(dto, userId, companyId);
  }

  @Delete(':id') remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.deleteAllocation(id, userId, companyId);
  }
}
