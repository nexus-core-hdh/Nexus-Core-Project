import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiTags } from '@nestjs/swagger';
import { DocketsService } from './dockets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Dockets')
@PermissionModule('dockets', 'Dockets')
@Controller()
export class DocketsController {
  constructor(private readonly svc: DocketsService) {}

  // ── Dockets ───────────────────────────────────────────────────────────────────
  @Get('dockets') listDockets(@CurrentUser() u: any, @Query() q: any) { return this.svc.listDockets(u.branchId, q); }
  @Post('dockets') createDocket(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDocket(dto, u.branchId, u.id); }
  @Get('dockets/entity/:entityType/:entityId') getDocketByEntity(@Param('entityType') et: string, @Param('entityId') eid: string) { return this.svc.getDocketByEntity(et, eid); }
  @Get('dockets/:id') getDocket(@Param('id') id: string) { return this.svc.getDocket(id); }
  @Patch('dockets/:id/status') updateDocketStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) { return this.svc.updateDocketStatus(id, body.status, body.notes, u.id); }
  @Post('dockets/:id/recalculate') recalculate(@Param('id') id: string) { return this.svc.recalculateDocketPublic(id); }
  @Delete('dockets/:id') deleteDocket(@Param('id') id: string) { return this.svc.deleteDocket(id); }

  // ── Docket Items (nested under docket) ───────────────────────────────────────
  @Get('dockets/:id/items') getDocketItems(@Param('id') id: string) { return this.svc.getDocketItems(id); }
  @Post('dockets/:id/items') addDocketItem(@Param('id') id: string, @Body() dto: any) { return this.svc.addDocketItem(id, dto); }

  // ── Docket Items (standalone) ─────────────────────────────────────────────────
  @Get('docket-items/:id') getDocketItem(@Param('id') id: string) { return this.svc.getDocketItem(id); }
  @Patch('docket-items/:id') updateDocketItem(@Param('id') id: string, @Body() dto: any) { return this.svc.updateDocketItem(id, dto); }
  @Delete('docket-items/:id') deleteDocketItem(@Param('id') id: string) { return this.svc.deleteDocketItem(id); }
  @Get('docket-items/:id/history') getDocketItemHistory(@Param('id') id: string) { return this.svc.getDocketItemHistory(id); }
  @Patch('docket-items/:id/approve') approveItem(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.approveItem(id, dto, u.id); }
  @Patch('docket-items/:id/reject') rejectItem(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.rejectItem(id, dto, u.id); }
  @Patch('docket-items/:id/request-revision') requestRevision(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.requestRevision(id, dto, u.id); }

  // ── Docket Documents ──────────────────────────────────────────────────────────
  @Post('docket-items/:id/documents') uploadDocument(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.uploadDocument(id, dto, u.id); }
  @Get('docket-items/:id/documents') getItemDocuments(@Param('id') id: string) { return this.svc.getItemDocuments(id); }
  @Get('docket-documents/:id') getDocument(@Param('id') id: string) { return this.svc.getDocument(id); }
  @Delete('docket-documents/:id') deleteDocument(@Param('id') id: string) { return this.svc.deleteDocument(id); }
  @Get('docket-documents/:id/download') downloadDocument(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.downloadDocument(id, u.id); }
}
