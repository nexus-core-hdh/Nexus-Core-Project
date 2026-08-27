import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Centralized "can this legacy-erp record be deleted" validator (Strict Hierarchical Deletion
// Dependency Requirements). Every remove()/removeItem() across purchase-order.service.ts,
// inventory-receipt.service.ts (the same service backs Purchase Receipt, Purchase Return, Sale,
// Sale Return, Stock Adjustment/Transfer/In/Out — all differentiated only by IM_Receipt.ReceiptType,
// see that file's own header comment), warehouse.service.ts, yarn-card/fabric-card/
// trim-inventory-card.service.ts (all three are IM_Item, scoped by AccessCode), and
// fi-receipt.service.ts calls this ONE service instead of each hand-rolling its own dependency
// check. Real FK targets below were confirmed live against nexuscore_db via
// information_schema.referential_constraints (every one is ON DELETE NO ACTION — but every
// remove() here is a soft delete, "IsDeleted" = 1, which never trips a DB FK check at all, so
// this app-level EXISTS gate is the only thing enforcing the hierarchy). "Purchase Shift" /
// "Sale Return Shift" / "Purchase Return Shift" named in the original requirement do not exist
// anywhere in this codebase or database (confirmed) — the equivalent protection is provided here
// by the real chain (a Return's own IM_ReceiptItem row still points back at its originating
// Receipt/Order line via PurchaseReceiptItemId/OrderReceiptItemId, so blocking deletion of
// whichever record still has that live reference protects the whole chain transitively; no
// separate "Shift" entity is needed).
export type DeleteEntityType =
  | 'IM_Item'
  | 'IM_Warehouse'
  | 'IM_OrderReceipt'
  | 'IM_OrderReceiptItem'
  | 'IM_Receipt'
  | 'IM_ReceiptItem'
  | 'FI_Receipt'
  | 'FI_ReceiptItem'
  | 'StyleCard';

export interface DeleteDependencyCheck {
  label: string;
  blocked: boolean;
}

export interface DeleteDependencyResult {
  entityType: DeleteEntityType;
  entityId: number | string;
  blocked: boolean;
  dependencies: DeleteDependencyCheck[];
}

type QueryClient = Pick<PrismaService, '$queryRaw'>;

interface CheckSpec {
  label: string;
  existsSql: (id: number | string) => Prisma.Sql;
}

const ENTITY_LABELS: Record<DeleteEntityType, string> = {
  IM_Item: 'Inventory Item',
  IM_Warehouse: 'Warehouse',
  IM_OrderReceipt: 'Purchase Order',
  IM_OrderReceiptItem: 'Purchase Order line',
  IM_Receipt: 'Receipt',
  IM_ReceiptItem: 'Receipt line',
  FI_Receipt: 'Receipt/Payment Voucher',
  FI_ReceiptItem: 'Voucher line',
  StyleCard: 'Sample/Style Card',
};

// Every check is a single `EXISTS (...)` correlated to the record being deleted — combined below
// into ONE round-trip query per validate call, never a per-child SELECT * (no N+1).
const CHECKS: Record<DeleteEntityType, CheckSpec[]> = {
  IM_Item: [
    {
      label: 'Purchase or Sales Order',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_OrderReceiptItem" WHERE "InventoryId" = ${id} AND "IsDeleted" = 0)`,
    },
    {
      // Same IM_ReceiptItem table backs Purchase Receipt / Purchase Return / Sale / Sale Return /
      // Stock Adjustment / Stock Transfer / Stock In / Stock Out / Opening Stock — one EXISTS
      // covers all of them, differentiated only by IM_Receipt.ReceiptType on the header.
      label: 'Purchase Receipt, Sale, Return, or Stock Movement',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_ReceiptItem" WHERE "InventoryId" = ${id} AND "IsDeleted" = 0)`,
    },
  ],
  IM_Warehouse: [
    { label: 'Inventory Item', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_Item" WHERE "WarehouseId" = ${id} AND "IsDeleted" = 0)` },
    {
      label: 'Purchase or Sales Order',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_OrderReceiptItem" WHERE "WarehouseId" = ${id} AND "IsDeleted" = 0)`,
    },
    {
      label: 'Stock Movement',
      existsSql: (id) =>
        Prisma.sql`EXISTS (SELECT 1 FROM "IM_ReceiptItem" WHERE ("InWarehouseId" = ${id} OR "OutWarehouseId" = ${id}) AND "IsDeleted" = 0)`,
    },
  ],
  IM_OrderReceipt: [
    {
      // Covers "PO + Receive" directly, and "PO + Return" transitively: a Return can only exist
      // once a Receipt exists, and that Receipt is itself blocked from deletion (see IM_Receipt
      // checks below) while the Return references it — so the PO stays protected either way.
      label: 'Purchase Receipt',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_ReceiptItem" ri
        JOIN "IM_OrderReceiptItem" oi ON oi."RecId" = ri."OrderReceiptItemId"
        WHERE oi."OrderReceiptId" = ${id} AND oi."IsDeleted" = 0 AND ri."IsDeleted" = 0
      )`,
    },
    {
      label: 'Linked Order',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_OrderReceipt" WHERE "SourceReceiptId" = ${id} AND "IsDeleted" = 0)`,
    },
  ],
  IM_OrderReceiptItem: [
    {
      label: 'Purchase Receipt',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_ReceiptItem" WHERE "OrderReceiptItemId" = ${id} AND "IsDeleted" = 0)`,
    },
  ],
  IM_Receipt: [
    {
      label: 'Return',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_ReceiptItem" child
        WHERE child."IsDeleted" = 0
          AND child."PurchaseReceiptItemId" IN (SELECT "RecId" FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${id} AND "IsDeleted" = 0)
      )`,
    },
    {
      label: 'Linked Receipt',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_ReceiptItem" child
        WHERE child."IsDeleted" = 0
          AND child."ReturnReceiptItemId" IN (SELECT "RecId" FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${id} AND "IsDeleted" = 0)
      )`,
    },
    {
      label: 'Stock Transfer Inflow',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_ReceiptItem" child
        WHERE child."IsDeleted" = 0
          AND child."TransferOutReceiptItemId" IN (SELECT "RecId" FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${id} AND "IsDeleted" = 0)
      )`,
    },
    {
      label: 'Manufacture Receipt',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_ReceiptItem" child
        WHERE child."IsDeleted" = 0
          AND child."ManufactureReceiptItemId" IN (SELECT "RecId" FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${id} AND "IsDeleted" = 0)
      )`,
    },
    {
      label: 'Linked Receipt (Source)',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_Receipt" WHERE "SourceReceiptId" = ${id} AND "IsDeleted" = 0)`,
    },
    {
      // Real column direction is IM_Receipt.CurrentAccountReceiptId -> FI_ReceiptItem.RecId (this
      // Sale/Receipt points AT its settling payment line, not the other way round) — so this is a
      // business rule read off the record's own column, not a child-table EXISTS: a Sale that has
      // been reconciled against a Receive/Payment voucher stays blocked from deletion.
      label: 'Receive/Payment',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_Receipt" WHERE "RecId" = ${id} AND "CurrentAccountReceiptId" IS NOT NULL)`,
    },
  ],
  IM_ReceiptItem: [
    {
      label: 'Return, Transfer, or Manufacture Receipt',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_ReceiptItem" WHERE "IsDeleted" = 0 AND (
          "PurchaseReceiptItemId" = ${id} OR "ReturnReceiptItemId" = ${id} OR "TransferOutReceiptItemId" = ${id} OR "ManufactureReceiptItemId" = ${id}
        )
      )`,
    },
  ],
  FI_Receipt: [
    {
      // Reverse of the IM_Receipt "Receive/Payment" check above: this is the real FK-driven
      // direction — a Sale/Purchase Receipt or Order still referencing one of this voucher's
      // lines blocks deleting the voucher itself.
      label: 'Sale, Purchase Receipt, or Order referencing this voucher',
      existsSql: (id) => Prisma.sql`EXISTS (
        SELECT 1 FROM "IM_Receipt" WHERE "IsDeleted" = 0 AND "CurrentAccountReceiptId" IN (
          SELECT "RecId" FROM "FI_ReceiptItem" WHERE "CurrentAccountReceiptId" = ${id} AND "IsDeleted" = 0
        )
      ) OR EXISTS (
        SELECT 1 FROM "IM_OrderReceipt" WHERE "IsDeleted" = 0 AND "CurrentAccountReceiptId" IN (
          SELECT "RecId" FROM "FI_ReceiptItem" WHERE "CurrentAccountReceiptId" = ${id} AND "IsDeleted" = 0
        )
      )`,
    },
  ],
  FI_ReceiptItem: [
    {
      label: 'Sale or Purchase Receipt',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_Receipt" WHERE "CurrentAccountReceiptId" = ${id} AND "IsDeleted" = 0)`,
    },
    {
      label: 'Purchase or Sales Order',
      existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "IM_OrderReceipt" WHERE "CurrentAccountReceiptId" = ${id} AND "IsDeleted" = 0)`,
    },
  ],
  // StyleCard is the Prisma/UUID-backed record behind the PLM Sample/Style Card Master screen
  // (plm-cards.service.ts). Unlike the legacy tables above, PlmOrder/CriticalPath hold this as a
  // REQUIRED FK (default Prisma referential action: Restrict — a raw delete would already throw
  // a bare P2003), while SampleCard/ProductCard/CostingSheet/StudyTemplateCard/PlmTask hold it as
  // an OPTIONAL FK (default action: SetNull — a raw delete would silently sever those records'
  // link back to this style, not delete them). Blocking on either kind here gives one clean,
  // consistent ConflictException instead of a raw DB error for the first case and silent data
  // loss for the second. Verified against schema.prisma directly (no live-DB introspection
  // needed — these are the current, unmigrated Prisma models, not legacy raw-SQL tables).
  StyleCard: [
    { label: 'Sample Card', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "SampleCard" WHERE "styleCardId" = ${id})` },
    { label: 'Product Card', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "ProductCard" WHERE "styleCardId" = ${id})` },
    { label: 'PLM Order', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "PlmOrder" WHERE "styleCardId" = ${id})` },
    { label: 'PLM Task', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "PlmTask" WHERE "styleCardId" = ${id})` },
    { label: 'Critical Path', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "CriticalPath" WHERE "styleCardId" = ${id})` },
    { label: 'Costing Sheet', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "CostingSheet" WHERE "styleCardId" = ${id})` },
    { label: 'Study Template', existsSql: (id) => Prisma.sql`EXISTS (SELECT 1 FROM "StudyTemplateCard" WHERE "styleCardId" = ${id})` },
  ],
};

// Lets a generic, config-driven delete path (legacy-master-lookup.service.ts's remove()) find out
// — by table name alone, no second table list to maintain — whether the record it's about to
// soft-delete is one this service actually knows how to protect, without hardcoding entity names
// at the call site.
export function isProtectedEntityType(table: string): table is DeleteEntityType {
  return Object.prototype.hasOwnProperty.call(CHECKS, table);
}

@Injectable()
export class DeleteDependencyService {
  constructor(private readonly prisma: PrismaService) {}

  // `tx` lets a caller run the check inside the same $transaction as its own UPDATE ... IsDeleted
  // = 1 write (same optional-tx pattern as approval.service.ts) so nothing can insert a new
  // dependency between the check and the delete.
  async checkDependencies(entityType: DeleteEntityType, id: number | string, tx?: Prisma.TransactionClient): Promise<DeleteDependencyResult> {
    const checks = CHECKS[entityType];
    const client: QueryClient = tx ?? this.prisma;
    if (!checks.length) {
      return { entityType, entityId: id, blocked: false, dependencies: [] };
    }

    const selects = checks.map((c, i) => Prisma.sql`(${c.existsSql(id)}) as "c${Prisma.raw(String(i))}"`);
    const rows = await client.$queryRaw<Record<string, boolean>[]>(Prisma.sql`SELECT ${Prisma.join(selects)}`);
    const row = rows[0] ?? {};
    const dependencies = checks.map((c, i) => ({ label: c.label, blocked: Boolean(row[`c${i}`]) }));
    return { entityType, entityId: id, blocked: dependencies.some((d) => d.blocked), dependencies };
  }

  // Throws ConflictException (matches the app-wide convention — see roles.service.ts's
  // "Cannot delete system role" — reshaped by GlobalExceptionFilter into a clean 409 response,
  // never a raw SQL/Prisma error) when any dependency exists. No-op otherwise.
  async assertDeletable(entityType: DeleteEntityType, id: number | string, tx?: Prisma.TransactionClient): Promise<void> {
    const result = await this.checkDependencies(entityType, id, tx);
    if (!result.blocked) return;
    const blockingLabels = result.dependencies.filter((d) => d.blocked).map((d) => d.label);
    throw new ConflictException(
      `${ENTITY_LABELS[entityType]} cannot be deleted because related ${blockingLabels.join(', ')} records exist. ` +
        'Please delete all dependent transactions first.',
    );
  }
}
