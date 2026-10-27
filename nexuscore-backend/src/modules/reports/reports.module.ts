import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LegacyErpModule } from '../legacy-erp/legacy-erp.module';
import { UploadModule } from '../upload/upload.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportBuilderService } from './report-builder.service';
import { ReportExportService } from './report-export.service';
import { REPORT_BUILDER_CONTROLLERS } from './report-builder.controller';

@Module({
  // LegacyErpModule: WorkOrderOrderFormService, the data of the Work Order Order Form document source.
  imports: [AuditModule, LegacyErpModule, UploadModule],
  controllers: [ReportsController, ...REPORT_BUILDER_CONTROLLERS],
  providers: [ReportsService, ReportBuilderService, ReportExportService],
})
export class ReportsModule {}
