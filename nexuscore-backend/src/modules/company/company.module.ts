import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompaniesController } from './companies.controller';
import { CompanyProvisioningService } from './company-provisioning.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyFirstAdminService } from './company-first-admin.service';

@Module({
  // AuditModule: registering a company records its Created event. AuthModule: MailService and the
  // set-password links (PasswordResetService) the first-admin invitation reuses.
  imports: [AuditModule, AuthModule],
  controllers: [CompanyController, CompaniesController],
  providers: [CompanyService, CompanyProvisioningService, CompanyFirstAdminService],
  exports: [CompanyService],
})
export class CompanyModule {}
