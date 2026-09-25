import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { snapshotPurchaseOrders, computeTotals, type PurchaseOrder } from "@/lib/finance-erp/payable/purchase-orders";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export type MatchStatus = "Matched" | "Partially Matched" | "Mismatch" | "Pending";

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  poId: string | null;
  invoiceDate: string;
  grnNumber: string;
  poAmount: number;
  grnAmount: number;
  invoiceAmount: number;
  taxAmount: number;
  paymentStatus: FinanceStatus; // Unpaid via "Pending" style / Partially Paid / Paid
  status: FinanceStatus; // approval workflow status
}

/** Deterministic mock 3-way match: PO amount vs GRN amount (seeded with a small variance) vs
 *  Invoice amount. Equal (within 0.5%) -> Matched, within 5% -> Partially Matched, else Mismatch;
 *  no PO selected at all -> Pending. */
export function matchStatusOf(poAmount: number | null, grnAmount: number, invoiceAmount: number): MatchStatus {
  if (poAmount == null) return "Pending";
  const diffPoGrn = Math.abs(poAmount - grnAmount) / poAmount;
  const diffGrnInv = Math.abs(grnAmount - invoiceAmount) / (grnAmount || 1);
  const maxDiff = Math.max(diffPoGrn, diffGrnInv);
  if (maxDiff <= 0.005) return "Matched";
  if (maxDiff <= 0.05) return "Partially Matched";
  return "Mismatch";
}

export function poAmountOf(po: PurchaseOrder | undefined): number {
  return po ? computeTotals(po.items).grandTotal : 0;
}

function seedRow(id: string, seq: number, po: PurchaseOrder, variancePct: number, invoiceVariancePct: number, paymentStatus: FinanceStatus, status: FinanceStatus): PurchaseInvoice {
  const poAmount = poAmountOf(po);
  const grnAmount = Math.round(poAmount * (1 + variancePct));
  const invoiceAmount = Math.round(grnAmount * (1 + invoiceVariancePct));
  return {
    id, invoiceNumber: formatDocNumber("PI", seq), vendorId: po.vendorId, poId: po.id,
    invoiceDate: po.deliveryDate, grnNumber: `GRN-2026-${String(seq).padStart(4, "0")}`,
    poAmount, grnAmount, invoiceAmount, taxAmount: Math.round(invoiceAmount * 0.18) - Math.round(invoiceAmount * 0.18 / 1.18),
    paymentStatus, status,
  };
}

function buildSeed(): PurchaseInvoice[] {
  const pos = snapshotPurchaseOrders();
  const rows: PurchaseInvoice[] = [];
  if (pos[0]) rows.push(seedRow("pi-1", 1, pos[0], 0, 0, "Paid", "Approved"));
  if (pos[1]) rows.push(seedRow("pi-2", 2, pos[1], 0.02, 0.01, "Partially Paid", "Approved"));
  if (pos[2]) rows.push(seedRow("pi-3", 3, pos[2], 0.08, 0.03, "Pending", "Pending Approval"));
  if (pos[4]) rows.push(seedRow("pi-4", 4, pos[4], 0, 0, "Paid", "Approved"));
  if (pos[6]) rows.push(seedRow("pi-5", 5, pos[6], 0.01, 0, "Paid", "Approved"));
  rows.push({
    id: "pi-6", invoiceNumber: formatDocNumber("PI", 6), vendorId: pos[3]?.vendorId ?? "v-4", poId: null,
    invoiceDate: "2026-09-04", grnNumber: "", poAmount: 0, grnAmount: 0, invoiceAmount: 145000, taxAmount: 22119,
    paymentStatus: "Pending", status: "Draft",
  });
  return rows;
}

const store = createMockStore<PurchaseInvoice>(buildSeed());
let seq = 100;

export async function getPurchaseInvoices() { return store.list(); }
export async function getPurchaseInvoice(id: string) { return store.get(id); }

export async function createPurchaseInvoice(data: Omit<PurchaseInvoice, "id" | "invoiceNumber">) {
  assertRequired(data.vendorId, "Vendor");
  assertRequired(data.invoiceDate, "Invoice Date");
  seq += 1;
  const record: PurchaseInvoice = { ...data, id: makeId("pi"), invoiceNumber: formatDocNumber("PI", seq) };
  return store.create(record);
}

export async function updatePurchaseInvoice(id: string, patch: Partial<PurchaseInvoice>) {
  return store.update(id, patch);
}

export async function deletePurchaseInvoice(id: string) {
  return store.remove(id);
}

export const MATCH_STATUSES: MatchStatus[] = ["Matched", "Partially Matched", "Mismatch", "Pending"];
export const PAYMENT_STATUSES: FinanceStatus[] = ["Pending", "Partially Paid", "Paid"];
