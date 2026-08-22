import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApprovalConfigurationService } from './approval-configuration.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// screenKey (a MenuItem.href, e.g. "/dashboard/legacy-erp/inventory-receipts-list?receiptType=12")
// travels in the body rather than as a ":screenKey" path segment — same reasoning as
// approval.controller.ts: it already contains "/" and its own "?query=".
@ApiTags('General Settings - Approval Configuration')
@Controller('general-settings/approval-configurations')
export class ApprovalConfigurationController {
  constructor(private readonly svc: ApprovalConfigurationService) {}

  // View — no dedicated permission required, matching this app's existing convention (every
  // other Legacy ERP GET route so far is read-open-to-any-authenticated-user, write-gated) —
  // satisfies "Normal users may view configuration only if existing permission conventions
  // allow it" without inventing a stricter rule.
  @Get() list() {
    return this.svc.list();
  }

  @Permissions({ module: 'general-settings', action: 'manage-approval-configuration' })
  @Put()
  update(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.svc.update(dto.screenKey, dto, userId);
  }
}
