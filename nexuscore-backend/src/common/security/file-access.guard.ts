import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

// Scoped tokens allowed for file downloads only (JwtStrategy rejects them everywhere else).
const FILE_SCOPES = new Set(['file-view', 'attachment-view']);

function cookieValue(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Authentication for stored-file download routes, which are also loaded by plain <img>/<a>
 * elements and third-party viewers that cannot send an Authorization header. Accepts, in order:
 * the Authorization header, the frontend's own `auth_token` cookie (sent automatically to the
 * same site), or a `?token=` query value (session token or a short-lived file-view token).
 * Use together with @Public() so the global JwtAuthGuard does not reject header-less requests.
 */
@Injectable()
export class FileAccessGuard implements CanActivate {
  private readonly jwt = new JwtService();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token =
      req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      cookieValue(req, 'auth_token') ||
      (typeof req.query.token === 'string' ? req.query.token : undefined);
    if (!token) throw new UnauthorizedException('Authentication required');

    let payload: { sub?: string; scope?: string };
    try {
      // No issuer check: the existing purpose-scoped view tokens are signed without one.
      payload = this.jwt.verify(token, { secret: this.config.getOrThrow<string>('jwt.secret') });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.scope && !FILE_SCOPES.has(payload.scope)) throw new UnauthorizedException('Invalid token');
    if (!payload.sub) throw new UnauthorizedException('Invalid token');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, isActive: true, companyId: true, branchId: true } });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');
    req.user = user;
    return true;
  }
}
