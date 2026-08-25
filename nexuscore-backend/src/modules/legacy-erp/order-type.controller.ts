import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderAttachmentsService } from './purchase-order-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { getOrderTypeConfig } from './order-types.config';

// The generic "other order types" route — mirrors receipt-type.controller.ts route-for-route
// (Order Screen Replication's counterpart to Receipt Screen Replication), reusing the exact same
// (now-parameterized) PurchaseOrderService/PurchaseOrderAttachmentsService instances instead of
// duplicating any query-building logic. Purchase Order (type 1) deliberately stays on its own
// dedicated /purchase-orders route only — kept out of the whitelist here so there is exactly one
// path per type, no drift risk.
@ApiTags('Legacy ERP - Orders (generic)')
@Controller('legacy-erp/orders/:receiptType')
export class OrderTypeController {
  constructor(
    private readonly svc: PurchaseOrderService,
    private readonly attachments: PurchaseOrderAttachmentsService,
  ) {}

  private resolve(receiptType: string) {
    const n = Number(receiptType);
    const cfg = getOrderTypeConfig(n);
    if (!cfg) throw new NotFoundException(`Unknown order type "${receiptType}"`);
    if (cfg.receiptType === 1) throw new BadRequestException('Use /legacy-erp/purchase-orders for Purchase Order');
    return cfg;
  }

  @Get() list(
    @Param('receiptType') receiptType: string,
    @Query('search') search?: string,
    @Query('approvalStatus') approvalStatus?: 'all' | 'approved' | 'unapproved' | 'rejected',
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.list(search, approvalStatus, cfg.receiptType);
  }

  @Get('by-receipt-no/:receiptNo') getByReceiptNo(@Param('receiptType') receiptType: string, @Param('receiptNo') receiptNo: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.getByReceiptNo(receiptNo, cfg.receiptType);
  }

  @Get('next-receipt-no') async previewNextReceiptNo(@Param('receiptType') receiptType: string) {
    const cfg = this.resolve(receiptType);
    return { receiptNo: await this.svc.nextReceiptNo(cfg.receiptType, cfg.numberPrefix) };
  }

  // Item-master-driven, not order-specific — declared before ':id' so it isn't ever shadowed
  // by that route, same defensive ordering purchase-order.controller.ts's own routes use.
  @Get('item-variant-options/:inventoryId') listItemVariantOptions(@Param('inventoryId', ParseIntPipe) inventoryId: number) {
    return this.svc.listItemVariantOptions(inventoryId);
  }

  // Receiving screen -> Current Account -> Pending Orders (e.g. Outside Process Receive Receipt
  // sourcing from Subcontract Order). `receivingReceiptType` tells listPending() which IM_Receipt
  // screen is asking, so its approval gate checks the right screenKey — see that method's own
  // comment. Declared before ':id' — same defensive ordering as the static routes above.
  @Get('pending') listPending(
    @Param('receiptType') receiptType: string,
    @Query('currentAccountId', ParseIntPipe) currentAccountId: number,
    @Query('receivingReceiptType', ParseIntPipe) receivingReceiptType: number,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.listPending(currentAccountId, cfg.receiptType, receivingReceiptType);
  }

  // Universal Action Menu -> Return/Purchase Receipt submenu.
  @Get(':id/related-receipts') listRelatedReceipts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listRelatedReceipts(id);
  }

  @Get(':id') get(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number) {
    const cfg = this.resolve(receiptType);
    return this.svc.get(id, cfg.receiptType);
  }

  @Post() create(@Param('receiptType') receiptType: string, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.create(dto, Number(userId) || 1, cfg.receiptType, cfg.numberPrefix);
  }

  @Put(':id') update(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.update(id, dto, Number(userId) || 1, cfg.receiptType);
  }

  @Delete(':id') remove(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.remove(id, Number(userId) || 1, cfg.receiptType);
  }

  // Approval (General Settings -> Approval Configuration) — no-op (existing workflow
  // unchanged) whenever approval isn't configured/required for this screen. Same routes/
  // permission shape as purchase-order.controller.ts's own approval routes.
  @Get(':id/approval-status') getApprovalStatus(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number) {
    const cfg = this.resolve(receiptType);
    return this.svc.getApprovalStatus(id, cfg.receiptType);
  }

  @Post(':id/submit-for-approval') submitForApproval(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.submitForApproval(id, userId, cfg.receiptType);
  }

  @Permissions({ module: 'approval', action: 'approve' })
  @Post(':id/approve')
  approve(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { remarks?: string },
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.approve(id, userId, dto?.remarks, cfg.receiptType);
  }

  @Permissions({ module: 'approval', action: 'reject' })
  @Post(':id/reject')
  reject(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { remarks: string },
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.reject(id, userId, dto.remarks, cfg.receiptType);
  }

  // Detail lines (the grid)
  @Get(':id/items') listItems(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listItems(id);
  }

  @Post(':id/items') createItem(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.createItem(id, dto, Number(userId) || 1, cfg.receiptType);
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

  // Variant breakdown (Variant2 column)
  @Get(':id/items/:itemId/variants') listItemVariantLines(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.svc.listItemVariantLines(itemId);
  }

  @Post(':id/items/:itemId/variants') createItemVariantLine(
    @Param('receiptType') receiptType: string,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.createItemVariantLine(itemId, dto, Number(userId) || 1, cfg.receiptType);
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
