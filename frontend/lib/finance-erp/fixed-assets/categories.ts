import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertNotDuplicate, assertRequired } from "@/lib/finance-erp/utils/validation";

export type DepreciationMethod = "Straight Line" | "Reducing Balance" | "Units of Production";
export const DEPRECIATION_METHODS: DepreciationMethod[] = ["Straight Line", "Reducing Balance", "Units of Production"];

export interface AssetCategory {
  id: string;
  name: string;
  code: string;
  description: string;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  /** Residual value as a % of purchase cost. */
  residualValuePct: number;
}

const seed: AssetCategory[] = [
  { id: "cat-1", name: "Plant & Machinery", code: "CAT-PM", description: "Production machinery and equipment", depreciationMethod: "Straight Line", usefulLifeYears: 10, residualValuePct: 5 },
  { id: "cat-2", name: "Office Equipment", code: "CAT-OE", description: "Computers, printers, office electronics", depreciationMethod: "Straight Line", usefulLifeYears: 5, residualValuePct: 0 },
  { id: "cat-3", name: "Furniture & Fixtures", code: "CAT-FF", description: "Office furniture and fixtures", depreciationMethod: "Straight Line", usefulLifeYears: 8, residualValuePct: 0 },
  { id: "cat-4", name: "Vehicles", code: "CAT-VH", description: "Company-owned vehicles", depreciationMethod: "Reducing Balance", usefulLifeYears: 6, residualValuePct: 10 },
  { id: "cat-5", name: "Computers & IT Equipment", code: "CAT-IT", description: "Servers, networking, IT infrastructure", depreciationMethod: "Straight Line", usefulLifeYears: 3, residualValuePct: 0 },
  { id: "cat-6", name: "Buildings", code: "CAT-BLD", description: "Owned buildings and civil structures", depreciationMethod: "Straight Line", usefulLifeYears: 30, residualValuePct: 15 },
];

const store = createMockStore<AssetCategory>(seed);

export const assetCategoriesApi = {
  list: () => store.list(),
  get: (id: string) => store.get(id),
  snapshot: () => store.snapshot(),
  async create(input: Omit<AssetCategory, "id">) {
    assertRequired(input.name, "Category Name");
    assertRequired(input.code, "Code");
    const all = store.snapshot();
    assertNotDuplicate(all, "code", input.code, "Category code");
    assertNotDuplicate(all, "name", input.name, "Category");
    return store.create({ ...input, id: makeId("cat") });
  },
  async update(id: string, input: Omit<AssetCategory, "id">) {
    assertRequired(input.name, "Category Name");
    assertRequired(input.code, "Code");
    const all = store.snapshot();
    assertNotDuplicate(all, "code", input.code, "Category code", "id", id);
    assertNotDuplicate(all, "name", input.name, "Category", "id", id);
    return store.update(id, input);
  },
  remove: (id: string) => store.remove(id),
};

export function categoryName(id: string): string {
  return store.snapshot().find((c) => c.id === id)?.name ?? "—";
}

export function categorySnapshot(id: string): AssetCategory | undefined {
  return store.snapshot().find((c) => c.id === id);
}
