import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Permissions({ module: 'users', action: 'create' })
  @Post()
  @ApiOperation({ summary: 'Create user' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
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

  // Editing/deleting a user who holds a system ("Full access") role additionally requires
  // roles:manage — otherwise users:update alone could reset an administrator's password.
  @Permissions({ module: 'users', action: 'update' })
  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser('id') actorId: string) {
    await this.usersService.assertCanManage(actorId, id);
    return this.usersService.update(id, dto);
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
