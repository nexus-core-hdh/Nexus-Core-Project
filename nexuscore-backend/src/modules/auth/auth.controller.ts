import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AllowAuthenticated, AllowDuringPasswordChange } from '../../common/decorators/permissions.decorator';

const MINUTE = 60_000;

// Unauthenticated endpoints get strict per-client-IP limits (AppThrottlerGuard keys anonymous
// requests by IP; main.ts makes that the real client IP behind a reverse proxy).
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email + password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Email a password reset link (response never reveals whether the account exists)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.request(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using the token from the emailed link' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.reset(dto.token, dto.newPassword);
  }

  @AllowAuthenticated()
  @AllowDuringPasswordChange()
  @Post('logout')
  @ApiOperation({ summary: 'Logout (client-side token discard)' })
  logout() {
    return { message: 'Logged out' };
  }

  @AllowAuthenticated()
  @AllowDuringPasswordChange()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('change-password')
  @ApiOperation({ summary: 'Change password for the authenticated user' })
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: any) {
    return this.authService.changePassword(user.id, dto.newPassword);
  }

  @AllowDuringPasswordChange()
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }
}
