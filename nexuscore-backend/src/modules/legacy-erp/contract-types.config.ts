// "00-Purchase Contract" / "00-Sale Contract" — both built on the SAME pre-existing SM_Contract /
// SM_ContractItem / SM_ContractAttachment tables (confirmed via information_schema: 0 rows, no
// prior code reference anywhere in this app — first writer, not a duplicate of anything),
// differentiated only by ReceiptType, the exact same generic pattern receipt-types.config.ts
// already established for IM_Receipt. SM_Contract already carries a ReceiptType column (unlike
// the simpler IM_PurchaseContract/SM_SalesContract "definition" tables, which have no line-item/
// attachment child tables at all) — it's the one candidate table shaped to hold both contract
// kinds as rows differentiated by type, so no schema change was needed.
//
// receiptType 1/2 are first-writer assignments (0 existing rows, no legacy reference screenshot
// for this table) — provisional in the same sense IM_Receipt's very first revision documented,
// not sourced from any legacy numbering. The "00-" MENU LABEL PREFIX is a separate, purely
// cosmetic display convention (see scripts/seed-contract-menu-items.ts) — decoupled from these
// internal ReceiptType values, same way MenuItem.title has always been independent of the href's
// query param.
export interface ContractTypeConfig {
  receiptType: number;
  key: string;
  label: string;
  numberPrefix: string;
}

export const CONTRACT_TYPES: ContractTypeConfig[] = [
  { receiptType: 1, key: 'purchase-contract', label: 'Purchase Contract', numberPrefix: 'PC' },
  { receiptType: 2, key: 'sale-contract', label: 'Sale Contract', numberPrefix: 'SLC' },
];

export const getContractTypeConfig = (receiptType: number): ContractTypeConfig | undefined =>
  CONTRACT_TYPES.find((t) => t.receiptType === receiptType);
