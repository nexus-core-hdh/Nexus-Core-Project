import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { InventoryReceiptService } from './inventory-receipt.service';
import { InventoryReceiptAttachmentsService } from './inventory-receipt-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getReceiptTypeConfig } from './receipt-types.config';

// The generic "other 11 receipt types" route — mirrors InventoryReceiptController route-for-
// route, reusing the exact same (now-parameterized) InventoryReceiptService/
// InventoryReceiptAttachmentsService instances instead of duplicating any query-building logic.
// Purchase Receipt (type 2) deliberately stays on its own dedicated /inventory-receipts route
// only — kept out of the whitelist here so there is exactly one path per type, no drift risk.
@ApiTags('Legacy ERP - Receipts (generic)')
@Controller('legacy-erp/receipts/:receiptType')
export class ReceiptTypeController {
  constructor(
    private readonly svc: InventoryReceiptService,
    private readonly attachments: InventoryReceiptAttachmentsService,
  ) {}

  private resolve(receiptType: string) {
    const n = Number(receiptType);
    const cfg = getReceiptTypeConfig(n);
    if (!cfg) throw new NotFoundException(`Unknown receipt type "${receiptType}"`);
    if (cfg.receiptType === 2) throw new BadRequestException('Use /legacy-erp/inventory-receipts for Purchase Receipt');
    return cfg;
  }

  @Get() list(@Param('receiptType') receiptType: string, @Query('search') search?: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.list(search, cfg.receiptType);
  }

  @Get('by-receipt-no/:receiptNo') getByReceiptNo(@Param('receiptType') receiptType: string, @Param('receiptNo') receiptNo: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.getByReceiptNo(receiptNo, cfg.receiptType);
  }

  @Get('next-receipt-no') async previewNextReceiptNo(@Param('receiptType') receiptType: string) {
    const cfg = this.resolve(receiptType);
    return { receiptNo: await this.svc.nextReceiptNo(cfg.receiptType, cfg.numberPrefix) };
  }

  @Get(':id') get(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number) {
    const cfg = this.resolve(receiptType);
    return this.svc.get(id, cfg.receiptType);
  }

  @Post() create(@Param('receiptType') receiptType: string, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.create(dto, Number(userId) || 1, cfg.receiptType, cfg.numberPrefix);
  }

  @Put(':id') async update(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.update(id, dto, Number(userId) || 1, cfg.receiptType);
  }

  @Delete(':id') async remove(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.remove(id, Number(userId) || 1, cfg.receiptType);
  }

  // Detail lines (the grid)
  @Get(':id/items') async listItems(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.svc.listItems(id);
  }

  @Post(':id/items') async createItem(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.svc.createItem(id, dto, Number(userId) || 1, cfg.receiptType);
  }

  @Put(':id/items/:itemId') async updateItem(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.svc.updateItem(itemId, dto, Number(userId) || 1, id);
  }

  @Delete(':id/items/:itemId') async removeItem(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.svc.removeItem(itemId, Number(userId) || 1, id);
  }

  // Attachments — already generic (keyed by header RecId only, no ReceiptType filter), so the
  // ownership guard above is what keeps these scoped to the right type.
  @Get(':id/attachments') async listAttachments(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('kind') kind: 'document' | 'picture',
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.attachments.list(id, kind);
  }

  @Post(':id/attachments') async uploadAttachment(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { kind: 'document' | 'picture'; fileName: string; dataUrl: string },
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.attachments.upload(id, dto, Number(userId) || 1);
  }

  @Get(':id/attachments/:attId/content') async getAttachmentContent(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @Res() res: Response,
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    const { fileName, mimeType, buffer } = await this.attachments.content(id, attId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    res.send(buffer);
  }

  @Delete(':id/attachments/:attId') async removeAttachment(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    await this.svc.get(id, cfg.receiptType);
    return this.attachments.remove(id, attId, Number(userId) || 1);
  }
}
