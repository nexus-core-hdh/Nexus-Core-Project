// Single source of truth for "Order Screen Replication" — mirrors receipt-types.config.ts's own
// role for the 18 IM_Receipt-backed types, but for the IM_OrderReceipt/IM_OrderReceiptItem spine
// Purchase Order already owns. Purchase Order (ReceiptType=1) is the master/template: it keeps
// its own dedicated /legacy-erp/purchase-orders route (see purchase-order.service.ts's own
// RECEIPT_TYPE constant and order-type.controller.ts's resolve() guard, both keyed off 1).
//
// Subcontract Order (ReceiptType=3) is the first additional entry — confirmed free in the live
// database (IM_OrderReceipt currently has zero ReceiptType=3 rows) and the physical schema
// already carries what it needs: IM_OrderReceiptItem.SubcontractorId is a real, pre-existing FK
// straight to FI_Account (the same "Current Account" master every other screen already uses),
// confirmed via a live FK constraint (FK_IM_OrderReceiptItem_FI_AccountSubcontractor) — not a
// guess, and not a new master table.
export interface OrderTypeConfig {
  receiptType: number;
  key: string;
  label: string;
  /** Receipt-number prefix, e.g. "PO-1", "SC-1" — cosmetic, safely renameable later. */
  numberPrefix: string;
  /** The ONE IM_Receipt-side ReceiptType (see receipt-types.config.ts) authorized to receive
   *  against this order type's lines via IM_ReceiptItem.OrderReceiptItemId ("Pending Orders").
   *  The authoritative source for inventory-receipt.service.ts's assertPendingSource() write-
   *  time guard AND purchase-order.service.ts's listPending() display-side gate, so a Purchase
   *  Receipt (2) can never receive against — or be treated as the approval authority for —
   *  a Subcontract Order (3) line, and vice versa. */
  receivingReceiptType: number;
}

export const ORDER_TYPES: OrderTypeConfig[] = [
  { receiptType: 1, key: 'purchase-order', label: 'Purchase Order', numberPrefix: 'PO', receivingReceiptType: 2 },
  { receiptType: 3, key: 'subcontract-order', label: 'Subcontract Order', numberPrefix: 'SC', receivingReceiptType: 11 },
];

export const getOrderTypeConfig = (receiptType: number): OrderTypeConfig | undefined =>
  ORDER_TYPES.find((t) => t.receiptType === receiptType);
