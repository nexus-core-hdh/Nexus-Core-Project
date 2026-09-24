import { Module } from '@nestjs/common';
import { CuttingService } from './cutting.service';
import { CuttingController } from './cutting.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CuttingController],
  providers: [CuttingService],
  exports: [CuttingService],
})
export class CuttingModule {}
