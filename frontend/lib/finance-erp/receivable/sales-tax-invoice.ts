import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { todayIso } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, INVENTORY_ITEMS, TAX_RATES } from "@/lib/finance-erp/mock/master-data";

export type SalesTaxInvoiceStatus = "Draft" | "Posted" | "Cancelled";

export interface STIItem {
  id: string;
  itemCode: string;
  itemName: string;
  taxableAmount: number;
}

export interface SalesTaxInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  taxRegistrationNo: string;
  taxRateId: string;
  items: STIItem[];
  status: SalesTaxInvoiceStatus;
}

function cust(id: string) { return CUSTOMERS.find((c) => c.id === id)!; }
function item(idx: number, amount: number): STIItem {
  const it = INVENTORY_ITEMS[idx];
  return { id: `${it.id}-x`, itemCode: it.code, itemName: it.name, taxableAmount: amount };
}

const SEED: SalesTaxInvoice[] = [
  { id: "sti-1", invoiceNumber: formatDocNumber("STI", 1), date: "2026-09-05", customerId: "c-1", taxRegistrationNo: cust("c-1").taxRegNo, taxRateId: "tax-1", items: [item(9, 325000)], status: "Posted" },
  { id: "sti-2", invoiceNumber: formatDocNumber("STI", 2), date: "2026-09-03", customerId: "c-2", taxRegistrationNo: cust("c-2").taxRegNo, taxRateId: "tax-2", items: [item(9, 195000)], status: "Posted" },
  { id: "sti-3", invoiceNumber: formatDocNumber("STI", 3), date: "2026-09-01", customerId: "c-5", taxRegistrationNo: cust("c-5").taxRegNo, taxRateId: "tax-3", items: [item(10, 480000)], status: "Draft" },
  { id: "sti-4", invoiceNumber: formatDocNumber("STI", 4), date: "2026-08-25", customerId: "c-4", taxRegistrationNo: cust("c-4").taxRegNo, taxRateId: "tax-1", items: [item(9, 97500)], status: "Cancelled" },
];

const store = createMockStore<SalesTaxInvoice>(SEED);
let seq = SEED.length;

export const getSalesTaxInvoices = () => store.list();
export const getSalesTaxInvoice = (id: string) => store.get(id);

export async function createSalesTaxInvoice(input: Omit<SalesTaxInvoice, "id" | "invoiceNumber">): Promise<SalesTaxInvoice> {
  assertRequired(input.customerId, "Customer");
  if (input.items.reduce((s, i) => s + i.taxableAmount, 0) <= 0) throw new Error("Add at least one item with a positive taxable amount.");
  seq += 1;
  return store.create({ ...input, id: makeId("sti"), invoiceNumber: formatDocNumber("STI", seq) });
}

export async function updateSalesTaxInvoice(id: string, patch: Partial<SalesTaxInvoice>): Promise<SalesTaxInvoice> {
  return store.update(id, patch);
}

export async function deleteSalesTaxInvoice(id: string): Promise<void> {
  return store.remove(id);
}

export function taxableTotal(inv: SalesTaxInvoice): number {
  return inv.items.reduce((s, i) => s + i.taxableAmount, 0);
}

export function taxAmount(inv: SalesTaxInvoice): number {
  const rate = TAX_RATES.find((t) => t.id === inv.taxRateId)?.rate ?? 0;
  return taxableTotal(inv) * (rate / 100);
}

export function invoiceTotal(inv: SalesTaxInvoice): number {
  return taxableTotal(inv) + taxAmount(inv);
}

export function newSalesTaxInvoiceDraft(): Omit<SalesTaxInvoice, "id" | "invoiceNumber"> {
  return { date: todayIso(), customerId: "", taxRegistrationNo: "", taxRateId: TAX_RATES[0].id, items: [{ id: makeId("sti-ln"), itemCode: "", itemName: "", taxableAmount: 0 }], status: "Draft" };
}
