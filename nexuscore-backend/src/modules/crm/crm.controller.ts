import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('CRM')
@PermissionModule('crm', 'CRM')
@Controller('crm')
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get('notes')
  @ApiOperation({ summary: 'Get notes' })
  getNotes(@CurrentUser() u: any, @Query('type') type?: string) {
    const filters = type ? { type } : {};
    return this.svc.getNotes(u.id, filters);
  }

  @Get('notes/:id')
  getNote(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getNote(id, u.id);
  }

  @Post('notes')
  @ApiOperation({ summary: 'Create note' })
  createNote(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createNote(dto, u.id);
  }

  @Patch('notes/:id')
  updateNote(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.updateNote(id, dto, u.id);
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteNote(id, u.id);
  }

  // Note Labels
  @Get('note-labels')
  getNoteLabels(@CurrentUser() u: any) { return this.svc.getNoteLabels(u.id); }

  @Post('note-labels')
  createNoteLabel(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createNoteLabel(dto, u.id); }

  @Patch('note-labels/:id')
  updateNoteLabel(@Param('id') id: string, @Body() dto: any) { return this.svc.updateNoteLabel(id, dto); }

  @Delete('note-labels/:id')
  deleteNoteLabel(@Param('id') id: string) { return this.svc.deleteNoteLabel(id); }

  // Note Checklists
  @Post('notes/:noteId/checklists')
  createNoteChecklist(@Param('noteId') noteId: string, @Body() dto: any) { return this.svc.createNoteChecklist(dto, noteId); }

  @Patch('note-checklists/:id')
  updateNoteChecklist(@Param('id') id: string, @Body() dto: any) { return this.svc.updateNoteChecklist(id, dto); }

  @Delete('note-checklists/:id')
  deleteNoteChecklist(@Param('id') id: string) { return this.svc.deleteNoteChecklist(id); }

  // ── Todos ──────────────────────────────────────────────────────────────────

  @Get('todos')
  @ApiOperation({ summary: 'Get todos' })
  getTodos(@CurrentUser() u: any, @Query('status') status?: string, @Query('priority') priority?: string) {
    const filters: any = {};
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    return this.svc.getTodos(u.id, filters);
  }

  @Get('todos/:id')
  getTodo(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getTodo(id, u.id);
  }

  @Post('todos')
  @ApiOperation({ summary: 'Create todo' })
  createTodo(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createTodo(dto, u.id);
  }

  @Patch('todos/:id')
  updateTodo(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.updateTodo(id, dto, u.id);
  }

  @Delete('todos/:id')
  deleteTodo(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteTodo(id, u.id);
  }

  @Post('todos/:todoId/subtasks')
  createSubtask(@Param('todoId') todoId: string, @Body() dto: any) { return this.svc.createTodoSubtask(todoId, dto); }

  @Patch('todo-subtasks/:id')
  updateSubtask(@Param('id') id: string, @Body() dto: any) { return this.svc.updateTodoSubtask(id, dto); }

  @Delete('todo-subtasks/:id')
  deleteSubtask(@Param('id') id: string) { return this.svc.deleteTodoSubtask(id); }

  @Post('todos/:todoId/comments')
  createTodoComment(@Param('todoId') todoId: string, @Body() dto: any) {
    return this.svc.createTodoComment(todoId, dto);
  }

  @Delete('todo-comments/:id')
  deleteTodoComment(@Param('id') id: string) { return this.svc.deleteTodoComment(id); }

  // ── Activities ─────────────────────────────────────────────────────────────

  @Get('activities')
  @ApiOperation({ summary: 'Get activities' })
  getActivities(@CurrentUser() u: any, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    const filters: any = {};
    if (entityType) filters.entityType = entityType;
    if (entityId) filters.entityId = entityId;
    return this.svc.getActivities(u.companyId, u.branchId, filters);
  }

  @Post('activities')
  createActivity(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createActivity(dto, u.id, u.companyId, u.branchId);
  }

  @Delete('activities/:id')
  deleteActivity(@Param('id') id: string) { return this.svc.deleteActivity(id); }

  // ── Comments ───────────────────────────────────────────────────────────────

  @Get('comments')
  getComments(@CurrentUser() u: any, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    const filters: any = {};
    if (entityType) filters.entityType = entityType;
    if (entityId) filters.entityId = entityId;
    return this.svc.getComments(u.companyId, filters);
  }

  @Post('comments')
  createComment(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createComment(dto, u.id, u.companyId);
  }

  @Patch('comments/:id')
  updateComment(@Param('id') id: string, @Body() dto: any) { return this.svc.updateComment(id, dto); }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string) { return this.svc.deleteComment(id); }

  // ── Calendar Events ────────────────────────────────────────────────────────

  @Get('calendar-events')
  getCalendarEvents(@CurrentUser() u: any) {
    return this.svc.getCalendarEvents(u.companyId, u.branchId);
  }

  @Get('calendar-events/:id')
  getCalendarEvent(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getCalendarEvent(id, u.companyId);
  }

  @Post('calendar-events')
  createCalendarEvent(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createCalendarEvent(dto, u.id, u.companyId, u.branchId);
  }

  @Patch('calendar-events/:id')
  updateCalendarEvent(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.updateCalendarEvent(id, dto, u.companyId);
  }

  @Delete('calendar-events/:id')
  deleteCalendarEvent(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteCalendarEvent(id, u.companyId);
  }

  // ── Reminders ──────────────────────────────────────────────────────────────

  @Get('reminders')
  getReminders(@CurrentUser() u: any) { return this.svc.getReminders(u.id, u.companyId); }

  @Post('reminders')
  createReminder(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createReminder(dto, u.id, u.companyId);
  }

  @Patch('reminders/:id')
  updateReminder(@Param('id') id: string, @Body() dto: any) { return this.svc.updateReminder(id, dto); }

  @Delete('reminders/:id')
  deleteReminder(@Param('id') id: string) { return this.svc.deleteReminder(id); }
}
