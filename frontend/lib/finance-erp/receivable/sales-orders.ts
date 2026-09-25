import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { todayIso, addDaysIso } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, BRANCHES, WAREHOUSES, EMPLOYEES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import { DocLineItem, emptyLine, computeTotals } from "./shared";

export type SalesOrderStatus = "Draft" | "Pending Approval" | "Approved" | "Rejected" | "Cancelled" | "Closed";

export interface SalesOrder {
  id: string;
  soNumber: string;
  date: string;
  customerId: string;
  branchId: string;
  warehouseId: string;
  salespersonId: string;
  paymentTerms: string;
  deliveryDate: string;
  items: DocLineItem[];
  notes: string;
  status: SalesOrderStatus;
}

function line(itemIdx: number, qty: number, rate: number, disc = 0, tax = 17): DocLineItem {
  const it = INVENTORY_ITEMS[itemIdx];
  return { id: makeId("ln"), itemCode: it.code, itemName: it.name, quantity: qty, rate, discountPct: disc, taxPct: tax };
}

const SEED: SalesOrder[] = [
  { id: "so-1", soNumber: formatDocNumber("SO", 1), date: "2026-08-10", customerId: "c-1", branchId: "br-1", warehouseId: "wh-1", salespersonId: "emp-6", paymentTerms: "Net 30", deliveryDate: "2026-08-25", items: [line(9, 500, 650, 2, 17), line(10, 200, 1850, 0, 17)], notes: "Bulk order for Metro Retail Q3 stock-up.", status: "Approved" },
  { id: "so-2", soNumber: formatDocNumber("SO", 2), date: "2026-08-15", customerId: "c-2", branchId: "br-1", warehouseId: "wh-1", salespersonId: "emp-6", paymentTerms: "Net 15", deliveryDate: "2026-08-28", items: [line(9, 300, 650, 0, 17)], notes: "", status: "Pending Approval" },
  { id: "so-3", soNumber: formatDocNumber("SO", 3), date: "2026-08-20", customerId: "c-3", branchId: "br-2", warehouseId: "wh-2", salespersonId: "emp-6", paymentTerms: "Net 45", deliveryDate: "2026-09-05", items: [line(10, 800, 1850, 5, 0)], notes: "Export order - zero rated.", status: "Approved" },
  { id: "so-4", soNumber: formatDocNumber("SO", 4), date: "2026-08-22", customerId: "c-4", branchId: "br-2", warehouseId: "wh-2", salespersonId: "emp-6", paymentTerms: "Net 30", deliveryDate: "2026-09-08", items: [line(9, 150, 650, 0, 17)], notes: "", status: "Draft" },
  { id: "so-5", soNumber: formatDocNumber("SO", 5), date: "2026-08-25", customerId: "c-5", branchId: "br-3", warehouseId: "wh-3", salespersonId: "emp-6", paymentTerms: "Net 15", deliveryDate: "2026-09-02", items: [line(9, 400, 650, 3, 17)], notes: "", status: "Approved" },
  { id: "so-6", soNumber: formatDocNumber("SO", 6), date: "2026-08-28", customerId: "c-1", branchId: "br-1", warehouseId: "wh-1", salespersonId: "emp-6", paymentTerms: "Net 30", deliveryDate: "2026-09-10", items: [line(10, 100, 1850, 0, 17)], notes: "", status: "Rejected" },
  { id: "so-7", soNumber: formatDocNumber("SO", 7), date: "2026-09-01", customerId: "c-3", branchId: "br-2", warehouseId: "wh-2", salespersonId: "emp-6", paymentTerms: "Net 45", deliveryDate: "2026-09-15", items: [line(9, 600, 650, 0, 17)], notes: "", status: "Closed" },
  { id: "so-8", soNumber: formatDocNumber("SO", 8), date: "2026-09-03", customerId: "c-6", branchId: "br-2", warehouseId: "wh-2", salespersonId: "emp-6", paymentTerms: "Net 30", deliveryDate: "2026-09-18", items: [line(9, 250, 650, 0, 17)], notes: "", status: "Cancelled" },
];

const store = createMockStore<SalesOrder>(SEED);
let seq = SEED.length;

export const getSalesOrders = () => store.list();
export const getSalesOrder = (id: string) => store.get(id);
export const listSalesOrdersSync = () => store.snapshot();

export async function createSalesOrder(input: Omit<SalesOrder, "id" | "soNumber">): Promise<SalesOrder> {
  assertRequired(input.customerId, "Customer");
  assertRequired(input.date, "Date");
  if (computeTotals(input.items).grandTotal <= 0) throw new FinanceValidationError("Add at least one line item with a positive quantity and rate.");
  seq += 1;
  const record: SalesOrder = { ...input, id: makeId("so"), soNumber: formatDocNumber("SO", seq) };
  return store.create(record);
}

export async function updateSalesOrder(id: string, patch: Partial<SalesOrder>): Promise<SalesOrder> {
  return store.update(id, patch);
}

export async function deleteSalesOrder(id: string): Promise<void> {
  return store.remove(id);
}

export function newSalesOrderDraft(): Omit<SalesOrder, "id" | "soNumber"> {
  return {
    date: todayIso(), customerId: "", branchId: BRANCHES[0].id, warehouseId: WAREHOUSES[0].id,
    salespersonId: EMPLOYEES[5].id, paymentTerms: "Net 30", deliveryDate: addDaysIso(todayIso(), 14),
    items: [emptyLine()], notes: "", status: "Draft",
  };
}

export { computeTotals };
