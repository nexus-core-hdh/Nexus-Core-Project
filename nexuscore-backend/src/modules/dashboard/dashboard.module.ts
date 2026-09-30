import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { LegacyErpModule } from '../legacy-erp/legacy-erp.module';

@Module({
  // For PurchaseOrderService / FiReceiptService — Recent Transactions reads Purchase Orders and
  // Financial Receipts through their own list(), not a second query of those tables.
  imports: [LegacyErpModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
