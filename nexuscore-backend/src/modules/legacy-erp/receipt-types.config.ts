// Single source of truth for the "Receipt Screen Replication" feature — every other receipt
// type is the SAME physical IM_Receipt/IM_ReceiptItem tables as Purchase Receipt, distinguished
// only by ReceiptType (a plain smallint column with no FK/lookup table/CHECK constraint).
//
// This is the CONFIRMED numbering handed down for this feature (not a placeholder/guess like
// the previous revision of this file). Purchase Order (ReceiptType=1) is a genuinely separate
// entity on a different table (IM_OrderReceipt, see purchase-order.service.ts) and is
// deliberately NOT listed here — it already has its own dedicated screens/routes and was
// already numbered 1 before this pass, so nothing about it changes.
//
// Purchase Receipt (ReceiptType=2) is the master/template: it keeps its own dedicated
// /legacy-erp/inventory-receipts route (see inventory-receipt.service.ts's RECEIPT_TYPE
// constant and receipt-type.controller.ts's resolve() guard, both keyed off 2 now instead of
// the old 1). Every other entry below reuses that exact same IM_Receipt-backed
// service/controller/UI through the generic /legacy-erp/receipts/:receiptType route.
export interface ReceiptTypeConfig {
  receiptType: number;
  key: string;
  label: string;
  /** Receipt-number prefix, e.g. "IR-1", "IR-2" — cosmetic, safely renameable later. */
  numberPrefix: string;
}

export const RECEIPT_TYPES: ReceiptTypeConfig[] = [
  { receiptType: 2, key: 'purchase-receipt', label: 'Purchase Receipt', numberPrefix: 'IR' },
  { receiptType: 122, key: 'purchase-return-receipt', label: 'Purchase Return', numberPrefix: 'PRN' },
  { receiptType: 16, key: 'counting-stock-receipt', label: 'Counting Stock Receipt', numberPrefix: 'CS' },
  { receiptType: 101, key: 'counting-stockovers-receipt', label: 'Counting Stockovers Receipt', numberPrefix: 'CSO' },
  { receiptType: 17, key: 'warehouse-transfer-receipt', label: 'Warehouse Transfer Receipt', numberPrefix: 'WT' },
  { receiptType: 11, key: 'outside-process-receive-receipt', label: 'Outside Process Receive Receipt', numberPrefix: 'OPR' },
  { receiptType: 12, key: 'outside-process-return-receipt', label: 'Outside Process Return Receipt', numberPrefix: 'OPT' },
  { receiptType: 134, key: 'outside-process-sent-receipt', label: 'Outside Process Sent Receipt', numberPrefix: 'OPS' },
  { receiptType: 133, key: 'outside-process-sent-return-receipt', label: 'Outside Process Sent Return Receipt', numberPrefix: 'OSR' },
  { receiptType: 140, key: 'manufacture-send-receipt', label: 'Manufacture Send Receipt', numberPrefix: 'MS' },
  { receiptType: 40, key: 'manufacture-return-receipt', label: 'Manufacture Return Receipt', numberPrefix: 'MRT' },
  { receiptType: 10, key: 'outside-manufacture-receipt', label: 'Outside Manufacture Receipt', numberPrefix: 'OMR' },
  { receiptType: 132, key: 'special-purpose-outflow-receipt', label: 'Special Purpose (Outflow) Receipt', numberPrefix: 'SPO' },
  { receiptType: 18, key: 'special-purpose-inflow-receipt', label: 'Special Purpose (Inflow) Receipt', numberPrefix: 'SPI' },
  { receiptType: 22, key: 'service-purchase-receipt', label: 'Service Purchase Receipt', numberPrefix: 'SVP' },
  { receiptType: 139, key: 'service-purchase-return-receipt', label: 'Service Purchase Return Receipt', numberPrefix: 'SVR' },
  { receiptType: 120, key: 'wholesale-receipt', label: 'Wholesale Receipt', numberPrefix: 'WS' },
  { receiptType: 3, key: 'return-wholesale-receipt', label: 'Return Wholesale Receipt', numberPrefix: 'RWS' },
];

export const getReceiptTypeConfig = (receiptType: number): ReceiptTypeConfig | undefined =>
  RECEIPT_TYPES.find((t) => t.receiptType === receiptType);
