import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Lengths/ranges are GL_Account's real column domains (pg_catalog): AccountCode UdtCode varchar(25),
// AccountName UdtName varchar(250), Explanation UdtExpLong varchar(100), SpecialCode/AccessCode
// UdtSpecial varchar(15), AccountType/CDType UdtType smallint. AccountType/CDType have no documented
// value meanings anywhere in the migrated schema or code, so they are accepted as plain numbers.
const SMALLINT_MIN = -32768;
const SMALLINT_MAX = 32767;

export class CreateGlAccountDto {
  @IsString() @MaxLength(25) accountCode!: string;
  @IsString() @MaxLength(250) accountName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) explanation?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(SMALLINT_MIN) @Max(SMALLINT_MAX) accountType?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(SMALLINT_MIN) @Max(SMALLINT_MAX) cdType?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(15) specialCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(15) accessCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inUse?: boolean;
}

export class UpdateGlAccountDto extends PartialType(CreateGlAccountDto) {}
