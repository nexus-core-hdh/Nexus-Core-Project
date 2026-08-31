import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScreenParameterService } from './screen-parameter.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// screenKey travels as a query param (never a ":screenKey" path segment) — same reasoning as
// approval-configuration.controller.ts: a screen key is a MenuItem.href, which already contains
// "/" and often its own "?query=" (e.g. "/dashboard/legacy-erp/inventory-receipts-list?receiptType=12"),
// neither of which survives being a single path segment.
@ApiTags('General Settings - Screen Parameters')
@Controller('general-settings/screen-parameters')
export class ScreenParameterController {
  constructor(private readonly svc: ScreenParameterService) {}

  // Admin management list (all parameters for one screen, active or not) — the Settings UI's own
  // data source. Read-open to any authenticated user, matching this app's existing convention
  // (every other Legacy ERP GET route so far is read-open, write-gated).
  @Get() list(@Query('screenKey') screenKey: string) {
    return this.svc.list(screenKey);
  }

  // The dynamic API: screenKey -> active parameter configuration only. Called by ANY screen that
  // wants its own configuration, not just Settings admins — deliberately no @Permissions here,
  // same reasoning as list() above.
  @Get('active') listActive(@Query('screenKey') screenKey: string) {
    return this.svc.listActive(screenKey);
  }

  @Permissions({ module: 'general-settings', action: 'manage-screen-parameters' })
  @Post()
  create(@Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, userId);
  }

  @Permissions({ module: 'general-settings', action: 'manage-screen-parameters' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, userId);
  }

  @Permissions({ module: 'general-settings', action: 'manage-screen-parameters' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
