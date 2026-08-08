import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() workplaceId?: number;
  @IsString() warehouseCode!: string;
  @IsString() warehouseName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accessCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specialCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() controlType?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() mControlType?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefaultMain?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefaultShipment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVirtual?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isWarehouseDeclaration?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isShowRoom?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isSwatchCard?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inUse?: boolean;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
