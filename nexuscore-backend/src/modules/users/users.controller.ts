import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService, type UserActor } from './users.service';
import { CreateUserWithRoleDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { SetUserPasswordDto } from './dto/set-password.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Permissions({ module: 'users', action: 'create' })
  @Post()
  @ApiOperation({ summary: 'Create user' })
  create(@Body() dto: CreateUserWithRoleDto, @CurrentUser() actor: { id: string; companyId: string }) {
    return this.usersService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  findAll(@Query('companyId') companyId?: string, @Query('branchId') branchId?: string) {
    return this.usersService.findAll(companyId, branchId);
  }

  @Get('by-branch/:branchId')
  @ApiOperation({ summary: 'Get users by branch' })
  findByBranch(@Param('branchId') branchId: string) {
    return this.usersService.findByBranch(branchId);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile with roles and permissions' })
  getProfile(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // Editing a user / resetting their password: users:update, and the service's assertCanModify —
  // same company as the signed-in user (from the server-side session, not the request), and no
  // account with more permissions than the actor unless the actor holds roles:manage.
  @Permissions({ module: 'users', action: 'update' })
  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: UserActor) {
    return this.usersService.update(actor, id, dto);
  }

  // Users screen "Reset Password" — same permission and rules as editing the user.
  @Permissions({ module: 'users', action: 'update' })
  @Post('set-password/:id')
  @ApiOperation({ summary: 'Reset a user password (typed or generated temporary); user must change it at next login' })
  setPassword(@Param('id') id: string, @Body() dto: SetUserPasswordDto, @CurrentUser() actor: UserActor) {
    return this.usersService.setPassword(actor, id, dto);
  }

  @Permissions({ module: 'users', action: 'delete' })
  @Delete(':id')
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    await this.usersService.assertCanManage(actorId, id);
    return this.usersService.remove(id);
  }

  // Granting/removing roles changes privileges, so it needs roles:manage (not just users:update).
  @Permissions({ module: 'roles', action: 'manage' })
  @Post(':id/assign-role')
  @ApiOperation({ summary: 'Assign role to user' })
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.assignRole(id, dto.roleId, actorId);
  }

  @Permissions({ module: 'roles', action: 'manage' })
  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Remove role from user' })
  removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.usersService.removeRole(id, roleId);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Get effective permissions for user' })
  getPermissions(@Param('id') id: string) {
    return this.usersService.getPermissions(id);
  }
}
