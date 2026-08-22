// Frontend mirror of nexuscore-backend/src/modules/legacy-erp/contract-types.config.ts — same
// manual-sync convention as receipt-types.ts. See that backend file's comment: both contract
// kinds share the pre-existing SM_Contract/SM_ContractItem tables, differentiated by
// ReceiptType. The "00-" menu label prefix (see purchase/sale contract MenuItem titles) is a
// separate cosmetic display convention, independent of these receiptType values.
export interface ContractTypeConfig {
  receiptType: number;
  key: string;
  label: string;
  numberPrefix: string;
}

export const CONTRACT_TYPES: ContractTypeConfig[] = [
  { receiptType: 1, key: "purchase-contract", label: "Purchase Contract", numberPrefix: "PC" },
  { receiptType: 2, key: "sale-contract", label: "Sale Contract", numberPrefix: "SLC" },
];

export const getContractTypeConfig = (receiptType: number): ContractTypeConfig =>
  CONTRACT_TYPES.find((t) => t.receiptType === receiptType) ?? CONTRACT_TYPES[0];
