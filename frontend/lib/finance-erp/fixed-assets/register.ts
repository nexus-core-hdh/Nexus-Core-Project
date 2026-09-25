import { createMockStore, formatDocNumber, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired } from "@/lib/finance-erp/utils/validation";
import { BRANCHES, DEPARTMENTS, EMPLOYEES } from "@/lib/finance-erp/mock/master-data";
import type { DepreciationMethod } from "./categories";
import { categorySnapshot } from "./categories";

export type AssetStatus = "Active" | "Under Maintenance" | "Disposed" | "Transferred";

export interface FixedAsset {
  id: string;
  assetId: string;
  name: string;
  categoryId: string;
  purchaseDate: string;
  purchaseCost: number;
  usefulLifeYears: number;
  residualValuePct: number;
  depreciationMethod: DepreciationMethod;
  locationBranchId: string;
  departmentId: string;
  custodianEmployeeId: string;
  status: AssetStatus;
}

let sequence = 6;

function monthsElapsed(purchaseDate: string, asOf: string): number {
  const p = new Date(purchaseDate);
  const a = new Date(asOf);
  const months = (a.getFullYear() - p.getFullYear()) * 12 + (a.getMonth() - p.getMonth());
  return Math.max(0, months);
}

/** Straight-line for "Straight Line"/"Units of Production" (no production-unit data is mocked,
 *  so Units of Production falls back to straight-line — documented simplification), a standard
 *  declining-balance formula for "Reducing Balance". */
export function calculateDepreciation(asset: FixedAsset, asOf: string = new Date().toISOString().slice(0, 10)) {
  const residualValue = (asset.residualValuePct / 100) * asset.purchaseCost;
  const depreciableBase = Math.max(0, asset.purchaseCost - residualValue);
  const monthsUsed = Math.min(monthsElapsed(asset.purchaseDate, asOf), asset.usefulLifeYears * 12);
  const yearsUsed = monthsUsed / 12;

  let accumulatedDepreciation: number;
  if (asset.depreciationMethod === "Reducing Balance") {
    const rate = asset.residualValuePct > 0 && asset.usefulLifeYears > 0
      ? 1 - Math.pow(asset.residualValuePct / 100, 1 / asset.usefulLifeYears)
      : 1 / Math.max(1, asset.usefulLifeYears);
    const closing = asset.purchaseCost * Math.pow(1 - rate, yearsUsed);
    accumulatedDepreciation = Math.min(depreciableBase, asset.purchaseCost - closing);
  } else {
    const monthlyDepreciation = asset.usefulLifeYears > 0 ? depreciableBase / (asset.usefulLifeYears * 12) : 0;
    accumulatedDepreciation = Math.min(depreciableBase, monthlyDepreciation * monthsUsed);
  }

  const netBookValue = asset.purchaseCost - accumulatedDepreciation;
  return { accumulatedDepreciation, netBookValue };
}

const seed: FixedAsset[] = [
  { id: "fa-1", assetId: formatDocNumber("FA", 1, 2024), name: "CNC Fabric Cutting Machine", categoryId: "cat-1", purchaseDate: "2024-02-10", purchaseCost: 8_500_000, usefulLifeYears: 10, residualValuePct: 5, depreciationMethod: "Straight Line", locationBranchId: "br-1", departmentId: "dep-4", custodianEmployeeId: "emp-7", status: "Active" },
  { id: "fa-2", assetId: formatDocNumber("FA", 2, 2024), name: "Toyota Hilux - Delivery", categoryId: "cat-4", purchaseDate: "2024-06-01", purchaseCost: 9_200_000, usefulLifeYears: 6, residualValuePct: 10, depreciationMethod: "Reducing Balance", locationBranchId: "br-1", departmentId: "dep-5", custodianEmployeeId: "emp-4", status: "Active" },
  // Status is "Disposed", not "Under Maintenance" — this asset has a matching seeded Disposal
  // record (ds-1 in transfer-disposal.ts) and the two must not contradict each other.
  { id: "fa-3", assetId: formatDocNumber("FA", 3, 2023), name: "Dell PowerEdge Server", categoryId: "cat-5", purchaseDate: "2023-05-15", purchaseCost: 1_450_000, usefulLifeYears: 3, residualValuePct: 0, depreciationMethod: "Straight Line", locationBranchId: "br-1", departmentId: "dep-1", custodianEmployeeId: "emp-1", status: "Disposed" },
  { id: "fa-4", assetId: formatDocNumber("FA", 4, 2022), name: "Executive Office Furniture Set", categoryId: "cat-3", purchaseDate: "2022-11-20", purchaseCost: 620_000, usefulLifeYears: 8, residualValuePct: 0, depreciationMethod: "Straight Line", locationBranchId: "br-2", departmentId: "dep-3", custodianEmployeeId: "emp-6", status: "Active" },
  { id: "fa-5", assetId: formatDocNumber("FA", 5, 2021), name: "Head Office Building - Annex", categoryId: "cat-6", purchaseDate: "2021-01-05", purchaseCost: 55_000_000, usefulLifeYears: 30, residualValuePct: 15, depreciationMethod: "Straight Line", locationBranchId: "br-1", departmentId: "dep-1", custodianEmployeeId: "emp-2", status: "Active" },
  { id: "fa-6", assetId: formatDocNumber("FA", 6, 2023), name: "HP LaserJet Fleet (12 units)", categoryId: "cat-2", purchaseDate: "2023-09-12", purchaseCost: 480_000, usefulLifeYears: 5, residualValuePct: 0, depreciationMethod: "Straight Line", locationBranchId: "br-3", departmentId: "dep-1", custodianEmployeeId: "emp-5", status: "Active" },
];

const store = createMockStore<FixedAsset>(seed);

export const fixedAssetsApi = {
  list: () => store.list(),
  get: (id: string) => store.get(id),
  snapshot: () => store.snapshot(),
  async create(input: Omit<FixedAsset, "id" | "assetId">) {
    assertRequired(input.name, "Asset Name");
    assertRequired(input.categoryId, "Category");
    assertRequired(input.purchaseDate, "Purchase Date");
    const assetId = formatDocNumber("FA", ++sequence);
    const all = store.snapshot();
    assertNotDuplicate(all, "assetId", assetId, "Asset ID");
    return store.create({ ...input, id: makeId("fa"), assetId });
  },
  async update(id: string, input: Partial<Omit<FixedAsset, "id" | "assetId">>) {
    return store.update(id, input);
  },
  remove: (id: string) => store.remove(id),
};

export function assetName(id: string): string {
  return store.snapshot().find((a) => a.id === id)?.name ?? "—";
}

export { BRANCHES, DEPARTMENTS, EMPLOYEES, categorySnapshot };
