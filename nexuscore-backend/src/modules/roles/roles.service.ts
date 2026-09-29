import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-permissions.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const exists = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Role name already exists');

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissionIds
          ? { create: dto.permissionIds.map((id) => ({ permissionId: id })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });
    return { data: role, message: 'Role created' };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: roles };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return { data: role };
  }

  async update(id: string, dto: Partial<CreateRoleDto>) {
    await this.findOne(id);
    const role = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
      include: { permissions: { include: { permission: true } } },
    });
    return { data: role, message: 'Role updated' };
  }

  async remove(id: string) {
    const { data: role } = await this.findOne(id);
    if (role.isSystem) throw new ConflictException('Cannot delete system role');
    await this.prisma.role.delete({ where: { id } });
    return { message: 'Role deleted' };
  }

  async updatePermissions(id: string, dto: UpdateRolePermissionsDto) {
    await this.findOne(id);
    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    if (dto.permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      });
    }
    return this.findOne(id);
  }

  async getAllPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return { data: permissions };
  }

  /**
   * Upserts Permission catalog rows. With grantToSystemRoles, also grants them to the system
   * ("Full access") role(s) — the same invariant prisma/seed.ts keeps for Admin — adding only what
   * is missing and never touching any other role's grants.
   */
  async seedPermissions(
    permissions: Array<{ module: string; action: string; description?: string }>,
    opts: { grantToSystemRoles?: boolean } = {},
  ) {
    const ids: string[] = [];
    for (const p of permissions) {
      const row = await this.prisma.permission.upsert({
        where: { module_action: { module: p.module, action: p.action } },
        create: p,
        update: { description: p.description },
        select: { id: true },
      });
      ids.push(row.id);
    }
    if (opts.grantToSystemRoles && ids.length) {
      const systemRoles = await this.prisma.role.findMany({ where: { isSystem: true }, select: { id: true } });
      for (const role of systemRoles) {
        await this.prisma.rolePermission.createMany({
          data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
    }
  }
}
