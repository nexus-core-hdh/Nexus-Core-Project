import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { todayIso } from "@/lib/finance-erp/utils/format";
import { PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";

export type CustomerReceiptStatus = "Draft" | "Posted" | "Cancelled";

export interface ReceiptAllocation {
  invoiceId: string;
  amount: number;
}

export interface CustomerReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  customerId: string;
  amount: number;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  bankAccountId: string;
  reference: string;
  notes: string;
  allocations: ReceiptAllocation[];
  status: CustomerReceiptStatus;
}

const SEED: CustomerReceipt[] = [
  { id: "cr-1", receiptNumber: formatDocNumber("CR", 1), date: "2026-09-05", customerId: "c-1", amount: 845000, paymentMethod: "Bank Transfer", bankAccountId: "bank-1", reference: "TRF-88213", notes: "Full settlement of SI-2026-0142", allocations: [{ invoiceId: "si-1", amount: 845000 }], status: "Posted" },
  { id: "cr-2", receiptNumber: formatDocNumber("CR", 2), date: "2026-09-04", customerId: "c-3", amount: 700000, paymentMethod: "Cheque", bankAccountId: "bank-2", reference: "CHQ-45521", notes: "Partial payment", allocations: [{ invoiceId: "si-2", amount: 700000 }], status: "Posted" },
  { id: "cr-3", receiptNumber: formatDocNumber("CR", 3), date: "2026-09-01", customerId: "c-5", amount: 210000, paymentMethod: "Online Transfer", bankAccountId: "bank-1", reference: "ONL-7724", notes: "", allocations: [{ invoiceId: "si-5", amount: 210000 }], status: "Posted" },
  { id: "cr-4", receiptNumber: formatDocNumber("CR", 4), date: "2026-07-12", customerId: "c-6", amount: 200000, paymentMethod: "Cash", bankAccountId: "cash-1", reference: "", notes: "Advance settlement", allocations: [{ invoiceId: "si-7", amount: 200000 }], status: "Posted" },
  { id: "cr-5", receiptNumber: formatDocNumber("CR", 5), date: "2026-09-06", customerId: "c-2", amount: 150000, paymentMethod: "Bank Transfer", bankAccountId: "bank-3", reference: "TRF-88350", notes: "On account, not yet allocated", allocations: [], status: "Draft" },
];

const store = createMockStore<CustomerReceipt>(SEED);
let seq = SEED.length;

export const getCustomerReceipts = () => store.list();
export const getCustomerReceipt = (id: string) => store.get(id);
export const listCustomerReceiptsSync = () => store.snapshot();

function validateReceipt(input: Omit<CustomerReceipt, "id" | "receiptNumber">): void {
  assertRequired(input.customerId, "Customer");
  if (!(input.amount > 0)) throw new Error("Amount must be greater than zero.");
  const allocated = input.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated > input.amount + 0.01) throw new Error("Allocated amount cannot exceed the receipt amount.");
}

export async function createCustomerReceipt(input: Omit<CustomerReceipt, "id" | "receiptNumber">): Promise<CustomerReceipt> {
  validateReceipt(input);
  seq += 1;
  const record: CustomerReceipt = { ...input, id: makeId("cr"), receiptNumber: formatDocNumber("CR", seq) };
  return store.create(record);
}

export async function updateCustomerReceipt(id: string, patch: Partial<CustomerReceipt>): Promise<CustomerReceipt> {
  // Re-validate whenever a field that affects the amount/customer/allocation invariants
  // changes — the create path was validated but an edit previously bypassed all of it,
  // letting a save silently push a receipt into a negative-amount or over-allocated state.
  if (patch.amount !== undefined || patch.allocations !== undefined || patch.customerId !== undefined) {
    const existing = store.snapshot().find((r) => r.id === id);
    if (existing) validateReceipt({ ...existing, ...patch });
  }
  return store.update(id, patch);
}

export async function deleteCustomerReceipt(id: string): Promise<void> {
  return store.remove(id);
}

export function receiptUnallocated(r: CustomerReceipt): number {
  return r.amount - r.allocations.reduce((s, a) => s + a.amount, 0);
}

export function newCustomerReceiptDraft(): Omit<CustomerReceipt, "id" | "receiptNumber"> {
  return { date: todayIso(), customerId: "", amount: 0, paymentMethod: "Bank Transfer", bankAccountId: "", reference: "", notes: "", allocations: [], status: "Draft" };
}
