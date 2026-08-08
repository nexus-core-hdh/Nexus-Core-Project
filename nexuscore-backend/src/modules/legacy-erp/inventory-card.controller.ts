import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InventoryCardService } from './inventory-card.service';

@ApiTags('Legacy ERP - Inventory Card List')
@Controller('legacy-erp/inventory-cards')
export class InventoryCardController {
  constructor(private readonly svc: InventoryCardService) {}

  @Get() list(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.svc.list({ search, sortBy, sortDir });
  }
}
