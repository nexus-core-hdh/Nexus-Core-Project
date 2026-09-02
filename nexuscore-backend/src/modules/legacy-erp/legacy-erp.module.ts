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
import { OrderTypeController } from './order-type.controller';
import { WarehouseParameterController } from './warehouse-parameter.controller';
import { WarehouseParameterService } from './warehouse-parameter.service';
import { InventoryReceiptController } from './inventory-receipt.controller';
import { InventoryReceiptService } from './inventory-receipt.service';
import { InventoryReceiptAttachmentsService } from './inventory-receipt-attachments.service';
import { SizeSetController } from './size-set.controller';
import { SizeSetService } from './size-set.service';
import { UnifiedGridController } from './unified-grid.controller';
import { UnifiedGridService } from './unified-grid.service';
import { WorklistFieldsController } from './worklist-fields.controller';
import { WorklistFieldsService } from './worklist-fields.service';
import { WorklistRowsService } from './worklist-rows.service';
import { ReceiptTypeController } from './receipt-type.controller';
import { FiReceiptController } from './fi-receipt.controller';
import { FiReceiptService } from './fi-receipt.service';
import { FiReceiptAttachmentsService } from './fi-receipt-attachments.service';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { ContractAttachmentsService } from './contract-attachments.service';
import { ItemStatementController } from './item-statement.controller';
import { ItemStatementService } from './item-statement.service';
import { DeleteDependencyService } from './delete-dependency.service';
import { ReceiptTraceabilityService } from './receipt-traceability.service';
import { ApprovalModule } from '../approval/approval.module';

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
    // Centralized approval policy engine — InventoryReceiptService (Purchase Receipt) consumes
    // ApprovalService rather than having its own hardcoded approval rules.
    ApprovalModule,
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
    OrderTypeController,
    WarehouseParameterController,
    InventoryReceiptController,
    SizeSetController,
    UnifiedGridController,
    WorklistFieldsController,
    ReceiptTypeController,
    FiReceiptController,
    ContractController,
    ItemStatementController,
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
    WarehouseParameterService,
    InventoryReceiptService,
    InventoryReceiptAttachmentsService,
    SizeSetService,
    UnifiedGridService,
    WorklistFieldsService,
    WorklistRowsService,
    FiReceiptService,
    FiReceiptAttachmentsService,
    ContractService,
    ContractAttachmentsService,
    ItemStatementService,
    DeleteDependencyService,
    ReceiptTraceabilityService,
  ],
  // LegacyMasterLookupService.listItemUnits is the same per-item configured-Unit source Purchase
  // Order/Purchase Receipt already resolve Unit through (unit-conversion.util.ts's
  // resolveLineUnitId/assertValidItemUnit) — exported so StyleExtrasModule (PLM BOM) can reuse the
  // exact same resolution/validation for its own Fabric/Trim Card -> Unit binding instead of a
  // second copy of it.
  exports: [LegacyMasterLookupService],
})
export class LegacyErpModule {}
