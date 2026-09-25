import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS, BANK_ACCOUNTS, PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";

export interface PaymentAllocation {
  billId: string;
  billNumber: string;
  outstanding: number;
  allocated: number;
}

export interface VendorPayment {
  id: string;
  paymentNumber: string;
  date: string;
  vendorId: string;
  accountId: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  notes: string;
  allocations: PaymentAllocation[];
}

const SEED: VendorPayment[] = [
  {
    id: "vp-1", paymentNumber: "VP-2026-0001", date: "2026-08-20", vendorId: VENDORS[0].id, accountId: BANK_ACCOUNTS[0].id,
    amount: 512000, paymentMethod: "Bank Transfer", reference: "MCB-CHQ-88213", notes: "Full settlement",
    allocations: [{ billId: "vb-1", billNumber: "VB-2026-0201", outstanding: 512000, allocated: 512000 }],
  },
  {
    id: "vp-2", paymentNumber: "VP-2026-0002", date: "2026-08-25", vendorId: VENDORS[1].id, accountId: BANK_ACCOUNTS[2].id,
    amount: 100000, paymentMethod: "Cheque", reference: "UBL-CHQ-44120", notes: "Partial payment",
    allocations: [{ billId: "vb-2", billNumber: "VB-2026-0202", outstanding: 233400, allocated: 100000 }],
  },
  {
    id: "vp-3", paymentNumber: "VP-2026-0003", date: "2026-09-01", vendorId: VENDORS[3].id, accountId: BANK_ACCOUNTS[1].id,
    amount: 620000, paymentMethod: "Online Transfer", reference: "HBL-TXN-99031", notes: "",
    allocations: [{ billId: "vb-4", billNumber: "VB-2026-0204", outstanding: 620000, allocated: 620000 }],
  },
  {
    id: "vp-4", paymentNumber: "VP-2026-0004", date: "2026-09-04", vendorId: VENDORS[0].id, accountId: BANK_ACCOUNTS[0].id,
    amount: 45000, paymentMethod: "Cash", reference: "PETTY-CASH-021", notes: "Advance against next bill",
    allocations: [],
  },
];

const store = createMockStore<VendorPayment>(SEED);
let seq = 500;

export async function getVendorPayments() { return store.list(); }
export async function getVendorPayment(id: string) { return store.get(id); }
export function snapshotVendorPayments() { return store.snapshot(); }

export async function createVendorPayment(data: Omit<VendorPayment, "id" | "paymentNumber">) {
  assertRequired(data.vendorId, "Vendor");
  assertRequired(data.accountId, "Account");
  seq += 1;
  const record: VendorPayment = { ...data, id: makeId("vp"), paymentNumber: formatDocNumber("VP", seq) };
  return store.create(record);
}

export async function updateVendorPayment(id: string, patch: Partial<VendorPayment>) {
  return store.update(id, patch);
}

export async function deleteVendorPayment(id: string) {
  return store.remove(id);
}

export { PAYMENT_METHODS };
