import { createMockStore, formatDocNumber, makeId, type MockStore } from "@/lib/finance-erp/mock/create-store";
import { assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { WAREHOUSES, DEPARTMENTS, EMPLOYEES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";

export type IssuanceStatus = "Draft" | "Pending Approval" | "Approved" | "Cancelled" | "Closed";

export interface IssuanceLine {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  purpose: string;
}

export interface IssuanceDoc {
  id: string;
  issuanceNumber: string;
  issuanceDate: string;
  warehouseId: string;
  departmentId: string;
  requestedBy: string;
  items: IssuanceLine[];
  remarks: string;
  status: IssuanceStatus;
}

export function newIssuanceLine(): IssuanceLine {
  return { id: makeId("iln"), itemCode: "", itemName: "", quantity: 0, unit: "", purpose: "" };
}

function seedLine(itemIdx: number, qty: number, purpose: string): IssuanceLine {
  const item = INVENTORY_ITEMS[itemIdx % INVENTORY_ITEMS.length];
  return { id: makeId("iln"), itemCode: item.code, itemName: item.name, quantity: qty, unit: item.unit, purpose };
}

function seedIssuance(seq: number, dayOffset: number, whIdx: number, deptIdx: number, empIdx: number, status: IssuanceStatus, itemIdx: number, qty: number): IssuanceDoc {
  const date = new Date(2026, 8, 1 + dayOffset).toISOString().slice(0, 10);
  return {
    id: makeId("iss"),
    issuanceNumber: formatDocNumber("ISS", seq, 2026),
    issuanceDate: date,
    warehouseId: WAREHOUSES[whIdx % WAREHOUSES.length].id,
    departmentId: DEPARTMENTS[deptIdx % DEPARTMENTS.length].id,
    requestedBy: EMPLOYEES[empIdx % EMPLOYEES.length].id,
    items: [seedLine(itemIdx, qty, "Production consumption")],
    remarks: "",
    status,
  };
}

const SEED: IssuanceDoc[] = [
  seedIssuance(1, 1, 0, 3, 6, "Closed", 0, 400),
  seedIssuance(2, 2, 1, 3, 6, "Approved", 2, 250),
  seedIssuance(3, 3, 0, 4, 3, "Pending Approval", 4, 30),
  seedIssuance(4, 4, 2, 3, 6, "Draft", 5, 500),
  seedIssuance(5, 5, 1, 3, 6, "Cancelled", 8, 15),
  seedIssuance(6, 6, 3, 4, 4, "Approved", 9, 60),
  seedIssuance(7, 7, 0, 3, 6, "Closed", 1, 300),
];

const store: MockStore<IssuanceDoc> = createMockStore<IssuanceDoc>(SEED);
let sequence = SEED.length;

export async function getIssuances(): Promise<IssuanceDoc[]> { return store.list(); }
export async function getIssuance(id: string): Promise<IssuanceDoc | undefined> { return store.get(id); }

export interface IssuanceInput {
  issuanceDate: string;
  warehouseId: string;
  departmentId: string;
  requestedBy: string;
  items: IssuanceLine[];
  remarks: string;
  status: IssuanceStatus;
}

function validate(input: IssuanceInput) {
  assertRequired(input.issuanceDate, "Issuance Date");
  assertRequired(input.warehouseId, "Warehouse");
  assertRequired(input.departmentId, "Department");
  assertRequired(input.requestedBy, "Requested By");
  // Line items only need to be complete once the issuance leaves Draft, same rule as Demand/Receipt.
  if (input.status !== "Draft") {
    if (input.items.length === 0) throw new FinanceValidationError("At least one item is required.");
    for (const line of input.items) {
      assertRequired(line.itemCode, "Item");
      if (!(Number(line.quantity) > 0)) throw new FinanceValidationError("Each item's quantity must be greater than zero.");
    }
  }
}

export async function createIssuance(input: IssuanceInput): Promise<IssuanceDoc> {
  validate(input);
  sequence += 1;
  const record: IssuanceDoc = { id: makeId("iss"), issuanceNumber: formatDocNumber("ISS", sequence, 2026), ...input };
  return store.create(record);
}

export async function updateIssuance(id: string, input: IssuanceInput): Promise<IssuanceDoc> {
  validate(input);
  return store.update(id, input);
}

export async function deleteIssuance(id: string): Promise<void> { return store.remove(id); }
