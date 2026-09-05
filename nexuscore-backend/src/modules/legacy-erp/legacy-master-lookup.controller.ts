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

  // Single-record resolve-by-id — the read side of getById(), previously only called
  // server-side (fabric-card.service.ts's own required-field validation). Exposed here so a
  // form loading an EXISTING record (e.g. Work Order's Detail tab) can resolve a stored FK's
  // display Name without a second, per-field resolver endpoint. includeInactive=true because
  // an existing saved reference to a since-deactivated master must still display, not vanish.
  @Get(':key/:id') getById(@Param('key') key: string, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getById(key, id, { includeInactive: true });
  }
}
