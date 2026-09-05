import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CostingService } from './costing.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('PLM Costing')
@Controller('plm')
export class CostingController {
  constructor(private readonly svc: CostingService) {}

  @Get('costing-sheets') list(@CurrentUser() u: any, @Query() q: any) { return this.svc.list(u.branchId, q); }
  @Post('costing-sheets') create(@Body() dto: any, @CurrentUser() u: any) { return this.svc.create(dto, u.branchId, u.id); }
  @Get('costing-sheets/:id') get(@Param('id') id: string) { return this.svc.get(id); }
  @Put('costing-sheets/:id') update(@Param('id') id: string, @Body() dto: any) { return this.svc.update(id, dto); }
  @Delete('costing-sheets/:id') remove(@Param('id') id: string) { return this.svc.delete(id); }

  @Put('costing-sheets/:id/raw-material-lines') upsertRawMaterialLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertRawMaterialLines(id, lines); }
  @Put('costing-sheets/:id/labor-lines') upsertLaborLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertLaborLines(id, lines); }
  @Put('costing-sheets/:id/other-lines') upsertOtherLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertOtherLines(id, lines); }

  @Get('costing-sheets/:id/profit-breakdown') getProfitBreakdown(@Param('id') id: string) { return this.svc.getProfitBreakdown(id); }

  @Get('style-cards/:id/costing-sheets') listForStyleCard(@Param('id') id: string) { return this.svc.listForStyleCard(id); }
  @Post('style-cards/:id/issue-costing-sheet') issueForStyleCard(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.issueForStyleCard(id, dto, u.branchId, u.id); }

  @Get('sample-cards/:id/costing-sheets') listForSampleCard(@Param('id') id: string) { return this.svc.listForSampleCard(id); }
  @Post('sample-cards/:id/issue-costing-sheet') issueForSampleCard(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.issueForSampleCard(id, dto, u.branchId, u.id); }
}
