import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccountService } from './account.service';
import { AccountSatellitesService } from './account-satellites.service';
import { AccountAttachmentsService } from './account-attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Legacy ERP - Current Accounts')
@Controller('legacy-erp/accounts')
export class AccountController {
  constructor(
    private readonly svc: AccountService,
    private readonly satellites: AccountSatellitesService,
    private readonly attachments: AccountAttachmentsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
    return this.svc.create(dto, Number(userId) || 1);
  }

  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, Number(userId) || 1);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.remove(id, Number(userId) || 1);
  }

  // Attachments (documents + pictures) — stored in the existing FI_AccountAttachment table,
  // differentiated by its existing Type column. Declared before the generic :id/:tab routes
  // below since they'd otherwise match this same path shape first.
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

  // Short-lived (5 min), purpose-scoped token for handing a file URL to a third-party viewer
  // (Microsoft Office Online — Word/Excel have no browser-native renderer). Deliberately NOT
  // the user's real session token: that's long-lived (7d) and would otherwise be exposed to
  // Microsoft's servers/logs for every Office-doc preview. Normal auth required to mint one.
  @Get(':id/attachments/:attId/view-token') async getViewToken(
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @CurrentUser('id') userId: string,
  ) {
    await this.attachments.assertExists(id, attId);
    const token = this.jwtService.sign(
      { sub: userId, scope: 'attachment-view', accountId: id, attId },
      { secret: this.configService.get<string>('jwt.secret'), expiresIn: '5m' },
    );
    return { token };
  }

  // Public + manual JWT check (same jwtService.verify() pattern NotificationsGateway already
  // uses for its socket handshake) because the View action needs a real top-level browser
  // navigation to this URL so the browser sees the actual Content-Type/Content-Disposition
  // response headers and decides how to render it — a header-authenticated fetch()-as-blob
  // can't do that (blob: URLs carry no HTTP headers, which is why Office files were forcing
  // a download regardless of what the server sent). The Download button keeps using the
  // header-authenticated fetch it already had; this just adds a second, equally-authenticated
  // way in for real navigation.
  @Public()
  @Get(':id/attachments/:attId/content') async getAttachmentContent(
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const token = headerToken || queryToken;
    if (!token) throw new UnauthorizedException('Authentication required');
    try {
      this.jwtService.verify(token, { secret: this.configService.get<string>('jwt.secret') });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

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

  // Satellite tabs: forex-rates, address, contacts, explanations, guarantors, bank-accounts, inventory-attributes
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

  @Delete(':id/:tab/:lineId') removeTabRow(
    @Param('tab') tab: string,
    @Param('lineId', ParseIntPipe) lineId: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.satellites.remove(tab, lineId, Number(userId) || 1);
  }

  @Get(':id/totals/all') totals(@Param('id', ParseIntPipe) id: number) {
    return this.satellites.totals(id);
  }
}
