import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserWithRoleDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetUserPasswordDto } from './dto/set-password.dto';

/** 14 characters with an upper, a lower, a digit and a symbol (crypto-random; no look-alikes). */
function generateTemporaryPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const chars = [...sets.map((s) => s[randomInt(s.length)])];
  while (chars.length < 14) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const SAFE_SELECT = {
  id: true, name: true, email: true, companyId: true, branchId: true,
  hourlyRate: true, isActive: true, createdAt: true, updatedAt: true,
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  userRoles: { include: { role: true } },
};

/** The signed-in user as the JWT strategy loads it from the database (request.user) — never client input. */
export interface UserActor {
  id: string;
  companyId: string;
}

/** How a password was changed, recorded in the audit log (never the password itself). */
type PasswordResetMethod = 'typed' | 'generated' | 'user-update';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Who may change (edit, or reset the password of) another user account:
   *  1. Same company only — the actor's company comes from the server-side session (request.user),
   *     never from the request body. A user of another company answers "User not found", so the
   *     endpoint can't be used to probe which ids exist elsewhere. There is no cross-company /
   *     super-admin role in this application to preserve.
   *  2. Oneself — always (the existing self-service rule).
   *  3. Holders of roles:manage — any account in their company (they can already grant any role,
   *     so this adds no power; it keeps the existing "only role managers may change an
   *     administrator" workflow).
   *  4. Everyone else (users:update without roles:manage) — only accounts that hold no system
   *     ("Full access") role and whose effective permissions are a subset of the actor's own, so
   *     users:update alone can never be used to take over a more privileged account.
   * Returns the target's company id.
   */
  async assertCanModify(actor: UserActor, targetId: string): Promise<{ companyId: string }> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, companyId: true } });
    if (!target || target.companyId !== actor.companyId) throw new NotFoundException('User not found');
    if (actor.id === target.id) return target;
    if (await this.canManageRoles(actor.id)) return target;
    const targetIsSystem = await this.prisma.userRole.findFirst({ where: { userId: targetId, role: { isSystem: true } }, select: { roleId: true } });
    if (targetIsSystem) throw new ForbiddenException('Only users who can manage roles may change an administrator account');
    const [actorPerms, targetPerms] = await Promise.all([this.effectivePermissions(actor.id), this.effectivePermissions(targetId)]);
    const beyond = [...targetPerms].filter((p) => !actorPerms.has(p));
    if (beyond.length) throw new ForbiddenException('You cannot change an account that has permissions you do not have');
    return target;
  }

  private async effectivePermissions(userId: string): Promise<Set<string>> {
    const grants = await this.prisma.rolePermission.findMany({
      where: { role: { userRoles: { some: { userId } } } },
      select: { permission: { select: { module: true, action: true } } },
    });
    return new Set(grants.map((g) => `${g.permission.module}:${g.permission.action}`));
  }

  private recordPasswordReset(tx: Prisma.TransactionClient, actor: UserActor, targetId: string, method: PasswordResetMethod) {
    // Who, whom, when (AuditLog.createdAt) and how — never the password, its hash or a temporary value.
    return this.audit.record({
      userId: actor.id,
      companyId: actor.companyId,
      entityType: 'User',
      entityId: targetId,
      action: 'password_reset',
      after: { method },
    }, tx);
  }

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

  /** PATCH /users/:id — only an account the actor may change (assertCanModify), kept in its own company. */
  async update(actor: UserActor, id: string, dto: UpdateUserDto) {
    const target = await this.assertCanModify(actor, id);
    if (dto.companyId !== undefined && dto.companyId !== target.companyId) {
      throw new ForbiddenException('A user cannot be moved to another company');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: target.companyId }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch does not belong to this company');
    }
    const data: any = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data, select: SAFE_SELECT });
      if (dto.password) await this.recordPasswordReset(tx, actor, id, 'user-update');
      return updated;
    });
    return { data: user, message: 'User updated' };
  }

  /**
   * Admin password reset: the typed password, or a generated temporary one (returned once, never
   * stored in clear). Either way the user must change it at next login (mustChangePassword), and
   * any outstanding emailed reset links stop working. Only for an account the actor may change
   * (assertCanModify); audited together with the change.
   */
  async setPassword(actor: UserActor, id: string, dto: SetUserPasswordDto) {
    await this.assertCanModify(actor, id);
    const temporaryPassword = dto.generateTemporary ? generateTemporaryPassword() : null;
    const password = temporaryPassword ?? dto.password;
    if (!password) throw new BadRequestException('Enter a new password or choose Generate Temporary Password');
    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { password: hashed, mustChangePassword: true } });
      await tx.passwordResetToken.updateMany({ where: { userId: id, used: false }, data: { used: true } });
      await this.recordPasswordReset(tx, actor, id, temporaryPassword ? 'generated' : 'typed');
    });
    return temporaryPassword
      ? { message: 'Password reset', temporaryPassword }
      : { message: 'Password reset' };
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
