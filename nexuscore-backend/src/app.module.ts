import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import rabbitmqConfig from './config/rabbitmq.config';

import { PrismaModule } from './prisma/prisma.module';
import { MessagingModule } from './messaging/messaging.module';

import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { CompanyModule } from './modules/company/company.module';
import { BranchModule } from './modules/branch/branch.module';
import { FabricModule } from './modules/fabric/fabric.module';
import { CuttingModule } from './modules/cutting/cutting.module';
import { BpmModule } from './modules/bpm/bpm.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { EntitiesModule } from './modules/entities/entities.module';
import { LookupModule } from './modules/lookup/lookup.module';
import { CrmModule } from './modules/crm/crm.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { FilesModule } from './modules/files/files.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { FeedModule } from './modules/feed/feed.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CollabModule } from './modules/collab/collab.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { FitnessModule } from './modules/fitness/fitness.module';
import { TablesModule } from './modules/tables/tables.module';
import { LogsModule } from './modules/logs/logs.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { AppConfigModule } from './modules/config/config.module';
import { PlmModule } from './modules/plm/plm.module';
import { CostingModule } from './modules/costing/costing.module';
import { StyleExtrasModule } from './modules/style-extras/style-extras.module';
import { MenuItemsModule } from './modules/menu-items/menu-items.module';
import { StubsModule } from './modules/stubs/stubs.module';
import { DocketManagementModule } from './modules/docket-management/docket-management.module';
import { LegacyErpModule } from './modules/legacy-erp/legacy-erp.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { GeneralSettingsModule } from './modules/general-settings/general-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, rabbitmqConfig],
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
      },
    ]),
    PrismaModule,
    MessagingModule,

    // Core modules
    AuthModule,
    UsersModule,
    RolesModule,
    CompanyModule,
    BranchModule,

    // Legacy / industry-specific
    FabricModule,
    CuttingModule,
    BpmModule,
    NotificationsModule,
    ReportsModule,
    WhatsappModule,

    // Migrated CRM platform modules
    EntitiesModule,
    LookupModule,
    CrmModule,
    CatalogModule,
    FinanceModule,
    PipelineModule,
    FilesModule,
    CommunicationModule,
    FeedModule,
    DocumentsModule,
    CollabModule,
    ProjectsModule,
    FitnessModule,
    TablesModule,
    LogsModule,
    UserSettingsModule,
    AppConfigModule,
    PlmModule,
    CostingModule,
    StyleExtrasModule,
    DocketManagementModule,
    MenuItemsModule,
    StubsModule,

    // Migrated SQL Server ERP schema (raw SQL via PrismaService, tables not in schema.prisma)
    LegacyErpModule,

    // Centralized General Settings -> Approval Configuration framework
    ApprovalModule,
    GeneralSettingsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
