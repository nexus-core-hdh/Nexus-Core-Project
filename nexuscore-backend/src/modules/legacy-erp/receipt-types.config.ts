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

// Purchase Return's (ReceiptType=122) "Import Related Receipt" workflow — the only two receipt
// types eligible as an IMPORT SOURCE for a new Purchase Return line, via the existing
// IM_ReceiptItem.PurchaseReceiptItemId self-reference (see inventory-receipt.service.ts's
// listRelatedImportable()/assertReturnQty()/assertRelatedImportSource()). Confirmed business
// numbering for this feature — Receipt Type 2 ("Purchase Receipt") and Receipt Type 11 ("Outside
// Process Receive Receipt") as SOURCES only; Purchase Return (122) is the only TARGET screen —
// see assertRelatedImportSource's own comment. Not derived from RECEIPT_TYPES itself since
// there's no generic "valid import source" flag on that array — this is a separate, additive
// piece of configuration, and
// labels are still always resolved via getReceiptTypeConfig(), never hardcoded as strings.
export const RELATED_IMPORT_SOURCE_TYPES = [2, 11] as const;

// Mirrors frontend's SUBCONTRACT_RECEIPT_TYPES (receipt-types.ts) — the "Subcontract Receipts"
// nav entry's own curated subset: the four "Outside Process" types. Used here to gate the
// Script/Receipt Type mandatory-on-create validation (inventory-receipt.service.ts's create())
// to only these types — every other receipt type's create() behavior is unaffected.
export const SUBCONTRACT_RECEIPT_TYPES = [11, 12, 134, 133] as const;

// Moved here VERBATIM from item-statement.service.ts (same name, same entries) so every stock
// figure — Item Statement ledger AND inventory-card.service.ts's Stock on Hand — reads one map.
// (item-statement.service.ts imports InventoryCardService, so the map can't live there without a
// circular import.)
// DIRECTION_CLASS — the ONE centralized, authoritative business mapping for every screen/report
// that needs a Receipt Type's stock impact. Every consumer (running balance, warehouse balances,
// Detailed View dimension buckets, filtered summaries) derives from this single map via
// directionClassOf() below — never re-declare or infer a parallel mapping elsewhere.
//   IN  (stock increase): 2 (Purchase Receipt), 11 (Outside Process Receive), 133 (Outside
//        Process Sent Return).
//   OUT (stock decrease): 122 (Purchase Return), 12 (Outside Process Return), 134 (Outside
//        Process Sent), 140 (Manufacture Send).
//   TRANSFER: 17 (Warehouse Transfer) — decreases IM_ReceiptItem.OutWarehouseId, increases
//        IM_ReceiptItem.InWarehouseId (both columns exist at the LINE level, confirmed live
//        against the actual table — not assumed), net zero company-wide.
// CORRECTION (audit pass): 134 was previously mapped IN — corrected to OUT per the authoritative
// mapping (Type 134 = Outside Process Sent Receipt = stock decrease, goods leaving for outside
// processing). This was the one conflict found in this file; no other file declares a competing
// mapping for these types (confirmed by a repo-wide search before this fix) and Inventory Card's
// own stock formula (inventory-card.service.ts's stockSumSql) now consumes this same map too.
// Every other configured ReceiptType (16, 101, 10, 40, 132, 18, 22, 139, 120, 3 — see
// receipt-types.config.ts) has no confirmed direction and stays UNKNOWN/excluded — nothing beyond
// these 6 confirmed types + the pre-existing 2/122 is guessed at.
export type DirectionClass = 'IN' | 'OUT' | 'TRANSFER' | 'UNKNOWN';
export const DIRECTION_CLASS: Readonly<Record<number, DirectionClass>> = {
  2: 'IN', // Purchase Receipt
  122: 'OUT', // Purchase Return
  11: 'IN', // Outside Process Receive Receipt
  133: 'IN', // Outside Process Sent Return Receipt
  134: 'OUT', // Outside Process Sent Receipt
  12: 'OUT', // Outside Process Return Receipt
  140: 'OUT', // Manufacture Send Receipt
  17: 'TRANSFER', // Warehouse Transfer Receipt
};
export const directionClassOf = (receiptType: number): DirectionClass => DIRECTION_CLASS[receiptType] ?? 'UNKNOWN';
// Derived from DIRECTION_CLASS (never a separate list) — for SQL `ReceiptType IN (...)` filters.
const receiptTypesWhere = (cls: DirectionClass) =>
  Object.entries(DIRECTION_CLASS).filter(([, v]) => v === cls).map(([k]) => Number(k));
export const STOCK_IN_RECEIPT_TYPES: readonly number[] = receiptTypesWhere('IN');
export const STOCK_OUT_RECEIPT_TYPES: readonly number[] = receiptTypesWhere('OUT');
