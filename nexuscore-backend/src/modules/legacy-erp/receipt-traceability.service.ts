import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getReceiptTypeConfig } from './receipt-types.config';

// Universal Action Menu -> "Return / Related Receipt" submenu. The one shared implementation of
// the Order -> Receipt -> Received Connection -> Return traceability chain, reused by both
// PurchaseOrderService (Purchase Order type 1, Subcontract Order type 3 — see order-types.config
// .ts — and any future order type sharing IM_OrderReceipt) and InventoryReceiptService so neither
// duplicates the other's SQL, and no order type duplicates this walk for itself. A standalone,
// dependency-free service (only PrismaService) so both callers can inject it without a circular
// dependency between them.
//
// The chain is walked purely off the real, pre-existing "IM_ReceiptItem"."PurchaseReceiptItemId"
// self-reference column (see inventory-receipt.service.ts's own comment on it) and the existing
// "OrderReceiptItemId" column that already links a receipt line back to its order line — both are
// followed strictly by id (the given order's own OrderReceiptId, and whatever real chain of
// receipt-to-receipt RecIds hangs off it), never by receipt type, so a given order's family only
// ever contains receipts that genuinely reference ITS OWN lines — e.g. a Subcontract Order's
// family can only ever contain the Outside Process Receive/Return receipts actually created
// against it, never an unrelated Purchase Receipt, regardless of which order type asks.
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

  // Always the authoritative receipt-types.config.ts label for the row's own real ReceiptType —
  // no per-type special-casing here (a prior revision hardcoded `receiptType === 2 ? 'Purchase
  // Receipt' : ...`, which happened to match RECEIPT_TYPES' own entry for 2 but was a second,
  // driftable copy of it; removed so this can never say "Purchase Receipt" for anything that
  // isn't genuinely receiptType 2).
  private labelFor(receiptType: number): string {
    return getReceiptTypeConfig(receiptType)?.label ?? `Receipt Type ${receiptType}`;
  }

  // Core: every receipt (Purchase Receipt, Outside Process Receive/Return, Purchase Return,
  // etc. — whichever ones genuinely trace back) tracing back to any of the given order ids, via
  // order line -> receipt line (OrderReceiptItemId) -> any number of further
  // PurchaseReceiptItemId hops (received-connection, return, ...).
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

  // Entry point from an order screen (Purchase Order type 1, Subcontract Order type 3, ...) —
  // every receipt tracing back to this one order, by its own id only.
  async listForPurchaseOrder(purchaseOrderId: number): Promise<RelatedReceiptRow[]> {
    return this.familyByPurchaseOrderIds([purchaseOrderId]);
  }

  // Entry point from a Receipt/Return/Received-Connection screen (any ReceiptType) — walks back
  // up however many PurchaseReceiptItemId hops exist to find the root receipt(s), then
  // resolves the originating order(s) from there, then returns that order's full family
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
