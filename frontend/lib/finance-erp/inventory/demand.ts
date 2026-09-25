import { createMockStore, formatDocNumber, makeId, type MockStore } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired, FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { BRANCHES, DEPARTMENTS, EMPLOYEES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import type { MockAttachment } from "@/components/finance-erp/attachments-field";

export type DemandStatus = "Draft" | "Pending Approval" | "Approved" | "Rejected" | "Cancelled";

export interface DemandLine {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedRate: number;
  estimatedAmount: number;
}

export interface DemandDoc {
  id: string;
  demandNumber: string;
  demandDate: string;
  branchId: string;
  departmentId: string;
  requestedBy: string;
  requiredDate: string;
  items: DemandLine[];
  remarks: string;
  attachments: MockAttachment[];
  status: DemandStatus;
  totalEstimatedAmount: number;
}

function totalOf(items: DemandLine[]): number {
  return items.reduce((s, i) => s + (Number(i.estimatedAmount) || 0), 0);
}

export function newDemandLine(): DemandLine {
  return { id: makeId("dln"), itemCode: "", itemName: "", quantity: 1, unit: "", estimatedRate: 0, estimatedAmount: 0 };
}

function seedLine(itemIndex: number, quantity: number): DemandLine {
  const item = INVENTORY_ITEMS[itemIndex % INVENTORY_ITEMS.length];
  const amount = quantity * item.standardRate;
  return { id: makeId("dln"), itemCode: item.code, itemName: item.name, quantity, unit: item.unit, estimatedRate: item.standardRate, estimatedAmount: amount };
}

function seedDemand(seq: number, monthOffset: number, branchIdx: number, deptIdx: number, empIdx: number, status: DemandStatus, itemIdx: number, qty: number): DemandDoc {
  const date = new Date(2026, 7 + monthOffset, 3 + seq);
  const demandDate = date.toISOString().slice(0, 10);
  const required = new Date(date.getTime() + 10 * 86400000).toISOString().slice(0, 10);
  const items = [seedLine(itemIdx, qty), seedLine(itemIdx + 1, Math.max(1, Math.round(qty / 2)))];
  return {
    id: makeId("dem"),
    demandNumber: formatDocNumber("DEM", seq, 2026),
    demandDate,
    branchId: BRANCHES[branchIdx % BRANCHES.length].id,
    departmentId: DEPARTMENTS[deptIdx % DEPARTMENTS.length].id,
    requestedBy: EMPLOYEES[empIdx % EMPLOYEES.length].id,
    requiredDate: required,
    items,
    remarks: "Standard replenishment request.",
    attachments: [],
    status,
    totalEstimatedAmount: totalOf(items),
  };
}

const SEED: DemandDoc[] = [
  seedDemand(1, 0, 0, 4, 3, "Approved", 0, 200),
  seedDemand(2, 0, 1, 3, 5, "Pending Approval", 2, 500),
  seedDemand(3, 0, 4, 2, 6, "Draft", 4, 50),
  seedDemand(4, 1, 0, 1, 2, "Approved", 5, 1000),
  seedDemand(5, 1, 2, 4, 3, "Rejected", 8, 20),
  seedDemand(6, 1, 3, 3, 4, "Pending Approval", 1, 300),
  seedDemand(7, 2, 0, 4, 6, "Cancelled", 9, 40),
  seedDemand(8, 2, 1, 5, 1, "Approved", 6, 150),
];

const store: MockStore<DemandDoc> = createMockStore<DemandDoc>(SEED);
let sequence = SEED.length;

export async function getDemands(): Promise<DemandDoc[]> {
  return store.list();
}

export async function getDemand(id: string): Promise<DemandDoc | undefined> {
  return store.get(id);
}

export interface DemandInput {
  demandDate: string;
  branchId: string;
  departmentId: string;
  requestedBy: string;
  requiredDate: string;
  items: DemandLine[];
  remarks: string;
  attachments: MockAttachment[];
  status: DemandStatus;
}

function validate(input: DemandInput) {
  assertRequired(input.demandDate, "Demand Date");
  assertRequired(input.branchId, "Branch");
  assertRequired(input.departmentId, "Department");
  assertRequired(input.requestedBy, "Requested By");
  assertRequired(input.requiredDate, "Required Date");
  // Line items only need to be complete once the demand leaves Draft — a draft is allowed to be
  // a partially-filled work in progress, matching Save Draft's own "save whatever you have" intent.
  if (input.status !== "Draft") {
    if (input.items.length === 0) throw new FinanceValidationError("At least one item is required.");
    for (const line of input.items) {
      assertRequired(line.itemCode, "Item");
      if (!(Number(line.quantity) > 0)) throw new FinanceValidationError("Each item's quantity must be greater than zero.");
      if (Number(line.estimatedRate) < 0) throw new FinanceValidationError("Estimated rate cannot be negative.");
    }
  }
}

export async function createDemand(input: DemandInput): Promise<DemandDoc> {
  validate(input);
  sequence += 1;
  const demandNumber = formatDocNumber("DEM", sequence, 2026);
  assertNotDuplicate(store.snapshot(), "demandNumber", demandNumber, "Demand Number");
  const record: DemandDoc = {
    id: makeId("dem"),
    demandNumber,
    ...input,
    totalEstimatedAmount: totalOf(input.items),
  };
  return store.create(record);
}

export async function updateDemand(id: string, input: DemandInput): Promise<DemandDoc> {
  validate(input);
  return store.update(id, { ...input, totalEstimatedAmount: totalOf(input.items) });
}

export async function deleteDemand(id: string): Promise<void> {
  return store.remove(id);
}
