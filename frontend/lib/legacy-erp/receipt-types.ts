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

// Mirrors nexuscore-backend/.../receipt-types.config.ts's own RELATED_IMPORT_SOURCE_TYPES —
// Purchase Return's "Import Related Receipt" workflow only ever sources from these two receipt
// types (Purchase Receipt and Outside Process Receive Receipt); Purchase Return itself is the
// only valid TARGET, not a source.
export const RELATED_IMPORT_SOURCE_TYPES = [2, 11] as const;

// The "Subcontract Receipts" nav entry's own curated subset of RECEIPT_TYPES — the four "Outside
// Process" types, i.e. the receiving/return side of the Subcontract Order workflow (see
// order-types.config.ts's receivingReceiptType=11 for Subcontract Order itself) plus their two
// sent/outflow counterparts. Purely a *membership* list, same convention as the 18-leaf
// "Inventory Receipts" submenu in seed.ts (one static list of which types belong under one nav
// entry) — every label/prefix/route still comes from RECEIPT_TYPES above, nothing duplicated.
export const SUBCONTRACT_RECEIPT_TYPES = [11, 12, 134, 133] as const;

// Receipt Type -> the generic business ACTION word for a subcontract transaction — "Send" (goods
// go TO the subcontractor), "Receive" (processed goods come back), "Return" (either leg reversed).
// This is a fixed fact about the receipt-type taxonomy itself (134/11/12 always mean the same
// direction regardless of which subcontract PROCESS is involved), the SAME mapping receipt-menu.ts
// already hardcodes when building the "Subcontractor Transactions" menu (134->Send, 11->Receive,
// 12->Return) — reused here, not reinvented. This is deliberately NOT a subcontract type NAME
// (never "Dyeing"/"Knitting"/...); those always come from the real MD_SubcontractType record a
// transaction actually references (see getReceiptTypeLabel below), never from this map.
const SUBCONTRACT_ACTION_BY_RECEIPT_TYPE: Record<number, string> = {
  134: "Send",
  11: "Receive",
  12: "Return",
  // 133 (Outside Process Sent Return Receipt) — the return leg of a Send (134), not currently
  // reachable from the Planning menu (see receipt-menu.ts's own comment on this documented gap),
  // but resolved consistently here wherever it does appear (e.g. the Subcontract Receipts list).
  133: "Sent Return",
};

// Single shared "Receipt Type" display resolver — Planning's own Transaction Details grid
// (Fabric/Yarn/Trim Planning, plus the Fabric/Trim/Yarn Requirements screen's own copy) all call
// this instead of rendering the raw numeric ReceiptType. For a subcontract-family receiptType
// WITH a real, already-resolved subcontract type name (every Transaction Details row already
// carries this as `subcontractor` — see fabric-yarn-requirements.service.ts's own
// getTransactionDetails, which LEFT JOINs MD_SubcontractType in the same single query, never a
// second per-row lookup), this returns "<Name> <Action>" (e.g. "Dyeing Send") — built entirely
// from that real record plus the fixed action-word map above, never a hardcoded subcontract name.
// Every other case (non-subcontract receiptType, or a subcontract-family row with no
// subcontractor resolved — e.g. legacy data predating this link) falls back to the existing,
// already-correct RECEIPT_TYPES label, exactly as before.
export const getReceiptTypeLabel = (receiptType: number | null | undefined, subcontractorName?: string | null): string => {
  if (receiptType == null) return "—";
  const action = SUBCONTRACT_ACTION_BY_RECEIPT_TYPE[receiptType];
  if (action && subcontractorName) return `${subcontractorName} ${action}`;
  return getReceiptTypeConfig(receiptType).label;
};
