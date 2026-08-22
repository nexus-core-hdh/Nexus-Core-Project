import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ContractService } from './contract.service';
import { ContractAttachmentsService } from './contract-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getContractTypeConfig } from './contract-types.config';

// Generic route for both "00-Purchase Contract" and "00-Sale Contract" — mirrors
// receipt-type.controller.ts's :receiptType pattern, reusing the one ContractService/
// ContractAttachmentsService pair instead of duplicating a controller per contract kind. Unlike
// receipt-type.controller.ts there is no dedicated "master" route to defer to: both contract
// types are equally generic here, so every configured receiptType (including 1 and 2) is served
// straight from this one controller.
@ApiTags('Legacy ERP - Contracts (generic)')
@Controller('legacy-erp/contracts/:receiptType')
export class ContractController {
  constructor(
    private readonly svc: ContractService,
    private readonly attachments: ContractAttachmentsService,
  ) {}

  private resolve(receiptType: string) {
    const n = Number(receiptType);
    const cfg = getContractTypeConfig(n);
    if (!cfg) throw new NotFoundException(`Unknown contract type "${receiptType}"`);
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

  // Detail lines (the grid)
  @Get(':id/items') listItems(@Param('receiptType') receiptType: string, @Param('id', ParseIntPipe) id: number) {
    this.resolve(receiptType);
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
    @Param('receiptType') receiptType: string,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    this.resolve(receiptType);
    return this.svc.updateItem(itemId, dto, Number(userId) || 1);
  }

  @Delete(':id/items/:itemId') removeItem(
    @Param('receiptType') receiptType: string,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser('id') userId: string,
  ) {
    this.resolve(receiptType);
    return this.svc.removeItem(itemId, Number(userId) || 1);
  }

  // Attachments
  @Get(':id/attachments') listAttachments(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('kind') kind: 'document' | 'picture',
  ) {
    this.resolve(receiptType);
    return this.attachments.list(id, kind);
  }

  @Post(':id/attachments') uploadAttachment(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { kind: 'document' | 'picture'; fileName: string; dataUrl: string },
    @CurrentUser('id') userId: string,
  ) {
    this.resolve(receiptType);
    return this.attachments.upload(id, dto, Number(userId) || 1);
  }

  @Get(':id/attachments/:attId/content') async getAttachmentContent(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @Res() res: Response,
  ) {
    this.resolve(receiptType);
    const { fileName, mimeType, buffer } = await this.attachments.content(id, attId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    res.send(buffer);
  }

  @Delete(':id/attachments/:attId') removeAttachment(
    @Param('receiptType') receiptType: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @CurrentUser('id') userId: string,
  ) {
    this.resolve(receiptType);
    return this.attachments.remove(id, attId, Number(userId) || 1);
  }
}
