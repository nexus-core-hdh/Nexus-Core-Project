import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { YarnPlanningService } from './yarn-planning.service';

// Read-only planning/reporting screen — same convention as FabricPlanningController (no write
// operations; see that file's own comment).
@ApiTags('Legacy ERP - Yarn Planning')
@Controller('legacy-erp/yarn-planning')
export class YarnPlanningController {
  constructor(private readonly svc: YarnPlanningService) {}

  @Get() list(
    @Query('orderNo') orderNo?: string,
    @Query('style') styleQuery?: string,
    @Query('customer') customerQuery?: string,
    @Query('inventory') inventoryQuery?: string,
    @Query('process') processQuery?: string,
    @Query('variant') variantQuery?: string,
    @Query('color') colorQuery?: string,
  ) {
    return this.svc.listPlanningRows({ orderNo, styleQuery, customerQuery, inventoryQuery, processQuery, variantQuery, colorQuery });
  }
}
