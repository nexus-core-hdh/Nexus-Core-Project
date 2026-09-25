export interface StatementLine { label: string; current: number; prior: number; indent?: number; bold?: boolean; isTotal?: boolean; }

export const PROFIT_AND_LOSS: StatementLine[] = [
  { label: "Sales Revenue - Local", current: 8_450_000, prior: 7_820_000, indent: 1 },
  { label: "Sales Revenue - Export", current: 1_370_000, prior: 1_180_000, indent: 1 },
  { label: "Revenue", current: 9_820_000, prior: 9_000_000, bold: true },
  { label: "Cost of Sales", current: -6_120_000, prior: -5_680_000 },
  { label: "Gross Profit", current: 3_700_000, prior: 3_320_000, bold: true, isTotal: true },
  { label: "Administrative Expenses", current: -1_180_000, prior: -1_050_000, indent: 1 },
  { label: "Selling & Distribution Expenses", current: -640_000, prior: -590_000, indent: 1 },
  { label: "Depreciation Expense", current: -480_000, prior: -455_000, indent: 1 },
  { label: "Operating Expenses", current: -2_300_000, prior: -2_095_000, bold: true },
  { label: "Operating Profit", current: 1_400_000, prior: 1_225_000, bold: true, isTotal: true },
  { label: "Other Income", current: 68_500, prior: 52_000 },
  { label: "Financial Charges", current: -58_500, prior: -61_000 },
  { label: "Net Profit", current: 1_410_000, prior: 1_216_000, bold: true, isTotal: true },
];

export const BALANCE_SHEET_ASSETS: StatementLine[] = [
  { label: "Cash & Bank", current: 24_950_000, prior: 21_400_000, indent: 1 },
  { label: "Accounts Receivable", current: 18_450_000, prior: 16_900_000, indent: 1 },
  { label: "Advance to Suppliers", current: 2_150_000, prior: 1_980_000, indent: 1 },
  { label: "Inventory", current: 11_200_000, prior: 10_450_000, indent: 1 },
  { label: "Current Assets", current: 56_750_000, prior: 50_730_000, bold: true },
  { label: "Property, Plant & Equipment (net)", current: 32_400_000, prior: 30_100_000, indent: 1 },
  { label: "Fixed Assets", current: 32_400_000, prior: 30_100_000, bold: true },
  { label: "Total Assets", current: 89_150_000, prior: 80_830_000, bold: true, isTotal: true },
];

export const BALANCE_SHEET_LIABILITIES: StatementLine[] = [
  { label: "Accounts Payable", current: 12_760_000, prior: 11_900_000, indent: 1 },
  { label: "Sales Tax Payable", current: 1_275_000, prior: 1_080_000, indent: 1 },
  { label: "WHT Payable", current: 340_000, prior: 298_000, indent: 1 },
  { label: "Advance from Customers", current: 1_850_000, prior: 1_620_000, indent: 1 },
  { label: "Current Liabilities", current: 16_225_000, prior: 14_898_000, bold: true },
  { label: "Total Liabilities", current: 16_225_000, prior: 14_898_000, bold: true, isTotal: true },
];

export const BALANCE_SHEET_EQUITY: StatementLine[] = [
  { label: "Share Capital", current: 40_000_000, prior: 40_000_000, indent: 1 },
  { label: "Retained Earnings", current: 32_925_000, prior: 25_932_000, indent: 1 },
  { label: "Total Equity", current: 72_925_000, prior: 65_932_000, bold: true, isTotal: true },
];

export const CASH_FLOW_OPERATING: StatementLine[] = [
  { label: "Net Profit", current: 1_410_000, prior: 1_216_000, indent: 1 },
  { label: "Add: Depreciation", current: 480_000, prior: 455_000, indent: 1 },
  { label: "Increase in Receivables", current: -1_550_000, prior: -980_000, indent: 1 },
  { label: "Increase in Inventory", current: -750_000, prior: -420_000, indent: 1 },
  { label: "Increase in Payables", current: 860_000, prior: 610_000, indent: 1 },
  { label: "Net Cash from Operating Activities", current: 450_000, prior: 881_000, bold: true, isTotal: true },
];

export const CASH_FLOW_INVESTING: StatementLine[] = [
  { label: "Purchase of Fixed Assets", current: -2_780_000, prior: -1_950_000, indent: 1 },
  { label: "Proceeds from Asset Disposal", current: 320_000, prior: 0, indent: 1 },
  { label: "Net Cash used in Investing Activities", current: -2_460_000, prior: -1_950_000, bold: true, isTotal: true },
];

export const CASH_FLOW_FINANCING: StatementLine[] = [
  { label: "Bank Loan Proceeds", current: 3_000_000, prior: 0, indent: 1 },
  { label: "Loan Repayment", current: -500_000, prior: -400_000, indent: 1 },
  { label: "Net Cash from Financing Activities", current: 2_500_000, prior: -400_000, bold: true, isTotal: true },
];

export const CASH_FLOW_SUMMARY = {
  openingCash: { current: 22_960_000, prior: 22_429_000 },
  netCashFlow: { current: 490_000, prior: -1_469_000 },
  closingCash: { current: 23_450_000, prior: 20_960_000 },
};
