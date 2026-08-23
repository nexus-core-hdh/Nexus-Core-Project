import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderAttachmentsService } from './purchase-order-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Legacy ERP - Purchase Orders')
@Controller('legacy-erp/purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly svc: PurchaseOrderService,
    private readonly attachments: PurchaseOrderAttachmentsService,
  ) {}

  @Get() list(@Query('search') search?: string, @Query('approvalStatus') approvalStatus?: 'all' | 'approved' | 'unapproved' | 'rejected') {
    return this.svc.list(search, approvalStatus);
  }

  @Get('by-receipt-no/:receiptNo') getByReceiptNo(@Param('receiptNo') receiptNo: string) {
    return this.svc.getByReceiptNo(receiptNo);
  }

  // Preview-only, same convention as yarn-card.controller.ts's next-code — lets the Create
  // screen display the Receipt No it's about to get before Save is ever pressed.
  @Get('next-receipt-no') async previewNextReceiptNo() {
    return { receiptNo: await this.svc.nextReceiptNo() };
  }

  // Item-master-driven, not order-specific — declared before ':id' so it isn't ever shadowed
  // by that route, same defensive ordering as the two static routes above.
  @Get('item-variant-options/:inventoryId') listItemVariantOptions(@Param('inventoryId', ParseIntPipe) inventoryId: number) {
    return this.svc.listItemVariantOptions(inventoryId);
  }

  // Purchase Receipt -> Current Account -> right-click -> Pending Orders. Same defensive
  // ordering as the static routes above — declared before ':id'.
  @Get('pending') listPending(@Query('currentAccountId', ParseIntPipe) currentAccountId: number) {
    return this.svc.listPending(currentAccountId);
  }

  // Universal Action Menu -> Return/Purchase Receipt submenu.
  @Get(':id/related-receipts') listRelatedReceipts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listRelatedReceipts(id);
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
  // unchanged) whenever approval isn't configured/required for this screen. Same routes/
  // permission shape as inventory-receipt.controller.ts's own approval routes.
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
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.updateItem(itemId, dto, Number(userId) || 1);
  }

  @Delete(':id/items/:itemId') removeItem(@Param('itemId', ParseIntPipe) itemId: number, @CurrentUser('id') userId: string) {
    return this.svc.removeItem(itemId, Number(userId) || 1);
  }

  // Variant breakdown (Variant2 column) — one line's quantity split across composite
  // Variant1+Variant2 combinations. Nested under the line the same way items/explanations
  // nest under the header.
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

  // Explanation tab
  @Get(':id/explanations') listExplanations(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listExplanations(id);
  }

  @Post(':id/explanations') createExplanation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { explanationText: string; explanationDate?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.createExplanation(id, dto, Number(userId) || 1);
  }

  @Delete(':id/explanations/:explanationId') removeExplanation(
    @Param('explanationId', ParseIntPipe) explanationId: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.removeExplanation(explanationId, Number(userId) || 1);
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
