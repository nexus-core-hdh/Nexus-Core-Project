import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { CustomFieldsService } from './custom-fields.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [EntitiesController],
  providers: [EntitiesService, CustomFieldsService],
  exports: [EntitiesService, CustomFieldsService],
})
export class EntitiesModule {}
