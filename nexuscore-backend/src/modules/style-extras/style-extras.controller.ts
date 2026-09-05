import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StyleExtrasService } from './style-extras.service';

@ApiTags('PLM Style Extras')
@Controller('plm')
export class StyleExtrasController {
  constructor(private readonly svc: StyleExtrasService) {}

  @Get('style-cards/:id/bom-lines') getBomLines(@Param('id') id: string) { return this.svc.getBomLines(id); }
  @Put('style-cards/:id/bom-lines') upsertBomLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertBomLines(id, lines); }

  @Get('style-cards/:id/wash-care') getWashCare(@Param('id') id: string) { return this.svc.getWashCare(id); }
  @Put('style-cards/:id/wash-care') upsertWashCare(@Param('id') id: string, @Body() dto: any) { return this.svc.upsertWashCare(id, dto); }

  @Get('style-cards/:id/expense-lines') getExpenseLines(@Param('id') id: string) { return this.svc.getExpenseLines(id); }
  @Put('style-cards/:id/expense-lines') upsertExpenseLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertExpenseLines(id, lines); }

  // Sample Card — same BOM/Wash & Care persistence, own SampleBomLine/SampleWashCare tables.
  @Get('sample-cards/:id/bom-lines') getSampleBomLines(@Param('id') id: string) { return this.svc.getSampleBomLines(id); }
  @Put('sample-cards/:id/bom-lines') upsertSampleBomLines(@Param('id') id: string, @Body() lines: any[]) { return this.svc.upsertSampleBomLines(id, lines); }

  @Get('sample-cards/:id/wash-care') getSampleWashCare(@Param('id') id: string) { return this.svc.getSampleWashCare(id); }
  @Put('sample-cards/:id/wash-care') upsertSampleWashCare(@Param('id') id: string, @Body() dto: any) { return this.svc.upsertSampleWashCare(id, dto); }
}
