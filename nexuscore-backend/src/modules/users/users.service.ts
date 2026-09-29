import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
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
    const actorCanManageRoles = await this.prisma.rolePermission.findFirst({
      where: { permission: { module: 'roles', action: 'manage' }, role: { userRoles: { some: { userId: actorId } } } },
      select: { roleId: true },
    });
    if (!actorCanManageRoles) throw new ForbiddenException('Only users who can manage roles may change an administrator account');
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { ...dto, password: hash },
      select: SAFE_SELECT,
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
