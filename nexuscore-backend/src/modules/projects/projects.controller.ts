import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Projects')
@PermissionModule('collaboration', 'Collaboration')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Get projects' })
  getProjects(@CurrentUser() u: any) { return this.svc.getProjects(u.companyId, u.branchId); }

  @Get(':id')
  getProject(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getProject(id, u.companyId); }

  @Post()
  @ApiOperation({ summary: 'Create project' })
  createProject(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createProject(dto, u.companyId, u.branchId); }

  @Patch(':id')
  updateProject(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateProject(id, dto, u.companyId); }

  @Delete(':id')
  deleteProject(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteProject(id, u.companyId); }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() dto: any) { return this.svc.addProjectMember(id, dto.userId, dto.role); }

  @Patch(':id/members/:userId')
  updateMember(@Param('id') id: string, @Param('userId') userId: string, @Body() dto: any) {
    return this.svc.updateProjectMember(id, userId, dto);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.removeProjectMember(id, userId);
  }
}
