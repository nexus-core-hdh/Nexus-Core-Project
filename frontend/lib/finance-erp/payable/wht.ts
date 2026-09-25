import { TAX_RATES, vendorName } from "@/lib/finance-erp/mock/master-data";
import { snapshotVendorBills } from "@/lib/finance-erp/payable/vendor-bills";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export interface WhtPurchaseRow {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  taxType: string;
  taxRate: number;
  grossAmount: number;
  whtAmount: number;
  netPayable: number;
  status: FinanceStatus; // Deducted / Deposited(Posted) / Pending
}

const WHT_RATES = TAX_RATES.filter((t) => t.type === "WHT");

/** Derived report data — one WHT row per Vendor Bill, cycling through the seeded WHT tax rates
 *  deterministically by bill index so the report always has realistic, stable data. */
export function getWhtOnPurchases(): WhtPurchaseRow[] {
  const bills = snapshotVendorBills();
  return bills.map((b, i) => {
    const rate = WHT_RATES[i % WHT_RATES.length];
    const whtAmount = Math.round((b.amount * rate.rate) / 100);
    const status: FinanceStatus = b.paymentStatus === "Paid" ? "Posted" : b.paymentStatus === "Partially Paid" ? "Approved" : "Pending";
    return {
      id: `wht-${b.id}`, vendorId: b.vendorId, invoiceNumber: b.referenceInvoice, taxType: rate.name,
      taxRate: rate.rate, grossAmount: b.amount, whtAmount, netPayable: b.amount - whtAmount, status,
    };
  });
}

export { vendorName };
