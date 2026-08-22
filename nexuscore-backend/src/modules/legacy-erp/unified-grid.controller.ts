import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UnifiedGridService } from './unified-grid.service';

@ApiTags('Legacy ERP - Receipt & Master Data')
@Controller('legacy-erp/unified-grid')
export class UnifiedGridController {
  constructor(private readonly svc: UnifiedGridService) {}

  // Declared ahead of the generic :key route below so "meta" is never parsed as a key.
  @Get('meta') meta() {
    return this.svc.meta();
  }

  @Get(':key') list(@Param('key') key: string, @Query('search') search?: string) {
    return this.svc.list(key, search);
  }
}
