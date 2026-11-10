import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlAccountService } from './gl-account.service';
import { CreateGlAccountDto, UpdateGlAccountDto } from './dto/gl-account.dto';

// Chart of Accounts (GL_Account). Same 'master-data' permission module as the Master Lookup API,
// which is the other existing path that reads GL_Account (the 'gl-account' picker key), so one
// permission governs the table (DELETE -> master-data:delete).
@ApiTags('Legacy ERP - Chart of Accounts')
@PermissionModule('master-data', 'Master data')
@Controller('legacy-erp/gl-accounts')
export class GlAccountController {
  constructor(private readonly svc: GlAccountService) {}

  @Get() list(@Query('search') search?: string) {
    return this.svc.list(search);
  }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() create(@Body() dto: CreateGlAccountDto, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, Number(userId) || 1);
  }

  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGlAccountDto, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, Number(userId) || 1);
  }

  // Soft delete, refused (409) while any live record references the account.
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
    return this.svc.remove(id, Number(userId) || 1, userId, companyId);
  }
}
