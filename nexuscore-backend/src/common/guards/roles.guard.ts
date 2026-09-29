import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALLOW_PENDING_PASSWORD_CHANGE_KEY,
  resolveRequiredPermissions,
} from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Server-side RBAC on the existing Role -> RolePermission -> Permission(module, action) model.
 * What a route requires is decided by resolveRequiredPermissions() (see permissions.decorator.ts):
 * explicit @Permissions, else the controller's @PermissionModule for write methods, else the
 * Admin-only catch-all for unclassified writes. Runs after the global JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const get = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, targets);
    const req = context.switchToHttp().getRequest();
    const resolution = resolveRequiredPermissions(get, req.method);
    if (resolution.kind === 'public') return true;

    const { user } = req;
    if (!user) throw new ForbiddenException('Access denied');

    if (user.mustChangePassword && !get<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY)) {
      throw new ForbiddenException({ message: 'Password change required', errors: { code: 'PASSWORD_CHANGE_REQUIRED' } });
    }
    if (resolution.kind === 'authenticated') return true;

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const granted = new Set(
      userRoles.flatMap((ur) =>
        ur.role.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`),
      ),
    );

    const hasAll = resolution.permissions.every((p) => granted.has(`${p.module}:${p.action}`));
    if (!hasAll) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
