import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AllowAuthenticated, Permissions } from '../../common/decorators/permissions.decorator';
import { UserSettingsService } from './user-settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PasswordResetService } from '../auth/password-reset.service';
import { ForgotPasswordDto, ResetPasswordDto } from '../auth/dto/password-reset.dto';

@ApiTags('User Settings')
@Controller('settings')
export class UserSettingsController {
  constructor(
    private readonly svc: UserSettingsService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current user settings' })
  getSettings(@CurrentUser() u: any) { return this.svc.getSettings(u.id); }

  @Get('notifications')
  getNotificationPrefs(@CurrentUser() u: any) { return this.svc.getNotificationPreferences(u.id); }

  // Another user's settings: administrative read.
  @Permissions({ module: 'users', action: 'read' })
  @Get(':userId')
  @ApiOperation({ summary: 'Get settings by user ID' })
  getSettingsById(@Param('userId') userId: string) { return this.svc.getSettings(userId); }

  @AllowAuthenticated()
  @Patch()
  @ApiOperation({ summary: 'Update the current user\'s own settings' })
  updateSettings(@Body() dto: any, @CurrentUser() u: any) { return this.svc.updateSettings(u.id, dto); }

  @AllowAuthenticated()
  @Patch('profile')
  @ApiOperation({ summary: 'Update the current user\'s own profile' })
  updateProfile(@Body() dto: any, @CurrentUser() u: any) { return this.svc.updateProfile(u.id, dto); }

  // Older aliases of POST /auth/forgot-password and /auth/reset-password — same service, same
  // guarantees (token never returned, generic response, rate limited).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('password-reset/request')
  @ApiOperation({ summary: 'Request password reset (alias of /auth/forgot-password)' })
  requestReset(@Body() dto: ForgotPasswordDto) { return this.passwordReset.request(dto.email); }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('password-reset/consume')
  @ApiOperation({ summary: 'Consume password reset token (alias of /auth/reset-password)' })
  consumeReset(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.reset(dto.token, dto.newPassword);
  }
}
