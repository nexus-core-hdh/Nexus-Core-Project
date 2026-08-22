import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { ApprovalConfigurationService } from './approval-configuration.service';
import { ApprovalConfigurationController } from './approval-configuration.controller';

@Module({
  controllers: [ApprovalController, ApprovalConfigurationController],
  providers: [ApprovalService, ApprovalConfigurationService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
