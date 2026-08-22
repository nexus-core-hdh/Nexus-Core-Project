// Frontend mirror of nexuscore-backend/src/modules/legacy-erp/receipt-types.config.ts — kept in
// sync manually (a small static list, same convention as receipt-master-data/_lib/table-config.ts's
// own TABLE_OPTIONS). See that backend file's comment: this is the confirmed numbering for the
// "Receipt Screen Replication" feature. Purchase Order (ReceiptType=1, a separate IM_OrderReceipt-
// backed module — see purchase-orders/page.tsx) is deliberately not listed here. Purchase Receipt
// (ReceiptType=2) remains the master/template with its own dedicated route.
export interface ReceiptTypeConfig {
  receiptType: number;
  key: string;
  label: string;
  numberPrefix: string;
}

export const RECEIPT_TYPES: ReceiptTypeConfig[] = [
  { receiptType: 2, key: "purchase-receipt", label: "Purchase Receipt", numberPrefix: "IR" },
  { receiptType: 122, key: "purchase-return-receipt", label: "Purchase Return", numberPrefix: "PRN" },
  { receiptType: 16, key: "counting-stock-receipt", label: "Counting Stock Receipt", numberPrefix: "CS" },
  { receiptType: 101, key: "counting-stockovers-receipt", label: "Counting Stockovers Receipt", numberPrefix: "CSO" },
  { receiptType: 17, key: "warehouse-transfer-receipt", label: "Warehouse Transfer Receipt", numberPrefix: "WT" },
  { receiptType: 11, key: "outside-process-receive-receipt", label: "Outside Process Receive Receipt", numberPrefix: "OPR" },
  { receiptType: 12, key: "outside-process-return-receipt", label: "Outside Process Return Receipt", numberPrefix: "OPT" },
  { receiptType: 134, key: "outside-process-sent-receipt", label: "Outside Process Sent Receipt", numberPrefix: "OPS" },
  { receiptType: 133, key: "outside-process-sent-return-receipt", label: "Outside Process Sent Return Receipt", numberPrefix: "OSR" },
  { receiptType: 140, key: "manufacture-send-receipt", label: "Manufacture Send Receipt", numberPrefix: "MS" },
  { receiptType: 40, key: "manufacture-return-receipt", label: "Manufacture Return Receipt", numberPrefix: "MRT" },
  { receiptType: 10, key: "outside-manufacture-receipt", label: "Outside Manufacture Receipt", numberPrefix: "OMR" },
  { receiptType: 132, key: "special-purpose-outflow-receipt", label: "Special Purpose (Outflow) Receipt", numberPrefix: "SPO" },
  { receiptType: 18, key: "special-purpose-inflow-receipt", label: "Special Purpose (Inflow) Receipt", numberPrefix: "SPI" },
  { receiptType: 22, key: "service-purchase-receipt", label: "Service Purchase Receipt", numberPrefix: "SVP" },
  { receiptType: 139, key: "service-purchase-return-receipt", label: "Service Purchase Return Receipt", numberPrefix: "SVR" },
  { receiptType: 120, key: "wholesale-receipt", label: "Wholesale Receipt", numberPrefix: "WS" },
  { receiptType: 3, key: "return-wholesale-receipt", label: "Return Wholesale Receipt", numberPrefix: "RWS" },
];

export const getReceiptTypeConfig = (receiptType: number): ReceiptTypeConfig =>
  RECEIPT_TYPES.find((t) => t.receiptType === receiptType) ?? RECEIPT_TYPES[0];
