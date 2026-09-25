import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS, BRANCHES, WAREHOUSES, CURRENCIES } from "@/lib/finance-erp/mock/master-data";
import type { MockAttachment } from "@/components/finance-erp/attachments-field";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

export interface POLineItem {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  rate: number;
  discountPct: number;
  taxPct: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  date: string;
  vendorId: string;
  branchId: string;
  warehouseId: string;
  currency: string;
  paymentTerms: string;
  deliveryDate: string;
  items: POLineItem[];
  notes: string;
  status: FinanceStatus;
  attachments: MockAttachment[];
}

export function lineAmount(line: POLineItem): number {
  const gross = line.quantity * line.rate;
  const afterDiscount = gross - (gross * line.discountPct) / 100;
  return afterDiscount + (afterDiscount * line.taxPct) / 100;
}

export function computeTotals(items: POLineItem[]) {
  let subtotal = 0, discount = 0, tax = 0;
  for (const l of items) {
    const gross = l.quantity * l.rate;
    const d = (gross * l.discountPct) / 100;
    const afterDiscount = gross - d;
    const t = (afterDiscount * l.taxPct) / 100;
    subtotal += gross;
    discount += d;
    tax += t;
  }
  return { subtotal, discount, tax, grandTotal: subtotal - discount + tax };
}

function line(itemCode: string, itemName: string, quantity: number, rate: number, discountPct = 0, taxPct = 18): POLineItem {
  return { id: makeId("pol"), itemCode, itemName, quantity, rate, discountPct, taxPct };
}

const SEED: PurchaseOrder[] = [
  {
    id: "po-1", poNumber: "PO-2026-0001", date: "2026-08-05", vendorId: VENDORS[0].id, branchId: BRANCHES[0].id, warehouseId: WAREHOUSES[0].id,
    currency: "PKR", paymentTerms: "Net 30", deliveryDate: "2026-08-20",
    items: [line("RM-COTN-30", "Cotton Yarn 30/1 Combed", 500, 850)],
    notes: "Standard raw material replenishment.", status: "Approved", attachments: [],
  },
  {
    id: "po-2", poNumber: "PO-2026-0002", date: "2026-08-10", vendorId: VENDORS[1].id, branchId: BRANCHES[1].id, warehouseId: WAREHOUSES[1].id,
    currency: "PKR", paymentTerms: "Net 45", deliveryDate: "2026-08-25",
    items: [line("FAB-DENIM-12", "Denim Fabric 12oz", 1200, 1450, 2)],
    notes: "For Autumn/Winter denim line.", status: "Approved", attachments: [],
  },
  {
    id: "po-3", poNumber: "PO-2026-0003", date: "2026-08-14", vendorId: VENDORS[2].id, branchId: BRANCHES[0].id, warehouseId: WAREHOUSES[0].id,
    currency: "PKR", paymentTerms: "Net 15", deliveryDate: "2026-08-28",
    items: [line("TRM-ZIP-007", "YKK Zipper 7 inch", 5000, 45), line("TRM-BTN-001", "Plastic Button 18L", 300, 320)],
    notes: "", status: "Pending Approval", attachments: [],
  },
  {
    id: "po-4", poNumber: "PO-2026-0004", date: "2026-08-18", vendorId: VENDORS[3].id, branchId: BRANCHES[0].id, warehouseId: WAREHOUSES[0].id,
    currency: "PKR", paymentTerms: "Net 30", deliveryDate: "2026-09-01",
    items: [line("CHM-DYE-BLK", "Reactive Dye - Black", 400, 1250, 0, 18)],
    notes: "", status: "Draft", attachments: [],
  },
  {
    id: "po-5", poNumber: "PO-2026-0005", date: "2026-08-22", vendorId: VENDORS[4].id, branchId: BRANCHES[1].id, warehouseId: WAREHOUSES[1].id,
    currency: "PKR", paymentTerms: "Net 60", deliveryDate: "2026-09-05",
    items: [line("PKG-CARTON-L", "Export Carton - Large", 2000, 145)],
    notes: "Export order packaging.", status: "Approved", attachments: [],
  },
  {
    id: "po-6", poNumber: "PO-2026-0006", date: "2026-08-26", vendorId: VENDORS[0].id, branchId: BRANCHES[0].id, warehouseId: WAREHOUSES[0].id,
    currency: "PKR", paymentTerms: "Net 30", deliveryDate: "2026-09-08",
    items: [line("RM-COTN-20", "Cotton Yarn 20/1 Carded", 800, 720)],
    notes: "", status: "Rejected", attachments: [],
  },
  {
    id: "po-7", poNumber: "PO-2026-0007", date: "2026-09-01", vendorId: VENDORS[1].id, branchId: BRANCHES[0].id, warehouseId: WAREHOUSES[0].id,
    currency: "PKR", paymentTerms: "Net 45", deliveryDate: "2026-09-15",
    items: [line("FAB-JERSEY-180", "Cotton Jersey 180GSM", 3000, 780, 3)],
    notes: "", status: "Closed", attachments: [],
  },
  {
    id: "po-8", poNumber: "PO-2026-0008", date: "2026-09-03", vendorId: VENDORS[2].id, branchId: BRANCHES[2].id, warehouseId: WAREHOUSES[2].id,
    currency: "PKR", paymentTerms: "Net 15", deliveryDate: "2026-09-18",
    items: [line("TRM-ZIP-007", "YKK Zipper 7 inch", 2500, 45)],
    notes: "", status: "Cancelled", attachments: [],
  },
];

const store = createMockStore<PurchaseOrder>(SEED);
let seq = SEED.length;

export async function getPurchaseOrders() { return store.list(); }
export async function getPurchaseOrder(id: string) { return store.get(id); }
export function snapshotPurchaseOrders() { return store.snapshot(); }

export async function createPurchaseOrder(data: Omit<PurchaseOrder, "id" | "poNumber">) {
  assertRequired(data.vendorId, "Vendor");
  assertRequired(data.date, "Date");
  seq += 1;
  const record: PurchaseOrder = { ...data, id: makeId("po"), poNumber: formatDocNumber("PO", seq) };
  return store.create(record);
}

export async function updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>) {
  return store.update(id, patch);
}

export async function deletePurchaseOrder(id: string) {
  return store.remove(id);
}

export const PO_STATUSES: FinanceStatus[] = ["Draft", "Pending Approval", "Approved", "Rejected", "Cancelled", "Closed"];
export { VENDORS, BRANCHES, WAREHOUSES, CURRENCIES };
