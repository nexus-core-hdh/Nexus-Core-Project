// Shared line-item shape + total math for the Receivable domain (Sales Order, Sales Invoice,
// Credit Note, Sales Tax Invoice all use the same Qty/Rate/Discount%/Tax% shape).
import { makeId } from "@/lib/finance-erp/mock/create-store";

export interface DocLineItem {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  rate: number;
  discountPct: number;
  taxPct: number;
}

export function emptyLine(): DocLineItem {
  return { id: makeId("ln"), itemCode: "", itemName: "", quantity: 1, rate: 0, discountPct: 0, taxPct: 0 };
}

export function lineAmount(l: DocLineItem): number {
  const gross = l.quantity * l.rate;
  const afterDiscount = gross - gross * (l.discountPct / 100);
  return afterDiscount + afterDiscount * (l.taxPct / 100);
}

export interface Totals { subtotal: number; discount: number; tax: number; grandTotal: number }

export function computeTotals(items: DocLineItem[]): Totals {
  let subtotal = 0, discount = 0, tax = 0;
  for (const l of items) {
    const gross = l.quantity * l.rate;
    const disc = gross * (l.discountPct / 100);
    const afterDisc = gross - disc;
    const taxAmt = afterDisc * (l.taxPct / 100);
    subtotal += gross;
    discount += disc;
    tax += taxAmt;
  }
  return { subtotal, discount, tax, grandTotal: subtotal - discount + tax };
}
