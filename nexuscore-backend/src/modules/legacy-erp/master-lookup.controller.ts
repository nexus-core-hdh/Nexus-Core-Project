import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// The full CRUD "Master Lookup" management screen's API — a sibling of
// LookupController (which stays read-only/search-only, used by every simple FK-picker
// field). Both controllers share the exact same LegacyMasterLookupService and its one
// `TABLES` config, so turning any future picker (Brand, Color, GSM, ...) into a full
// manageable master is "configuration only": add `activeColumn`/`label` to its existing
// entry there — nothing here needs to change.
@ApiTags('Legacy ERP - Master Lookup')
@Controller('legacy-erp/master-lookup')
export class MasterLookupController {
  constructor(private readonly svc: LegacyMasterLookupService) {}

  @Get(':key/meta') meta(@Param('key') key: string) {
    return this.svc.meta(key);
  }

  @Get(':key') list(@Param('key') key: string, @Query('search') search?: string) {
    return this.svc.listManaged(key, search);
  }

  @Post(':key') create(@Param('key') key: string, @Body() dto: { code?: string; name?: string }, @CurrentUser('id') userId: string) {
    return this.svc.create(key, dto, Number(userId) || 1);
  }

  @Put(':key/:id') update(
    @Param('key') key: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { code?: string; name?: string; active?: boolean },
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.update(key, id, dto, Number(userId) || 1);
  }

  @Delete(':key/:id') remove(@Param('key') key: string, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.remove(key, id, Number(userId) || 1);
  }
}
