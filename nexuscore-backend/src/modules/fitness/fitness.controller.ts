import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FitnessService } from './fitness.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Fitness')
@PermissionModule('fitness', 'Fitness')
@Controller('fitness')
export class FitnessController {
  constructor(private readonly svc: FitnessService) {}

  @Get('activities')
  @ApiOperation({ summary: 'Get fitness activities' })
  getActivities(@CurrentUser() u: any, @Query('type') type?: string) {
    return this.svc.getActivities(u.id, u.companyId, type ? { activityType: type } : {});
  }

  @Post('activities')
  createActivity(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createActivity(dto, u.id, u.companyId); }

  @Patch('activities/:id')
  updateActivity(@Param('id') id: string, @Body() dto: any) { return this.svc.updateActivity(id, dto); }

  @Delete('activities/:id')
  deleteActivity(@Param('id') id: string) { return this.svc.deleteActivity(id); }

  @Get('nutrition')
  getNutrition(@CurrentUser() u: any, @Query('date') date?: string) {
    return this.svc.getNutritionEntries(u.id, u.companyId, date);
  }

  @Post('nutrition')
  createNutrition(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createNutritionEntry(dto, u.id, u.companyId); }

  @Patch('nutrition/:id')
  updateNutrition(@Param('id') id: string, @Body() dto: any) { return this.svc.updateNutritionEntry(id, dto); }

  @Delete('nutrition/:id')
  deleteNutrition(@Param('id') id: string) { return this.svc.deleteNutritionEntry(id); }

  @Get('sleep')
  getSleep(@CurrentUser() u: any) { return this.svc.getSleepRecords(u.id, u.companyId); }

  @Post('sleep')
  createSleep(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSleepRecord(dto, u.id, u.companyId); }

  @Patch('sleep/:id')
  updateSleep(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSleepRecord(id, dto); }

  @Delete('sleep/:id')
  deleteSleep(@Param('id') id: string) { return this.svc.deleteSleepRecord(id); }
}
