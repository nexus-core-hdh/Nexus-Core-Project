import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { ApprovalConfigurationService } from './approval-configuration.service';
import { ApprovalConfigurationController } from './approval-configuration.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ApprovalController, ApprovalConfigurationController],
  providers: [ApprovalService, ApprovalConfigurationService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
