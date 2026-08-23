import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getReceiptTypeConfig } from './receipt-types.config';

// Universal Action Menu -> "Return / Purchase Receipt" submenu. The one shared implementation
// of the Purchase Order -> Purchase Receipt -> Received Connection Receipt -> Purchase Return
// traceability chain, reused by both PurchaseOrderService and InventoryReceiptService so neither
// duplicates the other's SQL. A standalone, dependency-free service (only PrismaService) so both
// callers can inject it without a circular dependency between them.
//
// The chain is walked purely off the real, pre-existing "IM_ReceiptItem"."PurchaseReceiptItemId"
// self-reference column (see inventory-receipt.service.ts's own comment on it) and the existing
// "OrderReceiptItemId" column that already links a Purchase Receipt line back to its Purchase
// Order line. No new column, no new table.
export interface RelatedReceiptRow {
  id: number;
  receiptNo: string;
  receiptType: number;
  receiptDate: any;
  label: string;
}

@Injectable()
export class ReceiptTraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private labelFor(receiptType: number): string {
    return receiptType === 2 ? 'Purchase Receipt' : (getReceiptTypeConfig(receiptType)?.label ?? `Receipt Type ${receiptType}`);
  }

  // Core: every receipt (type 2 Purchase Receipt, 11 Received Connection, 122 Purchase Return,
  // etc.) tracing back to any of the given Purchase Order ids, via PO line -> Purchase Receipt
  // line (OrderReceiptItemId) -> any number of further PurchaseReceiptItemId hops (Received
  // Connection, Return, ...).
  private async familyByPurchaseOrderIds(poIds: number[]): Promise<RelatedReceiptRow[]> {
    if (!poIds.length) return [];
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH RECURSIVE po_items AS (
        SELECT "RecId" as id FROM "IM_OrderReceiptItem"
        WHERE "OrderReceiptId" IN (${Prisma.join(poIds)}) AND "IsDeleted" = 0
      ),
      direct_receipt_items AS (
        SELECT ri."RecId" as id, ri."InventoryReceiptId" as "receiptId"
        FROM "IM_ReceiptItem" ri
        WHERE ri."OrderReceiptItemId" IN (SELECT id FROM po_items) AND ri."IsDeleted" = 0
      ),
      chain AS (
        SELECT id, "receiptId" FROM direct_receipt_items
        UNION ALL
        SELECT child."RecId", child."InventoryReceiptId"
        FROM "IM_ReceiptItem" child
        JOIN chain c ON child."PurchaseReceiptItemId" = c.id
        WHERE child."IsDeleted" = 0
      )
      SELECT rec."RecId" as id, rec."ReceiptNo" as "receiptNo", rec."ReceiptType" as "receiptType", rec."ReceiptDate" as "receiptDate"
      FROM "IM_Receipt" rec
      WHERE rec."RecId" IN (SELECT DISTINCT "receiptId" FROM chain) AND rec."IsDeleted" = 0
      ORDER BY rec."ReceiptDate" DESC, rec."RecId" DESC
    `);
    return sanitizeRawRow(rows).map((r: any) => ({ ...r, label: this.labelFor(r.receiptType) }));
  }

  // Entry point from the Purchase Order screen — every receipt tracing back to this one PO.
  async listForPurchaseOrder(purchaseOrderId: number): Promise<RelatedReceiptRow[]> {
    return this.familyByPurchaseOrderIds([purchaseOrderId]);
  }

  // Entry point from a Receipt/Return/Received-Connection screen (any ReceiptType) — walks back
  // up however many PurchaseReceiptItemId hops exist to find the root Purchase Receipt(s), then
  // resolves the originating Purchase Order(s) from there, then returns that PO's full family
  // minus the record currently being viewed. A receipt never linked to a Purchase Order (created
  // standalone, not via Pending Orders import) legitimately has no family — returns [].
  async listForReceipt(receiptId: number, receiptType: number): Promise<RelatedReceiptRow[]> {
    const ancestorRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH RECURSIVE chain AS (
        SELECT "RecId" as id, "InventoryReceiptId" as "receiptId", "PurchaseReceiptItemId" as "parentItemId"
        FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" = ${receiptId} AND "IsDeleted" = 0
        UNION ALL
        SELECT p."RecId", p."InventoryReceiptId", p."PurchaseReceiptItemId"
        FROM "IM_ReceiptItem" p
        JOIN chain c ON p."RecId" = c."parentItemId"
        WHERE p."IsDeleted" = 0
      )
      SELECT DISTINCT "receiptId" FROM chain
    `);
    const ancestorReceiptIds = ancestorRows.map((r) => Number(r.receiptId));
    if (!ancestorReceiptIds.length) return [];

    const poRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT oi."OrderReceiptId" as id
      FROM "IM_ReceiptItem" ri
      JOIN "IM_OrderReceiptItem" oi ON oi."RecId" = ri."OrderReceiptItemId"
      WHERE ri."InventoryReceiptId" IN (${Prisma.join(ancestorReceiptIds)}) AND ri."IsDeleted" = 0 AND oi."IsDeleted" = 0
    `);
    const poIds = poRows.map((r) => Number(r.id));
    if (!poIds.length) return [];

    const family = await this.familyByPurchaseOrderIds(poIds);
    return family.filter((r) => r.id !== receiptId);
  }
}
