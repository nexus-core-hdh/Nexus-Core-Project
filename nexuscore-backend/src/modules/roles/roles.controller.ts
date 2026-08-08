import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-permissions.dto';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create role' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID with permissions' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update role' })
  update(@Param('id') id: string, @Body() dto: CreateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Get permissions assigned to a role' })
  getRolePermissions(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: 'Bulk update role permissions (toggle)' })
  updatePermissions(@Param('id') id: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.rolesService.updatePermissions(id, dto);
  }
}

// Stand-alone /permission-settings controller (registered in RolesModule)
@ApiTags('Permission Settings')
@Controller('permission-settings')
export class PermissionSettingsController {
  // Returns { hasPermission: true } for all authenticated users.
  // Fine-grained ACL can be layered on later without a frontend change.
  @Get('check')
  checkResourcePermission(@Query('resourcePath') _resourcePath: string) {
    return { hasPermission: true };
  }

  // Same no-op logic as `check`, batched: callers that need to check many
  // resource paths at once (e.g. building a permission-filtered screen index
  // across the whole menu) can do it in one request instead of one per path —
  // avoids tripping the global rate limiter on what would otherwise be dozens
  // of individual round trips for what is, today, always the same answer.
  @Post('check-batch')
  checkResourcePermissionsBatch(@Body('resourcePaths') resourcePaths: string[]) {
    const result: Record<string, boolean> = {};
    for (const path of resourcePaths ?? []) {
      result[path] = true;
    }
    return { permissions: result };
  }

  @Get('matrix')
  getMatrix() { return []; }

  @Post('upsert')
  upsert(@Body() _dto: any) { return { success: true }; }

  @Get()
  list() { return []; }

  @Get('hierarchical')
  hierarchical() { return []; }

  @Post('hierarchical/upsert')
  upsertHierarchical(@Body() _dto: any) { return { success: true }; }
}

// Stand-alone /permissions controller (registered in RolesModule)
@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all available permissions (module:action catalog)' })
  getAll() {
    return this.rolesService.getAllPermissions();
  }
}
