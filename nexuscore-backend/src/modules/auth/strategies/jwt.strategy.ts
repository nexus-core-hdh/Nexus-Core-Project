import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // No fallback: jwt.config.ts guarantees a real secret (and fails startup in production without one).
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      issuer: configService.get<string>('jwt.issuer', 'nexuscore'),
    });
  }

  async validate(payload: JwtPayload & { scope?: string }) {
    // Purpose-scoped tokens (e.g. the 5-minute 'attachment-view' / 'file-view' tokens handed to
    // file viewers) are signed with the same secret but must never work as a session token.
    if (payload.scope) throw new UnauthorizedException('Invalid token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { company: true, branch: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }
}
