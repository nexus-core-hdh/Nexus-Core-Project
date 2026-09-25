import { listSalesInvoicesSync, computeTotals } from "./sales-invoices";
import { listCustomerReceiptsSync } from "./customer-receipts";
import { listCreditNotesSync, computeTotals as cnTotals } from "./credit-notes";

export interface LedgerEntry {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
}

export interface LedgerResult {
  entries: (LedgerEntry & { balance: number })[];
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

/** Builds a running Customer Ledger for one customer from this domain's own Sales Invoice /
 *  Customer Receipt / Credit Note mock stores — invoices are debits, receipts and credit notes
 *  are credits. `openingBalance` is a flat mock figure per customer since no prior-period ledger
 *  exists in this frontend-only phase. */
export function buildCustomerLedger(customerId: string, dateFrom?: string, dateTo?: string): LedgerResult {
  const openingBalance = 0;
  const raw: LedgerEntry[] = [];

  for (const inv of listSalesInvoicesSync()) {
    if (inv.customerId !== customerId) continue;
    raw.push({ date: inv.date, reference: inv.invoiceNumber, description: "Sales Invoice", debit: computeTotals(inv.items).grandTotal, credit: 0 });
  }
  for (const cn of listCreditNotesSync()) {
    if (cn.customerId !== customerId || cn.status === "Cancelled" || cn.status === "Draft") continue;
    raw.push({ date: cn.date, reference: cn.creditNoteNumber, description: `Credit Note — ${cn.reason}`, debit: 0, credit: cnTotals(cn.items).grandTotal });
  }
  for (const r of listCustomerReceiptsSync()) {
    if (r.customerId !== customerId || r.status !== "Posted") continue;
    raw.push({ date: r.date, reference: r.receiptNumber, description: `Receipt — ${r.paymentMethod}`, debit: 0, credit: r.amount });
  }

  raw.sort((a, b) => a.date.localeCompare(b.date));
  const filtered = raw.filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo));

  let balance = openingBalance;
  let totalDebit = 0, totalCredit = 0;
  const entries = filtered.map((e) => {
    balance += e.debit - e.credit;
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { ...e, balance };
  });

  return { entries, openingBalance, totalDebit, totalCredit, closingBalance: balance };
}
