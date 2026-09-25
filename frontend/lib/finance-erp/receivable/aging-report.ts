import { listSalesInvoicesSync, invoiceOutstanding, computeTotals } from "./sales-invoices";
import { daysBetween, todayIso } from "@/lib/finance-erp/utils/format";
import { customerName } from "@/lib/finance-erp/mock/master-data";

export type AgingBucket = "Current" | "1-30 Days" | "31-60 Days" | "61-90 Days" | "90+ Days";
export const AGING_BUCKETS: AgingBucket[] = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days"];

export interface AgingRow {
  customerId: string;
  customer: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  invoiceAmount: number;
  paid: number;
  outstanding: number;
  bucket: AgingBucket;
}

function bucketFor(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1-30 Days";
  if (daysPastDue <= 60) return "31-60 Days";
  if (daysPastDue <= 90) return "61-90 Days";
  return "90+ Days";
}

export function buildAgingReport(asOf: string = todayIso(), customerId?: string): AgingRow[] {
  const rows: AgingRow[] = [];
  for (const inv of listSalesInvoicesSync()) {
    if (inv.status === "Paid" || inv.status === "Cancelled") continue;
    if (customerId && inv.customerId !== customerId) continue;
    const outstanding = invoiceOutstanding(inv);
    if (outstanding <= 0) continue;
    const daysPastDue = daysBetween(inv.dueDate, asOf);
    rows.push({
      customerId: inv.customerId,
      customer: customerName(inv.customerId),
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.date,
      dueDate: inv.dueDate,
      invoiceAmount: computeTotals(inv.items).grandTotal,
      paid: inv.paidAmount,
      outstanding,
      bucket: bucketFor(daysPastDue),
    });
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function bucketTotals(rows: AgingRow[]): Record<AgingBucket, number> {
  const totals = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  for (const r of rows) totals[r.bucket] += r.outstanding;
  return totals;
}
