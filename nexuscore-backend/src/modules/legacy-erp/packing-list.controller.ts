import { ListPaging, Paging } from './list-paging.util';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionModule, Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PackingListService } from './packing-list.service';

// Write routes require packing-lists:create (POST) / :update (PUT) / :delete (DELETE) through the
// controller-level PermissionModule; approval reuses the same approval:approve permission Purchase
// Order and Inventory Receipt approval already use.
@ApiTags('Legacy ERP - Packing List')
@PermissionModule('packing-lists', 'Packing lists')
@Controller('legacy-erp/packing-lists')
export class PackingListController {
  constructor(private readonly svc: PackingListService) {}

  @Get() list(@Query('search') search?: string, @Paging() paging?: ListPaging | null) {
    return this.svc.list(search, paging ?? null);
  }

  // Static routes are declared ahead of :id so they are never parsed as an id.
  @Get('next-code') async previewNextCode() {
    return { code: await this.svc.previewNextCode() };
  }

  @Get('work-order-context/:workOrderId') workOrderContext(@Param('workOrderId', ParseIntPipe) workOrderId: number) {
    return this.svc.workOrderContext(workOrderId);
  }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() create(@Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, Number(userId) || 1);
  }

  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, Number(userId) || 1);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.remove(id, Number(userId) || 1);
  }

  @Get(':id/lines') getLines(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getLines(id);
  }

  @Put(':id/lines') saveLines(@Param('id', ParseIntPipe) id: number, @Body() body: { lines: any[] }, @CurrentUser('id') userId: string) {
    return this.svc.saveLines(id, body?.lines as any, Number(userId) || 1);
  }

  @Get(':id/summary') summary(@Param('id', ParseIntPipe) id: number) {
    return this.svc.summary(id);
  }

  @Post(':id/approve')
  @Permissions({ module: 'approval', action: 'approve' })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.setApproved(id, true, Number(userId) || 1);
  }

  @Post(':id/unapprove')
  @Permissions({ module: 'approval', action: 'approve' })
  unapprove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.setApproved(id, false, Number(userId) || 1);
  }
}
