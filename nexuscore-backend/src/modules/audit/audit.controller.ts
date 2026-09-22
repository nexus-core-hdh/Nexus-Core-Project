import { Controller, Get, Param, NotFoundException, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Log Tracking / Log Details — the project-wide Audit read API. Company scope is ALWAYS taken
// from the authenticated caller's own token-derived user row (@CurrentUser), never from a query
// param, so this can never become a cross-tenant document browser regardless of what a client
// sends (see AuditService.list/getById's own companyId-first WHERE clause).
@ApiTags('Audit / Log Tracking')
@Controller('audit/logs')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  list(
    @CurrentUser('companyId') companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('module') module?: string,
    @Query('screenKey') screenKey?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('documentNo') documentNo?: string,
    @Query('entityId') entityId?: string,
    @Query('correlationId') correlationId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.svc.list({
      companyId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      userId, module, screenKey, action, entityType, documentNo, entityId, correlationId,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      sortDir,
    });
  }

  @Get('filters/modules')
  listModules(@CurrentUser('companyId') companyId: string) {
    return this.svc.listModules(companyId);
  }

  @Get('filters/actions')
  listActions(@CurrentUser('companyId') companyId: string) {
    return this.svc.listActions(companyId);
  }

  @Get('filters/entity-types')
  listEntityTypes(@CurrentUser('companyId') companyId: string) {
    return this.svc.listEntityTypes(companyId);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    const row = await this.svc.getById(id, companyId);
    if (!row) throw new NotFoundException('Audit event not found.');
    return row;
  }
}
