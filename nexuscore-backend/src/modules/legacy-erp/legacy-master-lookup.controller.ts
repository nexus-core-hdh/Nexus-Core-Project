import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';

@ApiTags('Legacy ERP - Lookups')
@Controller('legacy-erp/lookup/tables')
export class LegacyMasterLookupController {
  constructor(private readonly svc: LegacyMasterLookupService) {}

  // Declared before ':key' — a two-segment path, so it never actually collides with the
  // single-segment ':key' route below, but kept first to match this module's established
  // "static before dynamic" convention (see purchase-order.controller.ts's own 'pending' route).
  @Get('item-units/:inventoryId') itemUnits(@Param('inventoryId', ParseIntPipe) inventoryId: number) {
    return this.svc.listItemUnits(inventoryId);
  }

  @Get(':key') search(@Param('key') key: string, @Query('search') search?: string) {
    return this.svc.search(key, search);
  }
}
