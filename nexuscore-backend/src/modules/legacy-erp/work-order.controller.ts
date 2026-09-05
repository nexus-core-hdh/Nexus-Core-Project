import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Delete, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkOrderService, BomLineType } from './work-order.service';
// Entity-agnostic (config-driven table/fkColumn per tab, confirmed by reading its own
// implementation) — already reused across Fabric Card despite its "YarnCard" name (see
// fabric-card.controller.ts's own comment on this). Reused again here for Work Order's
// Explanation/Activities/Expenses tabs instead of three near-identical new CRUD services.
import { YarnCardSatellitesService } from './yarn-card-satellites.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Work Orders')
@Controller('legacy-erp/work-orders')
export class WorkOrderController {
  constructor(
    private readonly svc: WorkOrderService,
    private readonly satellites: YarnCardSatellitesService,
  ) {}

  @Get() list(@Query('search') search?: string) {
    return this.svc.list(search);
  }

  @Get('next-code') async previewNextCode() {
    return { code: await this.svc.nextWorkOrderNo() };
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

  // Style Info lines
  @Get(':id/items') listItems(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listItems(id);
  }

  @Put(':id/items') upsertItems(@Param('id', ParseIntPipe) id: number, @Body() lines: any[], @CurrentUser('id') userId: string) {
    return this.svc.upsertItems(id, lines, Number(userId) || 1);
  }

  // Manufacturing Quantities (Color/Size breakdown) for one Style Info line
  @Get('items/:itemId/variants') listItemVariants(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.svc.listItemVariants(itemId);
  }

  @Put('items/:itemId/variants') upsertItemVariants(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() lines: any[],
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.upsertItemVariants(itemId, lines, Number(userId) || 1);
  }

  // BOM (Fabric/Trim/Ornament/Process) — MA_Recipe/MA_RecipeItem
  @Get(':id/bom/:lineType') listBom(@Param('id', ParseIntPipe) id: number, @Param('lineType') lineType: BomLineType) {
    return this.svc.listBom(id, lineType);
  }

  @Put(':id/bom/:lineType') upsertBom(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineType') lineType: BomLineType,
    @Body() lines: any[],
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.upsertBom(id, lineType, lines, Number(userId) || 1);
  }

  @Post(':id/bom/transfer-from-style-card') transferBomFromStyleCard(
    @Param('id', ParseIntPipe) id: number,
    @Body('styleCardId') styleCardId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.transferBomFromStyleCard(id, styleCardId, Number(userId) || 1);
  }

  // Explanation/Activities/Expenses tabs — generic satellite CRUD, config added in
  // yarn-card-satellites.service.ts (work-order-explanation/work-order-activities/
  // work-order-expenses keys, pointed at MA_WorkOrderExplanation/MA_WorkOrderActivity/
  // MA_WorkOrderExpense with fkColumn "WorkOrderId").
  @Get(':id/:tab') listTab(@Param('id', ParseIntPipe) id: number, @Param('tab') tab: string) {
    return this.satellites.list(tab, id);
  }

  @Post(':id/:tab') createTabRow(
    @Param('id', ParseIntPipe) id: number,
    @Param('tab') tab: string,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.satellites.create(tab, id, dto, Number(userId) || 1);
  }

  @Put(':id/:tab/:lineId') updateTabRow(
    @Param('tab') tab: string,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.satellites.update(tab, lineId, dto, Number(userId) || 1);
  }

  @Delete(':id/:tab/:lineId') removeTabRow(
    @Param('tab') tab: string,
    @Param('lineId', ParseIntPipe) lineId: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.satellites.remove(tab, lineId, Number(userId) || 1);
  }
}
