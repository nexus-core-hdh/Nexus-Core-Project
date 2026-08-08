import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountSatellitesService } from './account-satellites.service';
import { AccountAttachmentsService } from './account-attachments.service';
import { TrimCardController } from './trim-card.controller';
import { TrimCardService } from './trim-card.service';
import { UnitSetController } from './unit-set.controller';
import { UnitSetService } from './unit-set.service';
import { LookupController } from './lookup.controller';
import { ParameterLookupService } from './parameter-lookup.service';
import { YarnCardController } from './yarn-card.controller';
import { YarnCardService } from './yarn-card.service';
import { YarnCardSatellitesService } from './yarn-card-satellites.service';
import { YarnCardAttachmentsService } from './yarn-card-attachments.service';
import { LegacyMasterLookupController } from './legacy-master-lookup.controller';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { FabricCardController } from './fabric-card.controller';
import { FabricCardService } from './fabric-card.service';
import { MasterLookupController } from './master-lookup.controller';
import { TrimInventoryCardController } from './trim-inventory-card.controller';
import { TrimInventoryCardService } from './trim-inventory-card.service';
import { InventoryCardController } from './inventory-card.controller';
import { InventoryCardService } from './inventory-card.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderAttachmentsService } from './purchase-order-attachments.service';

@Module({
  imports: [
    // Needed for the attachment "View" route's manual token check (query-param auth for real
    // browser navigation) — same registerAs pattern NotificationsModule already uses.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    WarehouseController,
    AccountController,
    TrimCardController,
    UnitSetController,
    LookupController,
    YarnCardController,
    LegacyMasterLookupController,
    FabricCardController,
    MasterLookupController,
    TrimInventoryCardController,
    InventoryCardController,
    PurchaseOrderController,
  ],
  providers: [
    WarehouseService,
    AccountService,
    AccountSatellitesService,
    AccountAttachmentsService,
    TrimCardService,
    UnitSetService,
    ParameterLookupService,
    YarnCardService,
    YarnCardSatellitesService,
    YarnCardAttachmentsService,
    LegacyMasterLookupService,
    FabricCardService,
    TrimInventoryCardService,
    InventoryCardService,
    PurchaseOrderService,
    PurchaseOrderAttachmentsService,
  ],
})
export class LegacyErpModule {}
