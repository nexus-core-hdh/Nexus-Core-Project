import { Module } from '@nestjs/common';
import { StyleExtrasService } from './style-extras.service';
import { StyleExtrasController } from './style-extras.controller';
import { LegacyErpModule } from '../legacy-erp/legacy-erp.module';

@Module({
  // For LegacyMasterLookupService — reused by StyleExtrasService to resolve/validate BOM line
  // Unit against the selected Fabric/Trim Card's own configured units (same resolution Purchase
  // Order/Purchase Receipt already use), not a second lookup implementation.
  imports: [LegacyErpModule],
  controllers: [StyleExtrasController],
  providers: [StyleExtrasService],
  exports: [StyleExtrasService],
})
export class StyleExtrasModule {}
