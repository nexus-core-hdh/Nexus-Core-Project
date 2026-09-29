import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Company')
@PermissionModule('company', 'Company & branches')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @ApiOperation({ summary: 'Get current company' })
  getCompany(@CurrentUser('companyId') companyId: string) {
    return this.companyService.getCompany(companyId);
  }

  @Put()
  @ApiOperation({ summary: 'Update company' })
  updateCompany(@CurrentUser('companyId') companyId: string, @Body() dto: UpdateCompanyDto) {
    return this.companyService.updateCompany(companyId, dto);
  }

  @Post('meta-config')
  @ApiOperation({ summary: 'Set WhatsApp Meta app config' })
  metaConfig(
    @CurrentUser('companyId') companyId: string,
    @Body() body: { metaAppId: string; metaAppSecret: string },
  ) {
    return this.companyService.updateMetaConfig(companyId, body.metaAppId, body.metaAppSecret);
  }
}
