import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorklistFieldsService } from './worklist-fields.service';
import { WorklistRowsService } from './worklist-rows.service';

@ApiTags('Legacy ERP - Receipt & Master Data')
@Controller('legacy-erp/worklist-fields')
export class WorklistFieldsController {
  constructor(
    private readonly svc: WorklistFieldsService,
    private readonly rowsSvc: WorklistRowsService,
  ) {}

  // `primary` is optional and scopes the returned sources to one list screen's own source (see
  // ALLOWED_SOURCES_BY_PRIMARY in worklist-fields.service.ts). Omitted by Receipt & Master Data /
  // Financial Receipt & Master Data, which intentionally see every source, unchanged.
  @Get() list(@Query('primary') primary?: string) {
    return this.svc.list(primary);
  }

  // Custom-worklist row resolution — the currently selected top-right dropdown table is always
  // the primary/row-identity source (unchanged, see receipt-master-data/page.tsx); this just
  // additionally resolves whichever of the worklist's fields have a real relationship to it.
  @Post('resolve')
  resolve(@Body() body: { primaryTable: string; fields: { source: string; key: string }[]; search?: string }) {
    return this.rowsSvc.resolve(body.primaryTable, body.fields as any, body.search);
  }
}
