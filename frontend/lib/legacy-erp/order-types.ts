// Frontend mirror of nexuscore-backend/.../order-types.config.ts — kept in sync manually, same
// convention receipt-types.ts already establishes for the 18 IM_Receipt-backed types. Purchase
// Order (ReceiptType=1) remains the master/template with its own dedicated route; Subcontract
// Order (ReceiptType=3) is the first additional entry — see the backend file's own comment for
// why 3 was confirmed free and why SubcontractorId already existing on IM_OrderReceiptItem (a
// real FK straight to FI_Account) is what makes this a reuse, not a new schema.
export interface OrderTypeConfig {
  receiptType: number;
  key: string;
  label: string;
  numberPrefix: string;
  /** The one IM_Receipt-side ReceiptType authorized to receive against this order type — see the
   *  backend config's own comment (assertPendingSource()'s authoritative source). */
  receivingReceiptType: number;
}

export const ORDER_TYPES: OrderTypeConfig[] = [
  { receiptType: 1, key: "purchase-order", label: "Purchase Order", numberPrefix: "PO", receivingReceiptType: 2 },
  { receiptType: 3, key: "subcontract-order", label: "Subcontract Order", numberPrefix: "SC", receivingReceiptType: 11 },
];

export const getOrderTypeConfig = (receiptType: number): OrderTypeConfig =>
  ORDER_TYPES.find((t) => t.receiptType === receiptType) ?? ORDER_TYPES[0];
