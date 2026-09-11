import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateFabricRollDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  rollNumber: string;

  @ApiProperty()
  @IsString()
  fabricTypeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalMeters: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  availableMeters: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerMeter?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;
}
