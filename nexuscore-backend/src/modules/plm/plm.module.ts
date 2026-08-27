import { Module } from '@nestjs/common';
import { PlmDefinitionsService } from './plm-definitions.service';
import { PlmCardsService } from './plm-cards.service';
import { PlmOperationsService } from './plm-operations.service';
import { PlmReportsService } from './plm-reports.service';
import { PlmDefinitionsController } from './plm-definitions.controller';
import { PlmCardsController } from './plm-cards.controller';
import { PlmOperationsController } from './plm-operations.controller';
import { DeleteDependencyService } from '../legacy-erp/delete-dependency.service';

@Module({
  controllers: [PlmDefinitionsController, PlmCardsController, PlmOperationsController],
  providers: [PlmDefinitionsService, PlmCardsService, PlmOperationsService, PlmReportsService, DeleteDependencyService],
  exports: [PlmCardsService, PlmOperationsService],
})
export class PlmModule {}
