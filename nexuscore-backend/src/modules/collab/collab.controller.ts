import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CollabService } from './collab.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Collab')
@PermissionModule('collaboration', 'Collaboration')
@Controller('collabs')
export class CollabController {
  constructor(private readonly svc: CollabService) {}

  // Collabs
  @Get() getCollabs(@CurrentUser() u: any) { return this.svc.getCollabs(u.id, u.companyId); }
  @Get(':id') getCollab(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getCollab(id, u.companyId); }
  @Post() createCollab(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCollab(dto, u.id, u.companyId); }
  @Patch(':id') updateCollab(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateCollab(id, dto, u.companyId); }
  @Delete(':id') deleteCollab(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteCollab(id, u.companyId); }

  @Post(':id/members') addMember(@Param('id') id: string, @Body() dto: any) { return this.svc.addCollabMember(id, dto); }
  @Delete(':id/members/:userId') removeMember(@Param('id') id: string, @Param('userId') userId: string) { return this.svc.removeCollabMember(id, userId); }

  @Post(':id/invitations') createInvitation(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.createCollabInvitation(id, dto, u.id); }
  @Patch('invitations/:id') updateInvitation(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCollabInvitation(id, dto); }

  // Work Groups
  @Get('work-groups/list') getWorkGroups(@CurrentUser() u: any) { return this.svc.getWorkGroups(u.companyId, u.branchId); }
  @Get('work-groups/:id') getWorkGroup(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getWorkGroup(id, u.companyId); }
  @Post('work-groups') createWorkGroup(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createWorkGroup(dto, u.companyId, u.branchId); }
  @Patch('work-groups/:id') updateWorkGroup(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateWorkGroup(id, dto, u.companyId); }
  @Delete('work-groups/:id') deleteWorkGroup(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteWorkGroup(id, u.companyId); }
  @Post('work-groups/:id/members') addWorkGroupMember(@Param('id') id: string, @Body() dto: any) { return this.svc.addWorkGroupMember(id, dto); }
  @Delete('work-groups/:id/members/:userId') removeWorkGroupMember(@Param('id') id: string, @Param('userId') userId: string) { return this.svc.removeWorkGroupMember(id, userId); }

  // Connections
  @Get('connections') getConnections(@CurrentUser() u: any) { return this.svc.getConnections(u.id); }
  @Post('connections') sendRequest(@Body() dto: any, @CurrentUser() u: any) { return this.svc.sendConnectionRequest(u.id, dto.connectedUserId); }
  @Patch('connections/:id') updateConnection(@Param('id') id: string, @Body() dto: any) { return this.svc.updateConnection(id, dto); }
  @Delete('connections/:id') deleteConnection(@Param('id') id: string) { return this.svc.deleteConnection(id); }
}
