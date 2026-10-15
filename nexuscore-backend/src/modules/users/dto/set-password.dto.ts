import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MIN_PASSWORD_LENGTH } from '../../auth/password-reset.service';

// Admin "Reset Password" (Users screen): either a password the admin typed, or
// generateTemporary = true for a server-generated one returned once in the response.
export class SetUserPasswordDto {
  @ApiPropertyOptional({ example: 'newSecurePassword123' })
  @IsOptional()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(200)
  password?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  generateTemporary?: boolean;
}
