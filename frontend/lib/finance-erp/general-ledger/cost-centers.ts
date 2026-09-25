import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { COST_CENTERS, type CostCenter } from "@/lib/finance-erp/mock/master-data";
import { assertNotDuplicate, assertRequired } from "@/lib/finance-erp/utils/validation";

export type { CostCenter };

const store = createMockStore<CostCenter>(COST_CENTERS.map((c) => ({ ...c })));

export async function getCostCenters(): Promise<CostCenter[]> {
  return (await store.list()).sort((a, b) => a.code.localeCompare(b.code));
}

export interface CostCenterInput { code: string; name: string; branchId: string; manager: string; budget: number; status: CostCenter["status"]; }

function validate(input: CostCenterInput, excludeId?: string) {
  assertRequired(input.code, "Code");
  assertRequired(input.name, "Name");
  const rows = store.snapshot();
  assertNotDuplicate(rows, "code", input.code, "Cost center code", "id", excludeId);
}

export async function createCostCenter(input: CostCenterInput): Promise<CostCenter> {
  validate(input);
  return store.create({ id: makeId("cc"), ...input });
}

export async function updateCostCenter(id: string, input: CostCenterInput): Promise<CostCenter> {
  validate(input, id);
  return store.update(id, input);
}

export async function deleteCostCenter(id: string): Promise<void> {
  return store.remove(id);
}
