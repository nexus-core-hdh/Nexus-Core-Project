import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { InventoryReceiptService } from './inventory-receipt.service';
import { InventoryReceiptAttachmentsService } from './inventory-receipt-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
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

  @Get() list(
    @Param('receiptType') receiptType: string,
    @Query('search') search?: string,
    // Subcontract Receipts List's own "Subcontractation" filter dropdown — every other caller
    // omits this.
    @Query('subcontractTypeId') subcontractTypeId?: string,
  ) {
    const cfg = this.resolve(receiptType);
    return this.svc.list(search, cfg.receiptType, subcontractTypeId ? Number(subcontractTypeId) : undefined);
  }

  @Get('by-receipt-no/:receiptNo') getByReceiptNo(@Param('receiptType') receiptType: string, @Param('receiptNo') receiptNo: string) {
    const cfg = this.resolve(receiptType);
    return this.svc.getByReceiptNo(receiptNo, cfg.receiptType);
  }

  @Get('next-receipt-no') async previewNextReceiptNo(@Param('receiptType') receiptType: string) {
    const cfg = this.resolve(receiptType);
    return { receiptNo: await this.svc.nextReceiptNo(cfg.receiptType, cfg.numberPrefix) };
  }

  // Universal Action Menu -> "Import Related Receipt" — Purchase Return (122) only. Declared
  // before the single-segment ':id' route below (same convention as by-receipt-no/next-receipt-no
  // above) so a request to /related-lines is never swallowed by :id's ParseIntPipe. Guarded here
  // (not just by the frontend hiding the action elsewhere) so the endpoint itself rejects any
  // other receipt type — see inventory-receipt.service.ts's assertRelatedImportSource for the
  // matching write-time guard on createItem/updateItem.
  @Get('related-lines') listRelatedImportable(@Param('receiptType') receiptType: string, @Query('currentAccountId', ParseIntPipe) currentAccountId: number) {
    const cfg = this.resolve(receiptType);
    if (cfg.receiptType !== 122) throw new BadRequestException('Import Related Receipt is only available for Purchase Return.');
    return this.svc.listRelatedImportable(currentAccountId);
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

  // Approval — mirrors InventoryReceiptController's own 4 routes exactly, delegating to the
  // same already-receiptType-parameterized InventoryReceiptService methods. Purchase Receipt
  // (type 2) has its own copy of these on /inventory-receipts; every other type (Purchase
  // Return=122, Outside Process Receive=11, etc.) only gets Approve/Reject through this route.
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

  // Universal Action Menu -> Return/Purchase Receipt submenu.
  @Get(':id/related-receipts') listRelatedReceipts(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number) {
    const cfg = this.resolve(receiptType);
    return this.svc.listRelatedReceipts(id, cfg.receiptType);
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
    return this.svc.updateItem(itemId, dto, Number(userId) || 1, id, cfg.receiptType);
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
