import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { TrimInventoryCardService } from './trim-inventory-card.service';
// Same entity-agnostic satellite/attachment services Fabric Card reuses (built for Yarn Card,
// take the numeric IM_Item RecId directly, no Trim-specific logic needed) — see
// fabric-card.controller.ts's own comment for why this is reuse, not a new copy.
import { YarnCardSatellitesService } from './yarn-card-satellites.service';
import { YarnCardAttachmentsService } from './yarn-card-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Trim Cards')
@Controller('legacy-erp/trim-inventory-cards')
export class TrimInventoryCardController {
  constructor(
    private readonly svc: TrimInventoryCardService,
    private readonly satellites: YarnCardSatellitesService,
    private readonly attachments: YarnCardAttachmentsService,
  ) {}

  @Get() list(@Query('search') search?: string) {
    return this.svc.list(search);
  }

  @Get('by-code/:code') getByCode(@Param('code') code: string) {
    return this.svc.getByCode(code);
  }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() create(@Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, Number(userId) || 1, userId);
  }

  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, Number(userId) || 1);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.remove(id, Number(userId) || 1);
  }

  @Get(':id/attachments') listAttachments(@Param('id', ParseIntPipe) id: number, @Query('kind') kind: 'document' | 'picture') {
    return this.attachments.list(id, kind);
  }

  @Post(':id/attachments') uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { kind: 'document' | 'picture'; fileName: string; dataUrl: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.attachments.upload(id, dto, Number(userId) || 1);
  }

  @Get(':id/attachments/:attId/content') async getAttachmentContent(
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @Res() res: Response,
  ) {
    const { fileName, mimeType, buffer } = await this.attachments.content(id, attId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    res.send(buffer);
  }

  @Delete(':id/attachments/:attId') removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.attachments.remove(id, attId, Number(userId) || 1);
  }

  // Satellite tabs: warehouse-parameters, barcode, unit, explanation, attributes
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
