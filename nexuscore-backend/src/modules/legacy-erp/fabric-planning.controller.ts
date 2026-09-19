import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FabricPlanningService } from './fabric-planning.service';

// Read-only planning/reporting screen — no write operations exist anywhere in this controller.
// Matches the task's own "this screen should remain read-only unless legacy functionality proves a
// specific write operation exists" — none was found (see the final report's own permissions note).
@ApiTags('Legacy ERP - Fabric Planning')
@Controller('legacy-erp/fabric-planning')
export class FabricPlanningController {
  constructor(private readonly svc: FabricPlanningService) {}

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
