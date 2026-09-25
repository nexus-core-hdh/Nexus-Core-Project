import { snapshotVendorBills } from "@/lib/finance-erp/payable/vendor-bills";
import { snapshotVendorPayments } from "@/lib/finance-erp/payable/vendor-payments";
import { snapshotDebitNotes } from "@/lib/finance-erp/payable/debit-notes";

export interface LedgerEntry {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
}

export interface VendorLedgerResult {
  openingBalance: number;
  entries: (LedgerEntry & { balance: number })[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

const OPENING_BALANCES: Record<string, number> = { "v-1": 0, "v-2": 133400, "v-3": 890000, "v-4": 0, "v-5": 310500, "v-6": 175000 };

/** Vendor Ledger: bills increase what we owe (credit), payments/debit notes reduce it (debit) —
 *  standard AP ledger convention. Filters (date range) are applied to the derived entry list. */
export function getVendorLedger(vendorId: string, dateFrom?: string, dateTo?: string): VendorLedgerResult {
  const raw: LedgerEntry[] = [];

  for (const b of snapshotVendorBills()) {
    if (b.vendorId !== vendorId) continue;
    raw.push({ date: b.billDate, reference: b.billNumber, description: `Vendor Bill (Ref: ${b.referenceInvoice})`, debit: 0, credit: b.amount });
  }
  for (const p of snapshotVendorPayments()) {
    if (p.vendorId !== vendorId) continue;
    raw.push({ date: p.date, reference: p.paymentNumber, description: `Payment via ${p.paymentMethod} (${p.reference})`, debit: p.amount, credit: 0 });
  }
  for (const d of snapshotDebitNotes()) {
    if (d.vendorId !== vendorId) continue;
    raw.push({ date: d.date, reference: d.debitNoteNumber, description: `Debit Note — ${d.reason}`, debit: d.amount, credit: 0 });
  }

  raw.sort((a, b) => a.date.localeCompare(b.date));

  const opening = OPENING_BALANCES[vendorId] ?? 0;
  const filtered = raw.filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo));

  let balance = opening;
  let totalDebit = 0, totalCredit = 0;
  const entries = filtered.map((e) => {
    balance += e.credit - e.debit;
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { ...e, balance };
  });

  return { openingBalance: opening, entries, totalDebit, totalCredit, closingBalance: balance };
}
