import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Documents')
@PermissionModule('collaboration', 'Collaboration')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents (optionally filtered by type)' })
  findAll(@CurrentUser() u: any, @Query('type') type?: string) {
    return this.svc.findAll(u.companyId, u.branchId, type);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Post('word')
  createWord(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createWord(dto, u.id, u.companyId, u.branchId);
  }

  @Post('excel')
  createExcel(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createExcel(dto, u.id, u.companyId, u.branchId);
  }

  @Post('powerpoint')
  createPowerPoint(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createPowerPoint(dto, u.id, u.companyId, u.branchId);
  }

  @Post('board')
  createBoard(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createBoard(dto, u.id, u.companyId, u.branchId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.update(id, dto, u.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
