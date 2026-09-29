import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FabricService } from './fabric.service';
import { CreateFabricTypeDto } from './dto/create-fabric-type.dto';
import { CreateFabricRollDto } from './dto/create-fabric-roll.dto';

@ApiTags('Fabric')
@PermissionModule('fabric', 'Fabric inventory')
@Controller()
export class FabricController {
  constructor(private readonly fabricService: FabricService) {}

  // Fabric Types
  @Post('fabric-types')
  @ApiOperation({ summary: 'Create fabric type' })
  createType(@Body() dto: CreateFabricTypeDto) {
    return this.fabricService.createType(dto);
  }

  @Get('fabric-types')
  @ApiOperation({ summary: 'List fabric types' })
  findAllTypes() {
    return this.fabricService.findAllTypes();
  }

  @Get('fabric-types/:id')
  @ApiOperation({ summary: 'Get fabric type by ID' })
  findOneType(@Param('id') id: string) {
    return this.fabricService.findOneType(id);
  }

  @Patch('fabric-types/:id')
  @ApiOperation({ summary: 'Update fabric type' })
  updateType(@Param('id') id: string, @Body() dto: Partial<CreateFabricTypeDto>) {
    return this.fabricService.updateType(id, dto);
  }

  @Delete('fabric-types/:id')
  @ApiOperation({ summary: 'Delete fabric type' })
  removeType(@Param('id') id: string) {
    return this.fabricService.removeType(id);
  }

  // Fabric Rolls
  @Post('fabric-rolls')
  @ApiOperation({ summary: 'Create fabric roll' })
  createRoll(@Body() dto: CreateFabricRollDto) {
    return this.fabricService.createRoll(dto);
  }

  @Get('fabric-rolls')
  @ApiOperation({ summary: 'List fabric rolls' })
  findAllRolls(
    @Query('fabricTypeId') fabricTypeId?: string,
    @Query('status') status?: string,
  ) {
    return this.fabricService.findAllRolls(fabricTypeId, status);
  }

  @Get('fabric-rolls/available')
  @ApiOperation({ summary: 'List available fabric rolls' })
  findAvailableRolls() {
    return this.fabricService.findAvailableRolls();
  }

  @Get('fabric-rolls/:id')
  @ApiOperation({ summary: 'Get fabric roll by ID' })
  findOneRoll(@Param('id') id: string) {
    return this.fabricService.findOneRoll(id);
  }

  @Patch('fabric-rolls/:id')
  @ApiOperation({ summary: 'Update fabric roll' })
  updateRoll(@Param('id') id: string, @Body() dto: Partial<CreateFabricRollDto>) {
    return this.fabricService.updateRoll(id, dto);
  }

  @Delete('fabric-rolls/:id')
  @ApiOperation({ summary: 'Delete fabric roll' })
  removeRoll(@Param('id') id: string) {
    return this.fabricService.removeRoll(id);
  }

  @Get('fabric-rolls/:id/qr')
  @ApiOperation({ summary: 'Get QR code for fabric roll' })
  getRollQr(@Param('id') id: string) {
    return this.fabricService.getRollQr(id);
  }

  @Post('fabric-rolls/:id/consume')
  @ApiOperation({ summary: 'Record fabric consumption from roll' })
  consumeRoll(@Param('id') id: string, @Body('metersConsumed') metersConsumed: number) {
    return this.fabricService.consumeRoll(id, metersConsumed);
  }
}
