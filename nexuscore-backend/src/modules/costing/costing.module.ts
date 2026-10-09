import { Module } from '@nestjs/common';
import { CostingService } from './costing.service';
import { CostingController } from './costing.controller';
import { LegacyErpModule } from '../legacy-erp/legacy-erp.module';

@Module({
  // For LegacyMasterLookupService — reused by CostingService to resolve/validate a Raw Material
  // line's Unit against the selected Inventory item's own configured units (the same
  // listItemUnits/resolveLineUnitId resolution the Style Card BOM uses), not a second lookup.
  imports: [LegacyErpModule],
  controllers: [CostingController],
  providers: [CostingService],
  exports: [CostingService],
})
export class CostingModule {}
