import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserWithRoleDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SAFE_SELECT = {
  id: true, name: true, email: true, companyId: true, branchId: true,
  hourlyRate: true, isActive: true, createdAt: true, updatedAt: true,
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  userRoles: { include: { role: true } },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A user holding a system ("Full access") role may only be edited or deleted by someone who can
   * also manage roles — otherwise users:update would be enough to take over an administrator
   * (e.g. by setting their password).
   */
  async assertCanManage(actorId: string, targetId: string) {
    if (actorId === targetId) return;
    const targetIsSystem = await this.prisma.userRole.findFirst({ where: { userId: targetId, role: { isSystem: true } }, select: { roleId: true } });
    if (!targetIsSystem) return;
    if (!(await this.canManageRoles(actorId))) throw new ForbiddenException('Only users who can manage roles may change an administrator account');
  }

  private async canManageRoles(actorId: string) {
    const grant = await this.prisma.rolePermission.findFirst({
      where: { permission: { module: 'roles', action: 'manage' }, role: { userRoles: { some: { userId: actorId } } } },
      select: { roleId: true },
    });
    return !!grant;
  }

  /**
   * Users are created inside the creator's own company, optionally in one of its branches. A role
   * in the request is granted in the same transaction — and, like POST /users/:id/assign-role,
   * only when the creator holds roles:manage — so a failed grant never leaves a role-less account.
   */
  async create(dto: CreateUserWithRoleDto, actor: { id: string; companyId: string }) {
    const { roleId, ...data } = dto;
    if (data.companyId !== actor.companyId) throw new ForbiddenException('Users can only be created in your own company');
    if (data.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: data.branchId, companyId: data.companyId }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch does not belong to this company');
    }
    if (roleId) {
      if (!(await this.canManageRoles(actor.id))) throw new ForbiddenException('Assigning a role requires the roles:manage permission');
      const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
      if (!role) throw new BadRequestException('Role not found');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { ...data, password: hash }, select: { id: true } });
      if (roleId) await tx.userRole.create({ data: { userId: created.id, roleId, assignedBy: actor.id } });
      return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: SAFE_SELECT });
    });
    return { data: user, message: 'User created' };
  }

  async findAll(companyId?: string, branchId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(branchId ? { branchId } : {}),
      },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return { data: users };
  }

  async findByBranch(branchId: string) {
    const users = await this.prisma.user.findMany({
      where: { branchId },
      select: SAFE_SELECT,
    });
    return { data: users };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return { data: user };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
    return { data: user, message: 'User updated' };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted' };
  }

  async assignRole(userId: string, roleId: string, assignedBy?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, assignedBy },
      update: { assignedBy },
    });

    return { message: `Role "${role.name}" assigned to user` };
  }

  async removeRole(userId: string, roleId: string) {
    try {
      await this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    } catch {
      throw new BadRequestException('Role not assigned to user');
    }
    return { message: 'Role removed from user' };
  }

  async getPermissions(userId: string) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const permissions = [
      ...new Set(
        userRoles.flatMap((ur) =>
          ur.role.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`),
        ),
      ),
    ];

    return { data: permissions };
  }
}
