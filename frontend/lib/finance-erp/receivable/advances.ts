import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { todayIso } from "@/lib/finance-erp/utils/format";
import { PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";

export type AdvanceStatus = "Open" | "Partially Adjusted" | "Adjusted" | "Cancelled";

export interface CustomerAdvance {
  id: string;
  advanceNumber: string;
  date: string;
  customerId: string;
  amount: number;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  reference: string;
  adjustedAmount: number;
  status: AdvanceStatus;
}

const SEED: CustomerAdvance[] = [
  { id: "adv-1", advanceNumber: formatDocNumber("ADVC", 1), date: "2026-08-01", customerId: "c-4", amount: 500000, paymentMethod: "Bank Transfer", reference: "TRF-81020", adjustedAmount: 200000, status: "Partially Adjusted" },
  { id: "adv-2", advanceNumber: formatDocNumber("ADVC", 2), date: "2026-08-10", customerId: "c-1", amount: 300000, paymentMethod: "Cheque", reference: "CHQ-40012", adjustedAmount: 300000, status: "Adjusted" },
  { id: "adv-3", advanceNumber: formatDocNumber("ADVC", 3), date: "2026-08-22", customerId: "c-5", amount: 150000, paymentMethod: "Cash", reference: "", adjustedAmount: 0, status: "Open" },
  { id: "adv-4", advanceNumber: formatDocNumber("ADVC", 4), date: "2026-09-02", customerId: "c-3", amount: 750000, paymentMethod: "Online Transfer", reference: "ONL-9001", adjustedAmount: 0, status: "Open" },
];

const store = createMockStore<CustomerAdvance>(SEED);
let seq = SEED.length;

export const getAdvances = () => store.list();

function validateAdvance(input: Omit<CustomerAdvance, "id" | "advanceNumber">): void {
  assertRequired(input.customerId, "Customer");
  if (!(input.amount > 0)) throw new Error("Amount must be greater than zero.");
  if (input.adjustedAmount > input.amount + 0.01) throw new Error("Adjusted amount cannot exceed the advance amount.");
}

export async function createAdvance(input: Omit<CustomerAdvance, "id" | "advanceNumber">): Promise<CustomerAdvance> {
  validateAdvance(input);
  seq += 1;
  return store.create({ ...input, id: makeId("adv"), advanceNumber: formatDocNumber("ADVC", seq) });
}

export async function updateAdvance(id: string, patch: Partial<CustomerAdvance>): Promise<CustomerAdvance> {
  if (patch.amount !== undefined || patch.adjustedAmount !== undefined || patch.customerId !== undefined) {
    const existing = store.snapshot().find((r) => r.id === id);
    if (existing) validateAdvance({ ...existing, ...patch });
  }
  return store.update(id, patch);
}

export async function deleteAdvance(id: string): Promise<void> {
  return store.remove(id);
}

// Clamped like invoiceOutstanding()/receiptUnallocated() elsewhere in this domain — an
// over-entered Adjusted Amount must never surface as a negative "Remaining" figure.
export function advanceRemaining(a: CustomerAdvance): number {
  return Math.max(0, a.amount - a.adjustedAmount);
}

export function newAdvanceDraft(): Omit<CustomerAdvance, "id" | "advanceNumber"> {
  return { date: todayIso(), customerId: "", amount: 0, paymentMethod: "Bank Transfer", reference: "", adjustedAmount: 0, status: "Open" };
}
