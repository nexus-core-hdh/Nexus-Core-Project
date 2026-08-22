import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApprovalService } from './approval.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// screenKey values are Legacy ERP MenuItem.href strings, which already contain "/" and often
// their own "?query=" (e.g. "/dashboard/legacy-erp/inventory-receipts-list?receiptType=12") —
// unsafe/ambiguous as a ":screenKey" URL path segment even URL-encoded. Query-string / body
// params are used instead of the path-param shape sketched in the spec, for that reason.
@ApiTags('Approval')
@Controller('approval')
export class ApprovalController {
  constructor(private readonly svc: ApprovalService) {}

  @Post('submit')
  submit(@Body() dto: { screenKey: string; transactionId: string }, @CurrentUser('id') userId: string) {
    return this.svc.submit(dto.screenKey, String(dto.transactionId), userId);
  }

  @Permissions({ module: 'approval', action: 'approve' })
  @Post('approve')
  approve(@Body() dto: { screenKey: string; transactionId: string; remarks?: string }, @CurrentUser('id') userId: string) {
    return this.svc.approve(dto.screenKey, String(dto.transactionId), userId, dto.remarks);
  }

  @Permissions({ module: 'approval', action: 'reject' })
  @Post('reject')
  reject(@Body() dto: { screenKey: string; transactionId: string; remarks: string }, @CurrentUser('id') userId: string) {
    return this.svc.reject(dto.screenKey, String(dto.transactionId), userId, dto.remarks);
  }

  @Permissions({ module: 'approval', action: 'view-pending' })
  @Get('pending')
  getPending(@Query('screenKey') screenKey?: string) {
    return this.svc.getPending(screenKey);
  }

  @Permissions({ module: 'approval', action: 'view-history' })
  @Get('history')
  getHistory(@Query('screenKey') screenKey: string, @Query('transactionId') transactionId: string) {
    return this.svc.getHistory(screenKey, transactionId);
  }

  // Status is read-only, low-sensitivity (mirrors what the owning screen already shows) — no
  // dedicated permission, same "read open to any authenticated user" convention as every other
  // Legacy ERP GET route.
  @Get('status')
  getStatus(@Query('screenKey') screenKey: string, @Query('transactionId') transactionId: string) {
    return this.svc.getStatus(screenKey, transactionId);
  }
}
