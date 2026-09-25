import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { todayIso } from "@/lib/finance-erp/utils/format";
import { INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import { DocLineItem, emptyLine, computeTotals } from "./shared";

export type CreditNoteStatus = "Draft" | "Pending Approval" | "Approved" | "Posted" | "Cancelled";

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  date: string;
  customerId: string;
  referenceInvoiceId: string;
  reason: string;
  items: DocLineItem[];
  status: CreditNoteStatus;
}

function line(itemIdx: number, qty: number, rate: number, tax = 17): DocLineItem {
  const it = INVENTORY_ITEMS[itemIdx];
  return { id: makeId("ln"), itemCode: it.code, itemName: it.name, quantity: qty, rate, discountPct: 0, taxPct: tax };
}

const SEED: CreditNote[] = [
  { id: "cn-1", creditNoteNumber: formatDocNumber("CN", 1), date: "2026-08-28", customerId: "c-1", referenceInvoiceId: "si-1", reason: "Damaged goods returned", items: [line(9, 20, 650)], status: "Posted" },
  { id: "cn-2", creditNoteNumber: formatDocNumber("CN", 2), date: "2026-09-01", customerId: "c-3", referenceInvoiceId: "si-2", reason: "Price adjustment agreed with customer", items: [line(10, 10, 1850)], status: "Approved" },
  { id: "cn-3", creditNoteNumber: formatDocNumber("CN", 3), date: "2026-09-04", customerId: "c-5", referenceInvoiceId: "si-5", reason: "Short shipment credit", items: [line(9, 15, 650)], status: "Pending Approval" },
  { id: "cn-4", creditNoteNumber: formatDocNumber("CN", 4), date: "2026-09-06", customerId: "c-2", referenceInvoiceId: "si-3", reason: "Quality complaint", items: [line(9, 8, 650)], status: "Draft" },
  { id: "cn-5", creditNoteNumber: formatDocNumber("CN", 5), date: "2026-07-15", customerId: "c-6", referenceInvoiceId: "si-7", reason: "Returned excess stock", items: [line(9, 12, 650)], status: "Cancelled" },
];

const store = createMockStore<CreditNote>(SEED);
let seq = SEED.length;

export const getCreditNotes = () => store.list();
export const getCreditNote = (id: string) => store.get(id);
export const listCreditNotesSync = () => store.snapshot();

export async function createCreditNote(input: Omit<CreditNote, "id" | "creditNoteNumber">): Promise<CreditNote> {
  assertRequired(input.customerId, "Customer");
  assertRequired(input.reason, "Reason");
  if (computeTotals(input.items).grandTotal <= 0) throw new FinanceValidationError("Add at least one line item with a positive quantity and rate.");
  seq += 1;
  const record: CreditNote = { ...input, id: makeId("cn"), creditNoteNumber: formatDocNumber("CN", seq) };
  return store.create(record);
}

export async function updateCreditNote(id: string, patch: Partial<CreditNote>): Promise<CreditNote> {
  return store.update(id, patch);
}

export async function deleteCreditNote(id: string): Promise<void> {
  return store.remove(id);
}

export function newCreditNoteDraft(): Omit<CreditNote, "id" | "creditNoteNumber"> {
  return { date: todayIso(), customerId: "", referenceInvoiceId: "", reason: "", items: [emptyLine()], status: "Draft" };
}

export { computeTotals };
