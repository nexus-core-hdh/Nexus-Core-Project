import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@ApiTags('Branches')
@PermissionModule('company', 'Company & branches')
@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create branch' })
  create(@Body() dto: CreateBranchDto) {
    return this.branchService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List branches' })
  findAll(@Query('companyId') companyId?: string) {
    return this.branchService.findAll(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch by ID' })
  findOne(@Param('id') id: string) {
    return this.branchService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update branch' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateBranchDto>) {
    return this.branchService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete branch' })
  remove(@Param('id') id: string) {
    return this.branchService.remove(id);
  }

  @Get(':id/whatsapp-status')
  @ApiOperation({ summary: 'Get WhatsApp verification status for branch' })
  getWhatsappStatus(@Param('id') id: string) {
    return this.branchService.getWhatsappStatus(id);
  }
}
