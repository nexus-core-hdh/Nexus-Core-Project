import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { fixedAssetsApi, calculateDepreciation } from "./register";

export type RevaluationStatus = "Draft" | "Pending Approval" | "Approved" | "Rejected";

export interface AssetRevaluation {
  id: string;
  assetId: string;
  currentValue: number;
  revaluedValue: number;
  effectiveDate: string;
  reason: string;
  status: RevaluationStatus;
}

// currentValue on each seed row is the asset's actual straight-line NBV as of effectiveDate
// (per calculateDepreciation() in ./register) — kept in sync so this never shows a Current Value
// the live formula couldn't reproduce for the same asset/date.
const seed: AssetRevaluation[] = [
  { id: "rv-1", assetId: "fa-5", currentValue: 47_208_333, revaluedValue: 62_000_000, effectiveDate: "2026-01-01", reason: "Independent valuer report — market appreciation of Head Office annex", status: "Approved" },
  { id: "rv-2", assetId: "fa-1", currentValue: 6_615_833, revaluedValue: 7_500_000, effectiveDate: "2026-06-30", reason: "Mid-year technical revaluation of production machinery", status: "Pending Approval" },
];

const store = createMockStore<AssetRevaluation>(seed);

export const assetRevaluationsApi = {
  list: () => store.list(),
  snapshot: () => store.snapshot(),
  async create(input: Omit<AssetRevaluation, "id">) {
    assertRequired(input.assetId, "Asset");
    assertRequired(input.effectiveDate, "Effective Date");
    return store.create({ ...input, id: makeId("rv") });
  },
  async update(id: string, input: Partial<Omit<AssetRevaluation, "id">>) {
    return store.update(id, input);
  },
  remove: (id: string) => store.remove(id),
};

export function currentValueFor(assetId: string): number {
  const asset = fixedAssetsApi.snapshot().find((a) => a.id === assetId);
  if (!asset) return 0;
  return calculateDepreciation(asset).netBookValue;
}
