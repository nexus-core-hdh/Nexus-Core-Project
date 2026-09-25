import { VENDORS, CUSTOMERS } from "@/lib/finance-erp/mock/master-data";

// Dashboard-only mock data (spec section 1). Self-contained rather than aggregated live from the
// other domain mock services — keeps the dashboard fast/independent of module load order, exactly
// how a real BI/reporting widget would eventually be backed by its own summary endpoint.

export const KPIS = {
  totalReceivables: 18_450_000,
  totalPayables: 12_760_000,
  cashAndBank: 24_950_000,
  outstandingInvoices: 236,
  overdueReceivables: 3_120_000,
  overduePayables: 1_840_000,
  currentMonthRevenue: 9_820_000,
  currentMonthExpenses: 6_410_000,
  netProfit: 3_410_000,
  taxPayable: 1_275_000,
};

export const REVENUE_VS_EXPENSES = [
  { month: "Apr", revenue: 7.8, expenses: 5.6 },
  { month: "May", revenue: 8.4, expenses: 6.1 },
  { month: "Jun", revenue: 8.1, expenses: 5.9 },
  { month: "Jul", revenue: 9.0, expenses: 6.4 },
  { month: "Aug", revenue: 9.4, expenses: 6.7 },
  { month: "Sep", revenue: 9.82, expenses: 6.41 },
];

export const RECEIVABLES_VS_PAYABLES = [
  { month: "Apr", receivables: 14.2, payables: 10.1 },
  { month: "May", receivables: 15.6, payables: 10.8 },
  { month: "Jun", receivables: 16.1, payables: 11.4 },
  { month: "Jul", receivables: 17.3, payables: 11.9 },
  { month: "Aug", receivables: 17.9, payables: 12.3 },
  { month: "Sep", receivables: 18.45, payables: 12.76 },
];

export const CASH_FLOW_TREND = [
  { month: "Apr", inflow: 8.9, outflow: 7.2 },
  { month: "May", inflow: 9.6, outflow: 7.8 },
  { month: "Jun", inflow: 9.1, outflow: 7.5 },
  { month: "Jul", inflow: 10.2, outflow: 8.1 },
  { month: "Aug", inflow: 10.8, outflow: 8.6 },
  { month: "Sep", inflow: 11.4, outflow: 8.9 },
];

export const MONTHLY_SALES = [
  { month: "Apr", value: 7.8 }, { month: "May", value: 8.4 }, { month: "Jun", value: 8.1 },
  { month: "Jul", value: 9.0 }, { month: "Aug", value: 9.4 }, { month: "Sep", value: 9.82 },
];

export const MONTHLY_PURCHASES = [
  { month: "Apr", value: 5.1 }, { month: "May", value: 5.6 }, { month: "Jun", value: 5.3 },
  { month: "Jul", value: 5.9 }, { month: "Aug", value: 6.2 }, { month: "Sep", value: 6.5 },
];

export const AGING_DISTRIBUTION = [
  { bucket: "Current", value: 8_200_000 },
  { bucket: "1-30 Days", value: 5_100_000 },
  { bucket: "31-60 Days", value: 2_850_000 },
  { bucket: "61-90 Days", value: 1_400_000 },
  { bucket: "90+ Days", value: 900_000 },
];

export const RECENT_SALES_INVOICES = [
  { id: "SI-2026-0142", customer: CUSTOMERS[0].name, date: "2026-09-05", amount: 845_000, status: "Paid" },
  { id: "SI-2026-0141", customer: CUSTOMERS[2].name, date: "2026-09-04", amount: 1_260_000, status: "Partially Paid" },
  { id: "SI-2026-0140", customer: CUSTOMERS[1].name, date: "2026-09-03", amount: 392_000, status: "Overdue" },
  { id: "SI-2026-0139", customer: CUSTOMERS[3].name, date: "2026-09-02", amount: 675_500, status: "Pending Approval" },
  { id: "SI-2026-0138", customer: CUSTOMERS[4].name, date: "2026-09-01", amount: 210_000, status: "Paid" },
];

export const RECENT_PURCHASE_INVOICES = [
  { id: "PI-2026-0098", vendor: VENDORS[0].name, date: "2026-09-05", amount: 512_000, status: "Matched" },
  { id: "PI-2026-0097", vendor: VENDORS[2].name, date: "2026-09-04", amount: 233_400, status: "Partially Matched" },
  { id: "PI-2026-0096", vendor: VENDORS[1].name, date: "2026-09-03", amount: 890_000, status: "Mismatch" },
  { id: "PI-2026-0095", vendor: VENDORS[3].name, date: "2026-09-02", amount: 145_000, status: "Pending" },
];

export const PENDING_PAYMENTS = [
  { id: "VB-2026-0210", vendor: VENDORS[0].name, dueDate: "2026-09-12", amount: 620_000 },
  { id: "VB-2026-0207", vendor: VENDORS[4].name, dueDate: "2026-09-15", amount: 310_500 },
  { id: "VB-2026-0201", vendor: VENDORS[1].name, dueDate: "2026-09-09", amount: 780_000 },
];

export const PENDING_RECEIPTS = [
  { id: "SI-2026-0135", customer: CUSTOMERS[2].name, dueDate: "2026-09-10", amount: 1_100_000 },
  { id: "SI-2026-0129", customer: CUSTOMERS[5].name, dueDate: "2026-09-11", amount: 425_000 },
  { id: "SI-2026-0122", customer: CUSTOMERS[0].name, dueDate: "2026-09-08", amount: 265_000 },
];

export const OVERDUE_INVOICES = [
  { id: "SI-2026-0140", party: CUSTOMERS[1].name, daysOverdue: 14, amount: 392_000 },
  { id: "VB-2026-0188", party: VENDORS[5].name, daysOverdue: 22, amount: 175_000 },
  { id: "SI-2026-0121", party: CUSTOMERS[3].name, daysOverdue: 38, amount: 540_000 },
];

export const PENDING_APPROVALS = [
  { id: "PO-2026-0311", type: "Purchase Order", raisedBy: "Bilal Khan", amount: 1_450_000 },
  { id: "JE-2026-0087", type: "Journal Entry", raisedBy: "Hina Sheikh", amount: 320_000 },
  { id: "AR-2026-0044", type: "Asset Revaluation", raisedBy: "Sana Malik", amount: 2_100_000 },
];

export const RECENT_JOURNAL_ENTRIES = [
  { id: "JE-2026-0091", date: "2026-09-06", description: "Depreciation for August 2026", debit: 480_000, credit: 480_000, status: "Posted" },
  { id: "JE-2026-0090", date: "2026-09-05", description: "Bank charges - MCB Main Account", debit: 3_500, credit: 3_500, status: "Posted" },
  { id: "JE-2026-0089", date: "2026-09-04", description: "Salary accrual - September", debit: 2_150_000, credit: 2_150_000, status: "Pending Approval" },
];
