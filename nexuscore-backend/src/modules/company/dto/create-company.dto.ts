import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// A blank optional field is "not given", never an invalid empty value.
const trimOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};

// Register a new company (POST /companies, platform owner only — see CompaniesController). Only
// these fields are accepted (the global ValidationPipe rejects anything else), so a client can
// never set an id, isPlatformOwner, plan or subscription fields.
export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Apparel' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Company Name is required' })
  @MaxLength(120)
  name!: string;

  // The company's URL segment (`/acme-apparel/...`): lowercase letters, digits and single hyphens.
  @ApiProperty({ example: 'acme-apparel' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Company URL is required' })
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Company URL may only contain lowercase letters, numbers and single hyphens (e.g. acme-apparel)' })
  slug!: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value))
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional()
  @Transform(trimOrUndefined)
  @IsOptional()
  @IsUrl({ require_protocol: false }, { message: 'Website must be a valid URL' })
  @MaxLength(200)
  website?: string;

  // Standard (default — the registration as before) or Demo. A Demo company is registered on a
  // Trial subscription (common/company-trial.ts); the subscription itself is never client-chosen.
  @ApiPropertyOptional({ enum: ['Standard', 'Demo'] })
  @IsOptional()
  @IsIn(['Standard', 'Demo'], { message: 'Account type must be Standard or Demo' })
  accountType?: 'Standard' | 'Demo';

  // Demo only: the last day of the trial, "YYYY-MM-DD" (the trial ends at 23:59:59.999 UTC that
  // day). Omitted -> the server default (COMPANY_TRIAL_DAYS). Validated server-side to be a real
  // date after the trial start.
  @ApiPropertyOptional({ example: '2026-11-19' })
  @Transform(trimOrUndefined)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Trial end date must be a date (YYYY-MM-DD)' })
  trialEndDate?: string;
}
