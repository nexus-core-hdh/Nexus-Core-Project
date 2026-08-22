import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { InventoryReceiptService } from './inventory-receipt.service';
import { InventoryReceiptAttachmentsService } from './inventory-receipt-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Legacy ERP - Inventory Receipts')
@Controller('legacy-erp/inventory-receipts')
export class InventoryReceiptController {
  constructor(
    private readonly svc: InventoryReceiptService,
    private readonly attachments: InventoryReceiptAttachmentsService,
  ) {}

  @Get() list(@Query('search') search?: string) {
    return this.svc.list(search);
  }

  @Get('by-receipt-no/:receiptNo') getByReceiptNo(@Param('receiptNo') receiptNo: string) {
    return this.svc.getByReceiptNo(receiptNo);
  }

  // Preview-only — same convention as purchase-order.controller.ts's next-receipt-no.
  @Get('next-receipt-no') async previewNextReceiptNo() {
    return { receiptNo: await this.svc.nextReceiptNo() };
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

  // Approval (General Settings -> Approval Configuration) — no-op (existing workflow
  // unchanged) whenever approval isn't configured/required for this screen.
  @Get(':id/approval-status') getApprovalStatus(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getApprovalStatus(id);
  }

  @Post(':id/submit-for-approval') submitForApproval(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.submitForApproval(id, userId);
  }

  @Permissions({ module: 'approval', action: 'approve' })
  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: { remarks?: string }, @CurrentUser('id') userId: string) {
    return this.svc.approve(id, userId, dto?.remarks);
  }

  @Permissions({ module: 'approval', action: 'reject' })
  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: { remarks: string }, @CurrentUser('id') userId: string) {
    return this.svc.reject(id, userId, dto.remarks);
  }

  // Detail lines (the grid)
  @Get(':id/items') listItems(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listItems(id);
  }

  @Post(':id/items') createItem(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.createItem(id, dto, Number(userId) || 1);
  }

  @Put(':id/items/:itemId') updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.updateItem(itemId, dto, Number(userId) || 1, id);
  }

  @Delete(':id/items/:itemId') removeItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @CurrentUser('id') userId: string) {
    return this.svc.removeItem(itemId, Number(userId) || 1, id);
  }

  // Variant breakdown — mirrors purchase-order.controller.ts's own item-variant-options/
  // variants routes exactly (see inventory-receipt.service.ts's own comment). Two path
  // segments ('item-variant-options/:inventoryId'), so it never collides with the single-
  // segment ':id' route above regardless of declaration order.
  @Get('item-variant-options/:inventoryId') listItemVariantOptions(@Param('inventoryId', ParseIntPipe) inventoryId: number) {
    return this.svc.listItemVariantOptions(inventoryId);
  }

  @Get(':id/items/:itemId/variants') listItemVariantLines(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.svc.listItemVariantLines(itemId);
  }

  @Post(':id/items/:itemId/variants') createItemVariantLine(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.createItemVariantLine(itemId, dto, Number(userId) || 1);
  }

  @Put(':id/items/:itemId/variants/:variantLineId') updateItemVariantLine(
    @Param('variantLineId', ParseIntPipe) variantLineId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.updateItemVariantLine(variantLineId, dto, Number(userId) || 1);
  }

  @Delete(':id/items/:itemId/variants/:variantLineId') removeItemVariantLine(
    @Param('variantLineId', ParseIntPipe) variantLineId: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.removeItemVariantLine(variantLineId, Number(userId) || 1);
  }

  // Attachments
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
}
