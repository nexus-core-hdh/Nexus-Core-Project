import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAuthenticated, Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyProvisioningService, PROVISIONING_PERMISSIONS } from './company-provisioning.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyFirstAdminService } from './company-first-admin.service';
import { CreateFirstAdminDto } from './dto/invite-first-admin.dto';

// Platform-level company management (registering companies, viewing other companies). Each route
// needs its companies:* permission (RolesGuard) AND the caller's own company to be the platform
// owner (CompanyProvisioningService) — see that service's comment. A user's own company stays
// available to everyone through GET /company (CompanyController).
@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly provisioning: CompanyProvisioningService,
    private readonly firstAdmin: CompanyFirstAdminService,
  ) {}

  // What the Companies screen may offer the signed-in user (display only; never an authorization).
  @Get('access')
  @AllowAuthenticated()
  @ApiOperation({ summary: 'Company-management actions available to the current user' })
  access(@CurrentUser() user: any) {
    return this.provisioning.access({ id: user.id, companyId: user.companyId });
  }

  @Get()
  @Permissions(PROVISIONING_PERMISSIONS.read)
  @ApiOperation({ summary: 'List all companies (platform owner only)' })
  list(@CurrentUser() user: any) {
    return this.provisioning.list({ id: user.id, companyId: user.companyId });
  }

  @Get(':id')
  @Permissions(PROVISIONING_PERMISSIONS.read)
  @ApiOperation({ summary: 'Get a company (platform owner only)' })
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.provisioning.get({ id: user.id, companyId: user.companyId }, id);
  }

  @Post()
  @Permissions(PROVISIONING_PERMISSIONS.create)
  @ApiOperation({ summary: 'Register a new company (platform owner only)' })
  create(@CurrentUser() user: any, @Body() dto: CreateCompanyDto) {
    return this.provisioning.create({ id: user.id, companyId: user.companyId }, dto);
  }

  // Create First Admin — see CompanyFirstAdminService. The company id in the path names the
  // target only; authorization comes from the caller (permission + platform-owner company).
  @Get(':id/first-admin')
  @Permissions(PROVISIONING_PERMISSIONS.read)
  @ApiOperation({ summary: 'First-administrator status of a company (platform owner only)' })
  firstAdminStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.firstAdmin.status({ id: user.id, companyId: user.companyId }, id);
  }

  @Post(':id/first-admin')
  @Permissions(PROVISIONING_PERMISSIONS.inviteAdmin)
  @ApiOperation({ summary: 'Create the first administrator of a company with a temporary password — the Users screen\'s creation, no email (platform owner only)' })
  createFirstAdmin(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateFirstAdminDto) {
    return this.firstAdmin.create({ id: user.id, companyId: user.companyId }, id, dto);
  }

  @Post(':id/first-admin/setup-link')
  @Permissions(PROVISIONING_PERMISSIONS.inviteAdmin)
  @ApiOperation({ summary: 'Optional: email the first administrator a single-use set-password link (needs SMTP; platform owner only)' })
  sendFirstAdminSetupLink(@CurrentUser() user: any, @Param('id') id: string) {
    return this.firstAdmin.sendSetupLink({ id: user.id, companyId: user.companyId }, id);
  }
}
