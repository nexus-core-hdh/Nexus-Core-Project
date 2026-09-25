import { VENDORS, CUSTOMERS, TAX_RATES } from "@/lib/finance-erp/mock/master-data";

export interface SalesTaxSummary {
  totalSales: number;
  taxableSales: number;
  zeroRatedSales: number;
  outputTax: number;
  inputTax: number;
}

export const SALES_TAX_SUMMARY: SalesTaxSummary = {
  totalSales: 9_820_000,
  taxableSales: 8_450_000,
  zeroRatedSales: 1_370_000,
  outputTax: 1_275_000,
  inputTax: 812_000,
};

export interface WhtRow {
  id: string;
  party: string;
  partyType: "Vendor" | "Customer";
  taxType: string;
  rate: number;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  period: string;
  status: "Pending" | "Deducted" | "Deposited";
}

export const WHT_ROWS: WhtRow[] = [
  { id: "wht-1", party: VENDORS[0].name, partyType: "Vendor", taxType: "WHT on Supplies (Filer)", rate: 4.5, grossAmount: 512000, taxAmount: 23040, netAmount: 488960, period: "Sep 2026", status: "Deposited" },
  { id: "wht-2", party: VENDORS[1].name, partyType: "Vendor", taxType: "WHT on Supplies (Filer)", rate: 4.5, grossAmount: 233400, taxAmount: 10503, netAmount: 222897, period: "Sep 2026", status: "Deducted" },
  { id: "wht-3", party: VENDORS[5].name, partyType: "Vendor", taxType: "WHT on Supplies (Non-Filer)", rate: 9, grossAmount: 175000, taxAmount: 15750, netAmount: 159250, period: "Sep 2026", status: "Pending" },
  { id: "wht-4", party: VENDORS[3].name, partyType: "Vendor", taxType: "WHT on Services (Filer)", rate: 10, grossAmount: 145000, taxAmount: 14500, netAmount: 130500, period: "Aug 2026", status: "Deposited" },
  { id: "wht-5", party: CUSTOMERS[2].name, partyType: "Customer", taxType: "WHT on Supplies (Filer)", rate: 4.5, grossAmount: 1260000, taxAmount: 56700, netAmount: 1203300, period: "Sep 2026", status: "Deducted" },
];

export { TAX_RATES };
