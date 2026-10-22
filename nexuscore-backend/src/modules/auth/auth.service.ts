import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { assertTrialNotExpired } from '../../common/company-trial';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('[NexusCore] AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { company: true, branch: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    // After the password check, so an expired trial is never revealed for a wrong password.
    assertTrialNotExpired(user.company);

    const tokens = await this.generateTokens(user);

    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { company: true, branch: true },
      });

      if (!user || !user.isActive) throw new UnauthorizedException();
      assertTrialNotExpired(user.company);

      return this.generateTokens(user);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e; // TRIAL_EXPIRED stays a 403, not "invalid token"
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        branch: true,
        userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    if (!user) throw new UnauthorizedException();

    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  async changePassword(userId: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });
    return { message: 'Password changed successfully' };
  }

  private async generateTokens(user: { id: string; email: string; companyId: string; branchId?: string | null }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      branchId: user.branchId ?? undefined,
      // iss is set by JwtModule issuer option — do not duplicate here
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn', '7d'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn', '30d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
