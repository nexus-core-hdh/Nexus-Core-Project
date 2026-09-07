import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FabricYarnRequirementsService, RequirementTab } from './fabric-yarn-requirements.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const asTab = (q?: string): RequirementTab => (q === 'yarn' || q === 'trim' ? q : 'fabric');

@ApiTags('Legacy ERP - Fabric/Trim/Yarn Requirements')
@Controller('legacy-erp/work-orders/:id/requirements')
export class FabricYarnRequirementsController {
  constructor(private readonly svc: FabricYarnRequirementsService) {}

  @Get() getRequirementsGrid(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    const tab = asTab(type);
    return tab === 'yarn' ? this.svc.getYarnRequirements(id) : this.svc.getMaterialRequirements(id, tab);
  }

  @Get('saved') getSavedRequirements(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.getSavedRequirements(id, asTab(type));
  }

  @Get('total') getTotalRequirements(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.getTotalRequirements(id, asTab(type));
  }

  @Get('manufacturing-quantity') getManufacturingQuantitySummary(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getManufacturingQuantitySummary(id);
  }

  @Get('transactions') getTransactionDetails(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTransactionDetails(id);
  }

  @Post('calculate') calculate(@Param('id', ParseIntPipe) id: number, @Query('type') type?: string) {
    return this.svc.calculate(id, asTab(type));
  }

  @Post('save') save(@Param('id', ParseIntPipe) id: number, @Query('type') type: string | undefined, @CurrentUser('id') userId: string) {
    return this.svc.save(id, asTab(type), Number(userId) || 1);
  }
}
