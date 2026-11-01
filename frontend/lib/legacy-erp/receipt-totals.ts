// Receipt document totals for the invoice-style Receipt Invoice screens (receipt-invoices/page.tsx),
// built from the line amounts the receipt line grid already computes (inventory-receipt-line-grid.tsx
// recalc: itemTotal = priced quantity × Price; netItemTotal = itemTotal, + VAT when Exclusive) the
// same way Purchase Order's grid builds its header totals (purchase-order-line-grid.tsx): Subtotal =
// sum of the pre-VAT line amounts, VAT Total = what VAT adds on top (nothing for an Inclusive line),
// Grand Total = sum of the line net totals (the grid's own "Total Amount").

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export interface ReceiptTotals {
  /** Lines on the document (the grid's blank starter row excluded). */
  items: number;
  totalQuantity: number;
  totalGrossQuantity: number;
  subTotal: number;
  vatTotal: number;
  grandTotal: number;
}

export function receiptTotals(lines: { quantity: unknown; grossQuantity: unknown; itemTotal: unknown; netItemTotal: unknown }[]): ReceiptTotals {
  let totalQuantity = 0, totalGrossQuantity = 0, subTotal = 0, grandTotal = 0;
  for (const l of lines) {
    totalQuantity += num(l.quantity);
    totalGrossQuantity += num(l.grossQuantity);
    subTotal += num(l.itemTotal);
    grandTotal += num(l.netItemTotal);
  }
  return { items: lines.length, totalQuantity, totalGrossQuantity, subTotal, vatTotal: grandTotal - subTotal, grandTotal };
}

export const EMPTY_RECEIPT_TOTALS: ReceiptTotals = { items: 0, totalQuantity: 0, totalGrossQuantity: 0, subTotal: 0, vatTotal: 0, grandTotal: 0 };
