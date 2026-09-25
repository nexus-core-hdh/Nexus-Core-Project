import { createMockStore, formatDocNumber, makeId, type MockStore } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { VENDORS, WAREHOUSES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import { addDaysIso } from "@/lib/finance-erp/utils/format";

export type ReceiptStatus = "Draft" | "Pending Approval" | "Approved" | "Partially Received" | "Received" | "Cancelled";

export interface ReceiptLine {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  rate: number;
  amount: number;
  batch: string;
  expiry: string;
}

export interface ReceiptDoc {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  vendorId: string;
  purchaseOrderRef: string;
  grnNumber: string;
  warehouseId: string;
  items: ReceiptLine[];
  remarks: string;
  status: ReceiptStatus;
  totalAmount: number;
}

function totalOf(items: ReceiptLine[]): number {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function newReceiptLine(): ReceiptLine {
  return { id: makeId("rln"), itemCode: "", itemName: "", quantity: 0, acceptedQuantity: 0, rejectedQuantity: 0, rate: 0, amount: 0, batch: "", expiry: "" };
}

function seedLine(itemIdx: number, qty: number, rejected = 0): ReceiptLine {
  const item = INVENTORY_ITEMS[itemIdx % INVENTORY_ITEMS.length];
  const accepted = qty - rejected;
  return {
    id: makeId("rln"), itemCode: item.code, itemName: item.name, quantity: qty, acceptedQuantity: accepted,
    rejectedQuantity: rejected, rate: item.standardRate, amount: accepted * item.standardRate,
    batch: `B-${1000 + itemIdx}`, expiry: addDaysIso(new Date(2026, 8, 1).toISOString().slice(0, 10), 365),
  };
}

function seedReceipt(seq: number, dayOffset: number, vendorIdx: number, whIdx: number, status: ReceiptStatus, itemIdx: number, qty: number, rejected = 0): ReceiptDoc {
  const date = new Date(2026, 8, 1 + dayOffset).toISOString().slice(0, 10);
  const items = [seedLine(itemIdx, qty, rejected)];
  return {
    id: makeId("grn"),
    receiptNumber: formatDocNumber("GRN", seq, 2026),
    receiptDate: date,
    vendorId: VENDORS[vendorIdx % VENDORS.length].id,
    purchaseOrderRef: formatDocNumber("PO", seq + 20, 2026),
    grnNumber: `GRN-${2026}-${String(seq).padStart(4, "0")}`,
    warehouseId: WAREHOUSES[whIdx % WAREHOUSES.length].id,
    items,
    remarks: "",
    status,
    totalAmount: totalOf(items),
  };
}

const SEED: ReceiptDoc[] = [
  seedReceipt(1, 1, 0, 0, "Received", 0, 500),
  seedReceipt(2, 2, 1, 1, "Partially Received", 2, 300, 20),
  seedReceipt(3, 3, 2, 0, "Approved", 4, 200),
  seedReceipt(4, 4, 3, 2, "Pending Approval", 5, 1000),
  seedReceipt(5, 5, 0, 3, "Draft", 8, 50),
  seedReceipt(6, 6, 4, 1, "Received", 9, 40),
  seedReceipt(7, 7, 1, 0, "Cancelled", 6, 150),
  seedReceipt(8, 8, 2, 2, "Received", 1, 600, 10),
];

const store: MockStore<ReceiptDoc> = createMockStore<ReceiptDoc>(SEED);
let sequence = SEED.length;

export async function getReceipts(): Promise<ReceiptDoc[]> { return store.list(); }
export async function getReceipt(id: string): Promise<ReceiptDoc | undefined> { return store.get(id); }

export interface ReceiptInput {
  receiptDate: string;
  vendorId: string;
  purchaseOrderRef: string;
  grnNumber: string;
  warehouseId: string;
  items: ReceiptLine[];
  remarks: string;
  status: ReceiptStatus;
}

function validate(input: ReceiptInput) {
  assertRequired(input.receiptDate, "Receipt Date");
  assertRequired(input.vendorId, "Supplier");
  assertRequired(input.warehouseId, "Warehouse");
  assertRequired(input.grnNumber, "GRN Number");
  // Line items only need to be complete once the receipt leaves Draft, same rule as Demand/Issuance.
  if (input.status !== "Draft") {
    if (input.items.length === 0) throw new FinanceValidationError("At least one item is required.");
    for (const line of input.items) {
      assertRequired(line.itemCode, "Item");
      if (!(Number(line.quantity) > 0)) throw new FinanceValidationError("Each item's quantity must be greater than zero.");
      if (Number(line.rejectedQuantity) > Number(line.quantity)) throw new FinanceValidationError("Rejected quantity cannot exceed the received quantity.");
      if (Number(line.rate) < 0) throw new FinanceValidationError("Rate cannot be negative.");
    }
  }
}

export async function createReceipt(input: ReceiptInput): Promise<ReceiptDoc> {
  validate(input);
  assertNotDuplicate(store.snapshot(), "grnNumber", input.grnNumber, "GRN Number");
  sequence += 1;
  const record: ReceiptDoc = { id: makeId("grn"), receiptNumber: formatDocNumber("GRN", sequence, 2026), ...input, totalAmount: totalOf(input.items) };
  return store.create(record);
}

export async function updateReceipt(id: string, input: ReceiptInput): Promise<ReceiptDoc> {
  validate(input);
  assertNotDuplicate(store.snapshot(), "grnNumber", input.grnNumber, "GRN Number", "id", id);
  return store.update(id, { ...input, totalAmount: totalOf(input.items) });
}

export async function deleteReceipt(id: string): Promise<void> { return store.remove(id); }
