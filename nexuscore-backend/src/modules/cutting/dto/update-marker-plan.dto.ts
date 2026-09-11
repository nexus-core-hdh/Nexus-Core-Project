import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateMarkerPlanDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  markerWidthCm: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  markerLengthCm: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  piecesPerLayer: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  noOfLayers: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  efficiencyPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
