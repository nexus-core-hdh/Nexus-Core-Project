import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DashboardService, TRANSACTION_TYPES, type TransactionType } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Read-only. Scope always comes from the authenticated caller (@CurrentUser), never a query param.
@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('recent-activity')
  recentActivity(@CurrentUser() u: any, @Query('take') take?: string) {
    const n = Math.min(Math.max(Number(take) || 8, 1), 20);
    return this.svc.recentActivity(u?.companyId, u?.branchId ?? undefined, n);
  }

  // from/to = the dashboard date range as ISO instants (the browser's local start of the first day
  // and end of the last day), counted server-side.
  @Get('order-kpis')
  orderKpis(@Query('from') from?: string, @Query('to') to?: string) {
    const start = from ? new Date(from) : null;
    const end = to ? new Date(to) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('from and to must be ISO dates with from <= to');
    }
    return this.svc.orderKpis(start, end);
  }

  // type = all | sale | purchase | payment | receipt — filtered server-side.
  @Get('recent-transactions')
  recentTransactions(@CurrentUser() u: any, @Query('type') type?: string, @Query('take') take?: string) {
    const t = type && (TRANSACTION_TYPES as string[]).includes(type) ? (type as TransactionType) : 'all';
    const n = Math.min(Math.max(Number(take) || 8, 1), 20);
    return this.svc.recentTransactions(u?.companyId, u?.branchId ?? undefined, t, n);
  }
}
