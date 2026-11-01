import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ListPaging, Paging } from './list-paging.util';
import { sendStoredFile } from '../../common/security/file-safety';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionModule, Permissions } from '../../common/decorators/permissions.decorator';
import { InvoiceService } from './invoice.service';
import { InvoiceAttachmentsService } from './invoice-attachments.service';

// Invoices (legacy IM_Invoice) — one per receipt type (:receiptType = the invoice type, numbered
// like the receipt type it invoices). Writes require invoices:create / :update / :delete through the
// controller-level PermissionModule; Approve / Unapprove reuse approval:approve, exactly as the
// Packing List and Inventory Receipts. See invoice.service.ts for the data model.
@ApiTags('Legacy ERP - Invoices')
@PermissionModule('invoices', 'Invoices (legacy IM_Invoice)')
@Controller('legacy-erp/invoices/:receiptType')
export class InvoiceController {
  constructor(private readonly svc: InvoiceService, private readonly attachments: InvoiceAttachmentsService) {}

  @Get() list(@Param('receiptType', ParseIntPipe) receiptType: number, @Query('search') search?: string, @Paging() paging?: ListPaging | null) {
    return this.svc.list(receiptType, search, paging ?? null);
  }

  @Get('next-code') async previewNextCode(@Param('receiptType', ParseIntPipe) receiptType: number) {
    return { code: await this.svc.previewNextCode(receiptType) };
  }

  /** Inventory Receipts of this type that can be linked (not on another live invoice). */
  @Get('receipt-candidates') receiptCandidates(
    @Param('receiptType', ParseIntPipe) receiptType: number,
    @Query('search') search?: string,
    @Query('invoiceId') invoiceId?: string,
    @Paging() paging?: ListPaging | null,
    @Query('currentAccountId') currentAccountId?: string,
  ) {
    return this.svc.receiptCandidates(receiptType, search, invoiceId ? Number(invoiceId) : undefined, paging ?? null, Number(currentAccountId) || undefined);
  }

  /** Create Invoice from an Inventory Receipt (its right-click menu): its existing invoice, or a new
   *  one carrying the receipt's header. { created, receiptType, invoice }. */
  @Post('from-receipt/:receiptId') createFromReceipt(
    @Param('receiptType', ParseIntPipe) receiptType: number, @Param('receiptId', ParseIntPipe) receiptId: number,
    @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string,
  ) {
    return this.svc.createFromReceipt(receiptType, receiptId, Number(userId) || 1, { id: userId, companyId });
  }

  /** Create New's Source Receipt picker: the receipt type(s) this invoice type invoices. */
  @Get('source-receipt-types') sourceReceiptTypes(@Param('receiptType', ParseIntPipe) receiptType: number) {
    return this.svc.sourceReceiptTypes(receiptType);
  }

  /** Its Receipt No. list: saved receipts of `sourceType` with lines (already-invoiced ones carry their invoice). */
  @Get('source-receipts') sourceReceipts(
    @Param('receiptType', ParseIntPipe) receiptType: number,
    @Query('sourceType', ParseIntPipe) sourceType: number,
    @Query('search') search?: string,
    @Paging() paging?: ListPaging | null,
    @Query('currentAccountId') currentAccountId?: string,
  ) {
    return this.svc.sourceReceipts(receiptType, sourceType, search, paging ?? null, Number(currentAccountId) || undefined);
  }

  /** A picked receipt's saved header, shaped as the invoice form's fields. */
  @Get('source-receipts/:receiptId') sourceReceipt(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('receiptId', ParseIntPipe) receiptId: number) {
    return this.svc.sourceReceipt(receiptType, receiptId);
  }

  @Get(':id') get(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id, receiptType);
  }

  /** `copyReceiptHeader: true` (Create New from a picked receipt): the receipt's other saved header
   *  columns are copied too, as Create Invoice does; the fields sent are kept as reviewed.
   *  `inventoryReceiptIds` (2+): one consolidated invoice for receipts of one Current Account. */
  @Post() create(@Param('receiptType', ParseIntPipe) receiptType: number, @Body() body: Record<string, any>, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    const { copyReceiptHeader, ...dto } = body ?? {};
    return this.svc.create(receiptType, dto, Number(userId) || 1, { id: userId, companyId }, { copyReceiptHeader: copyReceiptHeader === true });
  }

  @Put(':id') update(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    return this.svc.update(id, receiptType, dto, Number(userId) || 1, { id: userId, companyId });
  }

  @Delete(':id') remove(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    return this.svc.remove(id, receiptType, Number(userId) || 1, { id: userId, companyId });
  }

  @Post(':id/approve')
  @Permissions({ module: 'approval', action: 'approve' })
  approve(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    return this.svc.approve(id, receiptType, userId, { id: userId, companyId });
  }

  @Post(':id/unapprove')
  @Permissions({ module: 'approval', action: 'approve' })
  unapprove(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    return this.svc.unapprove(id, receiptType, userId, { id: userId, companyId });
  }

  @Get(':id/attachments') async listAttachments(@Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @Query('kind') kind: 'document' | 'picture') {
    await this.svc.assertAttachable(id, receiptType, false);
    return this.attachments.list(id, kind);
  }

  @Post(':id/attachments') async uploadAttachment(
    @Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number,
    @Body() dto: { kind: 'document' | 'picture'; fileName: string; dataUrl: string }, @CurrentUser('id') userId: string,
  ) {
    await this.svc.assertAttachable(id, receiptType, true);
    return this.attachments.upload(id, dto, Number(userId) || 1);
  }

  @Get(':id/attachments/:attId/content') async getAttachmentContent(
    @Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @Param('attId', ParseIntPipe) attId: number, @Res() res: Response,
  ) {
    await this.svc.assertAttachable(id, receiptType, false);
    const { fileName, buffer } = await this.attachments.content(id, attId);
    sendStoredFile(res, { fileName, buffer });
  }

  @Delete(':id/attachments/:attId') async removeAttachment(
    @Param('receiptType', ParseIntPipe) receiptType: number, @Param('id', ParseIntPipe) id: number, @Param('attId', ParseIntPipe) attId: number, @CurrentUser('id') userId: string,
  ) {
    await this.svc.assertAttachable(id, receiptType, true);
    return this.attachments.remove(id, attId, Number(userId) || 1);
  }
}
