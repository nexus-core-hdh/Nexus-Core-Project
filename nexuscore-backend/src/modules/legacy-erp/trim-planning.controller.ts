import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrimPlanningService } from './trim-planning.service';

// Read-only planning/reporting screen — no write operations, same as fabric-planning.controller.ts/
// yarn-planning.controller.ts. Any real mutation (Purchase/Receipt/Subcontract transactions) goes
// through those screens' own existing, already-audited transaction services — never through here.
@ApiTags('Legacy ERP - Trim Planning')
@Controller('legacy-erp/trim-planning')
export class TrimPlanningController {
  constructor(private readonly svc: TrimPlanningService) {}

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
