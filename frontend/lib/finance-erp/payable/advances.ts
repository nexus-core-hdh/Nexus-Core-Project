import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { VENDORS, PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export interface SupplierAdvance {
  id: string;
  advanceNumber: string;
  vendorId: string;
  date: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  adjustedAmount: number;
  status: FinanceStatus; // Open / Adjusted / Closed
}

function remaining(a: SupplierAdvance) { return a.amount - a.adjustedAmount; }

const SEED: SupplierAdvance[] = [
  { id: "adv-1", advanceNumber: "ADV-2026-0001", vendorId: VENDORS[0].id, date: "2026-07-15", amount: 300000, paymentMethod: "Bank Transfer", reference: "MCB-ADV-001", adjustedAmount: 300000, status: "Closed" },
  { id: "adv-2", advanceNumber: "ADV-2026-0002", vendorId: VENDORS[2].id, date: "2026-08-01", amount: 150000, paymentMethod: "Cheque", reference: "UBL-ADV-002", adjustedAmount: 60000, status: "Adjusted" },
  { id: "adv-3", advanceNumber: "ADV-2026-0003", vendorId: VENDORS[4].id, date: "2026-08-28", amount: 220000, paymentMethod: "Online Transfer", reference: "HBL-ADV-003", adjustedAmount: 0, status: "Open" },
];

const store = createMockStore<SupplierAdvance>(SEED);
let seq = 600;

export async function getSupplierAdvances() { return store.list(); }
export async function getSupplierAdvance(id: string) { return store.get(id); }

export async function createSupplierAdvance(data: Omit<SupplierAdvance, "id" | "advanceNumber">) {
  assertRequired(data.vendorId, "Supplier");
  if (data.amount <= 0) throw new FinanceValidationError("Amount must be greater than zero.");
  seq += 1;
  const record: SupplierAdvance = { ...data, id: makeId("adv"), advanceNumber: formatDocNumber("ADV", seq) };
  return store.create(record);
}

export async function updateSupplierAdvance(id: string, patch: Partial<SupplierAdvance>) {
  return store.update(id, patch);
}

export async function deleteSupplierAdvance(id: string) {
  return store.remove(id);
}

export { remaining as remainingAdvance, PAYMENT_METHODS };
