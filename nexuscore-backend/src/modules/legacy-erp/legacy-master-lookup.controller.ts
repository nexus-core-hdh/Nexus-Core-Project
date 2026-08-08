import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';

@ApiTags('Legacy ERP - Lookups')
@Controller('legacy-erp/lookup/tables')
export class LegacyMasterLookupController {
  constructor(private readonly svc: LegacyMasterLookupService) {}

  @Get(':key') search(@Param('key') key: string, @Query('search') search?: string) {
    return this.svc.search(key, search);
  }
}
