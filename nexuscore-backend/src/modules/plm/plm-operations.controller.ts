import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlmOperationsService } from './plm-operations.service';
import { PlmReportsService } from './plm-reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('PLM Operations')
@Controller('plm')
export class PlmOperationsController {
  constructor(
    private readonly svc: PlmOperationsService,
    private readonly reports: PlmReportsService,
  ) {}

  // PLM Orders
  @Get('orders') listOrders(@CurrentUser() u: any, @Query() q: any) { return this.svc.listOrders(u.branchId, q); }
  @Post('orders') createOrder(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createOrder(dto, u.branchId, u.id); }
  @Get('orders/:id') getOrder(@Param('id') id: string) { return this.svc.getOrder(id); }
  @Put('orders/:id') updateOrder(@Param('id') id: string, @Body() dto: any) { return this.svc.updateOrder(id, dto); }
  @Delete('orders/:id') deleteOrder(@Param('id') id: string) { return this.svc.deleteOrder(id); }
  @Patch('orders/:id/status') updateOrderStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) { return this.svc.updateOrderStatus(id, body.status, body.notes, u.id, u.companyId); }
  @Get('orders/:id/tasks') getOrderTasks(@Param('id') id: string) { return this.svc.getOrderTasks(id); }
  @Post('orders/:id/tasks') createOrderTask(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.createOrderTask(id, dto, u.branchId, u.id); }

  // PLM Tasks
  @Get('tasks') listTasks(@CurrentUser() u: any, @Query() q: any) { return this.svc.listTasks(u.branchId, q); }
  @Post('tasks') createTask(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createTask(dto, u.branchId, u.id); }
  @Get('tasks/my-tasks') getMyTasks(@CurrentUser() u: any) { return this.svc.getMyTasks(u.id, u.branchId); }
  @Get('tasks/overdue') getOverdueTasks(@CurrentUser() u: any) { return this.svc.getOverdueTasks(u.branchId); }
  @Get('tasks/:id') getTask(@Param('id') id: string) { return this.svc.getTask(id); }
  @Put('tasks/:id') updateTask(@Param('id') id: string, @Body() dto: any) { return this.svc.updateTask(id, dto); }
  @Delete('tasks/:id') deleteTask(@Param('id') id: string) { return this.svc.deleteTask(id); }
  @Patch('tasks/:id/status') updateTaskStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) { return this.svc.updateTaskStatus(id, body.status, body.actualHrs, body.notes, u.id); }

  // Critical Path
  @Get('critical-path') listCriticalPaths(@CurrentUser() u: any, @Query() q: any) { return this.svc.listCriticalPaths(u.branchId, q); }
  @Post('critical-path') createCriticalPathFromBody(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCriticalPath(dto.styleCardId, { ...dto, createdBy: u.id }); }
  @Get('critical-path/:id/gantt') getGantt(@Param('id') id: string) { return this.svc.getGanttData(id); }
  @Get('critical-path/:styleCardId') getCriticalPath(@Param('styleCardId') id: string) { return this.svc.getCriticalPath(id); }
  @Post('critical-path/:styleCardId') createCriticalPath(@Param('styleCardId') id: string, @Body() dto: any) { return this.svc.createCriticalPath(id, dto); }
  @Post('critical-path/:id/tasks') addCPTask(@Param('id') cpId: string, @Body() dto: any) { return this.svc.addCriticalPathTask(cpId, dto); }
  @Put('critical-path/:id/tasks/:taskId') updateCPTask(@Param('id') cpId: string, @Param('taskId') tId: string, @Body() dto: any) { return this.svc.updateCriticalPathTask(cpId, tId, dto); }
  @Patch('critical-path/:id/tasks/:taskId/status') updateCPTaskStatus(@Param('id') cpId: string, @Param('taskId') tId: string, @Body('status') status: string) { return this.svc.updateCriticalPathTaskStatus(cpId, tId, status); }
  @Delete('critical-path/:id/tasks/:taskId') deleteCPTask(@Param('id') cpId: string, @Param('taskId') tId: string) { return this.svc.deleteCriticalPathTask(cpId, tId); }

  // Documents
  @Get('documents') listDocuments(@CurrentUser() u: any, @Query() q: any) { return this.svc.listDocuments(u.branchId, q); }
  @Post('documents') createDocumentDirect(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDocument(dto, u.branchId, u.id); }
  @Post('documents/upload') createDocument(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDocument(dto, u.branchId, u.id); }
  @Get('documents/:id') getDocument(@Param('id') id: string) { return this.svc.getDocument(id); }
  @Delete('documents/:id') deleteDocument(@Param('id') id: string) { return this.svc.deleteDocument(id); }
  @Post('documents/:id/new-version') newDocumentVersion(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.createDocumentVersion(id, dto, u.id); }
  @Get('documents/:id/versions') getDocumentVersions(@Param('id') id: string) { return this.svc.getDocumentVersions(id); }

  // Reports
  @Get('reports/delayed-tasks') @ApiOperation({ summary: 'Delayed tasks report' }) delayedTasks(@CurrentUser() u: any, @Query() q: any) { return this.reports.delayedTasksReport(u.branchId, q); }
  @Get('reports/daily-tasks') @ApiOperation({ summary: 'Daily tasks report' }) dailyTasks(@CurrentUser() u: any, @Query() q: any) { return this.reports.dailyTasksReport(u.branchId, q); }
  @Get('reports/cancelled-tasks') cancelledTasks(@CurrentUser() u: any, @Query() q: any) { return this.reports.cancelledTasksReport(u.branchId, q); }
  @Get('reports/sample-cost') sampleCost(@CurrentUser() u: any, @Query() q: any) { return this.reports.sampleCostReport(u.branchId, q); }
  @Get('reports/sample-history') sampleHistory(@CurrentUser() u: any, @Query() q: any) { return this.reports.sampleHistoryReport(u.branchId, q); }
  @Get('reports/analyse-cubes') analyseCubes(@CurrentUser() u: any, @Query() q: any) { return this.reports.analyseCubesReport(u.branchId, q); }
}
