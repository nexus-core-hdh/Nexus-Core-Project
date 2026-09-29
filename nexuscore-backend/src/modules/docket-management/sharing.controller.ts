import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { SharingService } from './sharing.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Docket Sharing')
@PermissionModule('dockets', 'Dockets')
@Controller()
export class SharingController {
  constructor(private readonly svc: SharingService) {}

  // ── Authenticated sharing management ─────────────────────────────────────────

  @Post('dockets/:id/share-links')
  createShareLink(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createShareLink(id, dto, u.id);
  }

  @Get('dockets/:id/share-links')
  listShareLinks(@Param('id') id: string) {
    return this.svc.listShareLinks(id);
  }

  @Get('dockets/:id/buyer-access-log')
  getBuyerAccessLog(@Param('id') id: string) {
    return this.svc.getBuyerAccessLog(id);
  }

  @Post('dockets/:id/external-review')
  createExternalReview(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createExternalReview(id, dto, u.id);
  }

  // Static-segment routes must be declared before the dynamic share-links/:linkId routes
  @Get('dockets/external-reviews')
  listExternalReviews(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.listExternalReviews(u.branchId, q);
  }

  @Delete('dockets/share-links/:linkId')
  deactivateShareLink(@Param('linkId') linkId: string) {
    return this.svc.deactivateShareLink(linkId);
  }

  @Patch('dockets/share-links/:linkId')
  updateShareLink(@Param('linkId') linkId: string, @Body() dto: any) {
    return this.svc.updateShareLink(linkId, dto);
  }

  // ── Public routes (no JWT required) ──────────────────────────────────────────

  @Public()
  @Get('public/dockets/:token')
  publicGetDocket(@Param('token') token: string, @Req() req: Request) {
    return this.svc.publicGetDocket(token, req.ip, req.headers['user-agent']);
  }

  // Share-link password check: strict per-IP limit against guessing.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('public/dockets/:token/verify-password')
  publicVerifyPassword(@Param('token') token: string, @Body() body: any) {
    return this.svc.publicVerifyPassword(token, body.password);
  }

  @Public()
  @Get('public/dockets/:token/documents/:docId')
  publicDownloadDocument(
    @Param('token') token: string,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    return this.svc.publicDownloadDocument(token, docId, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Get('public/review/:token')
  publicGetReview(@Param('token') token: string) {
    return this.svc.publicGetReview(token);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  @Post('public/review/:token/comment')
  publicSubmitComment(@Param('token') token: string, @Body() body: any) {
    return this.svc.publicSubmitReviewComment(token, body);
  }
}
