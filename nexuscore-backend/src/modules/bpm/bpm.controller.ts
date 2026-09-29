import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BpmService } from './bpm.service';
import { CreateProcessDto, CreateStageDto } from './dto/create-process.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('BPM')
@PermissionModule('bpm', 'BPM')
@Controller('bpm')
export class BpmController {
  constructor(private readonly bpmService: BpmService) {}

  // Processes
  @Post('processes')
  @ApiOperation({ summary: 'Create BPM process' })
  createProcess(@Body() dto: CreateProcessDto) {
    return this.bpmService.createProcess(dto);
  }

  @Get('processes')
  @ApiOperation({ summary: 'List BPM processes' })
  findAllProcesses() {
    return this.bpmService.findAllProcesses();
  }

  @Get('processes/:id')
  @ApiOperation({ summary: 'Get BPM process' })
  findOneProcess(@Param('id') id: string) {
    return this.bpmService.findOneProcess(id);
  }

  @Patch('processes/:id')
  @ApiOperation({ summary: 'Update BPM process' })
  updateProcess(@Param('id') id: string, @Body() dto: Partial<CreateProcessDto>) {
    return this.bpmService.updateProcess(id, dto);
  }

  @Delete('processes/:id')
  @ApiOperation({ summary: 'Delete BPM process' })
  removeProcess(@Param('id') id: string) {
    return this.bpmService.removeProcess(id);
  }

  // Stages
  @Post('processes/:id/stages')
  @ApiOperation({ summary: 'Add stage to process' })
  createStage(@Param('id') processId: string, @Body() dto: CreateStageDto) {
    return this.bpmService.createStage(processId, dto);
  }

  @Patch('processes/:id/stages/:stageId')
  @ApiOperation({ summary: 'Update stage' })
  updateStage(@Param('id') pId: string, @Param('stageId') sId: string, @Body() dto: Partial<CreateStageDto>) {
    return this.bpmService.updateStage(pId, sId, dto);
  }

  @Delete('processes/:id/stages/:stageId')
  @ApiOperation({ summary: 'Delete stage' })
  removeStage(@Param('id') pId: string, @Param('stageId') sId: string) {
    return this.bpmService.removeStage(pId, sId);
  }

  // Tasks
  @Get('tasks')
  @ApiOperation({ summary: 'Task Queue — list tasks with filters' })
  findAllTasks(@Query() query: QueryTasksDto) {
    return this.bpmService.findAllTasks(query);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Manually create a BPM task' })
  createTask(@Body() body: any, @CurrentUser('id') actorId: string) {
    return this.bpmService.createTask({ ...body, createdBy: actorId });
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get task by ID with history' })
  findOneTask(@Param('id') id: string) {
    return this.bpmService.findOneTask(id);
  }

  @Patch('tasks/:id/move-stage')
  @ApiOperation({ summary: 'Move task to a new stage' })
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentUser('id') actorId: string) {
    return this.bpmService.moveStage(id, dto, actorId);
  }

  @Get('tasks/:id/history')
  @ApiOperation({ summary: 'Get task stage history' })
  getTaskHistory(@Param('id') id: string) {
    return this.bpmService.getTaskHistory(id);
  }

  @Post('tasks/:id/assign')
  @ApiOperation({ summary: 'Assign task to user' })
  assignTask(@Param('id') id: string, @Body('assignedTo') assignedTo: string) {
    return this.bpmService.assignTask(id, assignedTo);
  }

  // Request Types
  @Get('request-types')
  @ApiOperation({ summary: 'List BPM request types' })
  findAllRequestTypes(@Query('companyId') companyId?: string, @Query('branchId') branchId?: string) {
    return this.bpmService.findAllRequestTypes(companyId, branchId);
  }

  @Post('request-types')
  @ApiOperation({ summary: 'Create BPM request type' })
  createRequestType(@Body() body: any) {
    return this.bpmService.createRequestType(body);
  }

  @Patch('request-types/:id')
  @ApiOperation({ summary: 'Update BPM request type' })
  updateRequestType(@Param('id') id: string, @Body() body: any) {
    return this.bpmService.updateRequestType(id, body);
  }

  @Delete('request-types/:id')
  @ApiOperation({ summary: 'Delete BPM request type' })
  removeRequestType(@Param('id') id: string) {
    return this.bpmService.removeRequestType(id);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default BPM processes' })
  seed() {
    return this.bpmService.seedProcesses();
  }
}
