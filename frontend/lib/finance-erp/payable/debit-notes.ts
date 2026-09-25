import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export interface DebitNote {
  id: string;
  debitNoteNumber: string;
  vendorId: string;
  date: string;
  referenceInvoice: string;
  reason: string;
  taxAmount: number;
  amount: number;
  status: FinanceStatus;
}

const SEED: DebitNote[] = [
  { id: "dn-1", debitNoteNumber: "DN-2026-0001", vendorId: VENDORS[2].id, date: "2026-08-16", referenceInvoice: "PI-2026-0003", reason: "Damaged trims on receipt", taxAmount: 810, amount: 5310, status: "Approved" },
  { id: "dn-2", debitNoteNumber: "DN-2026-0002", vendorId: VENDORS[1].id, date: "2026-08-13", referenceInvoice: "PI-2026-0002", reason: "Short quantity received", taxAmount: 2160, amount: 14160, status: "Posted" },
  { id: "dn-3", debitNoteNumber: "DN-2026-0003", vendorId: VENDORS[0].id, date: "2026-09-06", referenceInvoice: "VB-2026-0201", reason: "Price variance vs PO rate", taxAmount: 1440, amount: 9440, status: "Pending Approval" },
  { id: "dn-4", debitNoteNumber: "DN-2026-0004", vendorId: VENDORS[4].id, date: "2026-08-30", referenceInvoice: "VB-2026-0205", reason: "Rejected packaging batch", taxAmount: 900, amount: 5900, status: "Draft" },
];

const store = createMockStore<DebitNote>(SEED);
let seq = 400;

export async function getDebitNotes() { return store.list(); }
export async function getDebitNote(id: string) { return store.get(id); }
export function snapshotDebitNotes() { return store.snapshot(); }

export async function createDebitNote(data: Omit<DebitNote, "id" | "debitNoteNumber">) {
  assertRequired(data.vendorId, "Vendor");
  assertRequired(data.reason, "Reason");
  seq += 1;
  const record: DebitNote = { ...data, id: makeId("dn"), debitNoteNumber: formatDocNumber("DN", seq) };
  return store.create(record);
}

export async function updateDebitNote(id: string, patch: Partial<DebitNote>) {
  return store.update(id, patch);
}

export async function deleteDebitNote(id: string) {
  return store.remove(id);
}
