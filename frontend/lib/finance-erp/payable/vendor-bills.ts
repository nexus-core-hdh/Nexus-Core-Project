import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import { addDaysIso as addDays, todayIso } from "@/lib/finance-erp/utils/format";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export interface VendorBill {
  id: string;
  billNumber: string;
  vendorId: string;
  billDate: string;
  dueDate: string;
  referenceInvoice: string;
  amount: number;
  paidAmount: number;
  paymentStatus: FinanceStatus; // Pending / Partially Paid / Paid
  approvalStatus: FinanceStatus; // Pending Approval / Approved / Rejected
}

function bill(id: string, seq: number, vendorId: string, billDate: string, dueDays: number, referenceInvoice: string, amount: number, paidAmount: number, approvalStatus: FinanceStatus): VendorBill {
  const paymentStatus: FinanceStatus = paidAmount <= 0 ? "Pending" : paidAmount >= amount ? "Paid" : "Partially Paid";
  return { id, billNumber: formatDocNumber("VB", seq), vendorId, billDate, dueDate: addDays(billDate, dueDays), referenceInvoice, amount, paidAmount, paymentStatus, approvalStatus };
}

const SEED: VendorBill[] = [
  bill("vb-1", 201, VENDORS[0].id, "2026-08-06", 30, "PI-2026-0001", 512000, 512000, "Approved"),
  bill("vb-2", 202, VENDORS[1].id, "2026-08-11", 45, "PI-2026-0002", 233400, 100000, "Approved"),
  bill("vb-3", 203, VENDORS[2].id, "2026-07-20", 15, "PI-2026-0003", 890000, 0, "Approved"),
  bill("vb-4", 204, VENDORS[3].id, "2026-08-23", 30, "PI-2026-0004", 620000, 620000, "Approved"),
  bill("vb-5", 205, VENDORS[4].id, "2026-09-02", 60, "PI-2026-0005", 310500, 0, "Pending Approval"),
  bill("vb-6", 206, VENDORS[0].id, "2026-09-05", 30, "PI-2026-0006", 145000, 0, "Draft" as FinanceStatus),
  bill("vb-7", 207, VENDORS[5].id, "2026-07-10", 30, "PI-2025-0912", 175000, 0, "Approved"),
];

const store = createMockStore<VendorBill>(SEED);
let seq = 300;

export async function getVendorBills() { return store.list(); }
export async function getVendorBill(id: string) { return store.get(id); }
export function snapshotVendorBills() { return store.snapshot(); }

export async function createVendorBill(data: Omit<VendorBill, "id" | "billNumber" | "paymentStatus">) {
  assertRequired(data.vendorId, "Vendor");
  assertRequired(data.billDate, "Bill Date");
  seq += 1;
  const paymentStatus: FinanceStatus = data.paidAmount <= 0 ? "Pending" : data.paidAmount >= data.amount ? "Paid" : "Partially Paid";
  const record: VendorBill = { ...data, id: makeId("vb"), billNumber: formatDocNumber("VB", seq), paymentStatus };
  return store.create(record);
}

export async function updateVendorBill(id: string, patch: Partial<VendorBill>) {
  return store.update(id, patch);
}

export async function deleteVendorBill(id: string) {
  return store.remove(id);
}

export function isOverdue(b: VendorBill): boolean {
  return b.paymentStatus !== "Paid" && b.dueDate < todayIso();
}
