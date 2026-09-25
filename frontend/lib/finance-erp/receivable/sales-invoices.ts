import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { todayIso, addDaysIso } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import { DocLineItem, emptyLine, computeTotals } from "./shared";

export type SalesInvoiceStatus = "Unpaid" | "Partially Paid" | "Paid" | "Cancelled";

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerId: string;
  billingAddress: string;
  shippingAddress: string;
  salesOrderRef: string;
  items: DocLineItem[];
  paidAmount: number;
  status: SalesInvoiceStatus;
}

function line(itemIdx: number, qty: number, rate: number, disc = 0, tax = 17): DocLineItem {
  const it = INVENTORY_ITEMS[itemIdx];
  return { id: makeId("ln"), itemCode: it.code, itemName: it.name, quantity: qty, rate, discountPct: disc, taxPct: tax };
}

function cust(id: string) { return CUSTOMERS.find((c) => c.id === id)!; }

const SEED: SalesInvoice[] = [
  { id: "si-1", invoiceNumber: formatDocNumber("SI", 142), date: "2026-09-05", dueDate: "2026-10-05", customerId: "c-1", billingAddress: cust("c-1").billingAddress, shippingAddress: cust("c-1").shippingAddress, salesOrderRef: "SO-2026-0001", items: [line(9, 500, 650, 2, 17), line(10, 200, 1850, 0, 17)], paidAmount: 845000, status: "Paid" },
  { id: "si-2", invoiceNumber: formatDocNumber("SI", 141), date: "2026-09-04", dueDate: "2026-10-04", customerId: "c-3", billingAddress: cust("c-3").billingAddress, shippingAddress: cust("c-3").shippingAddress, salesOrderRef: "SO-2026-0003", items: [line(10, 800, 1850, 5, 0)], paidAmount: 700000, status: "Partially Paid" },
  { id: "si-3", invoiceNumber: formatDocNumber("SI", 140), date: "2026-08-20", dueDate: "2026-08-25", customerId: "c-2", billingAddress: cust("c-2").billingAddress, shippingAddress: cust("c-2").shippingAddress, salesOrderRef: "SO-2026-0002", items: [line(9, 300, 650, 0, 17)], paidAmount: 0, status: "Unpaid" },
  { id: "si-4", invoiceNumber: formatDocNumber("SI", 139), date: "2026-09-02", dueDate: "2026-10-02", customerId: "c-4", billingAddress: cust("c-4").billingAddress, shippingAddress: cust("c-4").shippingAddress, salesOrderRef: "SO-2026-0004", items: [line(9, 150, 650, 0, 17)], paidAmount: 0, status: "Unpaid" },
  { id: "si-5", invoiceNumber: formatDocNumber("SI", 138), date: "2026-09-01", dueDate: "2026-10-01", customerId: "c-5", billingAddress: cust("c-5").billingAddress, shippingAddress: cust("c-5").shippingAddress, salesOrderRef: "SO-2026-0005", items: [line(9, 400, 650, 3, 17)], paidAmount: 295074, status: "Paid" },
  { id: "si-6", invoiceNumber: formatDocNumber("SI", 135), date: "2026-07-25", dueDate: "2026-08-24", customerId: "c-3", billingAddress: cust("c-3").billingAddress, shippingAddress: cust("c-3").shippingAddress, salesOrderRef: "", items: [line(10, 500, 1850, 0, 0)], paidAmount: 0, status: "Unpaid" },
  { id: "si-7", invoiceNumber: formatDocNumber("SI", 129), date: "2026-07-10", dueDate: "2026-07-25", customerId: "c-6", billingAddress: cust("c-6").billingAddress, shippingAddress: cust("c-6").shippingAddress, salesOrderRef: "", items: [line(9, 350, 650, 0, 17)], paidAmount: 200000, status: "Partially Paid" },
  { id: "si-8", invoiceNumber: formatDocNumber("SI", 122), date: "2026-06-15", dueDate: "2026-07-15", customerId: "c-1", billingAddress: cust("c-1").billingAddress, shippingAddress: cust("c-1").shippingAddress, salesOrderRef: "", items: [line(10, 150, 1850, 0, 17)], paidAmount: 0, status: "Unpaid" },
  { id: "si-9", invoiceNumber: formatDocNumber("SI", 118), date: "2026-05-20", dueDate: "2026-06-19", customerId: "c-2", billingAddress: cust("c-2").billingAddress, shippingAddress: cust("c-2").shippingAddress, salesOrderRef: "", items: [line(9, 220, 650, 0, 17)], paidAmount: 0, status: "Unpaid" },
];

const store = createMockStore<SalesInvoice>(SEED);
let seq = 142;

export const getSalesInvoices = () => store.list();
export const getSalesInvoice = (id: string) => store.get(id);
export const listSalesInvoicesSync = () => store.snapshot();

export async function createSalesInvoice(input: Omit<SalesInvoice, "id" | "invoiceNumber">): Promise<SalesInvoice> {
  assertRequired(input.customerId, "Customer");
  assertRequired(input.date, "Date");
  if (computeTotals(input.items).grandTotal <= 0) throw new FinanceValidationError("Add at least one line item with a positive quantity and rate.");
  seq += 1;
  const record: SalesInvoice = { ...input, id: makeId("si"), invoiceNumber: formatDocNumber("SI", seq) };
  return store.create(record);
}

export async function updateSalesInvoice(id: string, patch: Partial<SalesInvoice>): Promise<SalesInvoice> {
  return store.update(id, patch);
}

export async function deleteSalesInvoice(id: string): Promise<void> {
  return store.remove(id);
}

export function invoiceOutstanding(inv: SalesInvoice): number {
  const total = computeTotals(inv.items).grandTotal;
  return Math.max(0, total - inv.paidAmount);
}

export function isOverdue(inv: SalesInvoice): boolean {
  return inv.status !== "Paid" && inv.status !== "Cancelled" && new Date(inv.dueDate) < new Date();
}

export function newSalesInvoiceDraft(): Omit<SalesInvoice, "id" | "invoiceNumber"> {
  return {
    date: todayIso(), dueDate: addDaysIso(todayIso(), 30), customerId: "", billingAddress: "", shippingAddress: "",
    salesOrderRef: "", items: [emptyLine()], paidAmount: 0, status: "Unpaid",
  };
}

export { computeTotals };
