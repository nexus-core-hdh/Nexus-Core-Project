import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { assertRequired } from "@/lib/finance-erp/utils/validation";
import { BRANCHES, EMPLOYEES } from "@/lib/finance-erp/mock/master-data";
import { fixedAssetsApi, calculateDepreciation } from "./register";

export interface AssetTransfer {
  id: string;
  assetId: string;
  fromBranchId: string;
  toBranchId: string;
  custodianEmployeeId: string;
  date: string;
  reason: string;
}

export interface AssetDisposal {
  id: string;
  assetId: string;
  disposalDate: string;
  disposalReason: string;
  saleProceeds: number;
  bookValue: number;
  gainLoss: number;
}

const transferSeed: AssetTransfer[] = [
  { id: "tr-1", assetId: "fa-6", fromBranchId: "br-1", toBranchId: "br-3", custodianEmployeeId: "emp-5", date: "2025-11-02", reason: "Regional office relocation of printer fleet" },
  { id: "tr-2", assetId: "fa-2", fromBranchId: "br-1", toBranchId: "br-2", custodianEmployeeId: "emp-3", date: "2026-01-18", reason: "Reassigned to Lahore procurement team" },
];

const disposalSeed: AssetDisposal[] = [
  // bookValue is the asset's actual straight-line NBV at the disposal date (purchaseCost
  // 1,450,000, 3yr useful life, 0% residual, 34 months elapsed since 2023-05-15 as of
  // 2026-03-01) — must stay in sync with calculateDepreciation() so this record doesn't show a
  // book value the live formula could never produce.
  { id: "ds-1", assetId: "fa-3", disposalDate: "2026-03-01", disposalReason: "Obsolete hardware, replaced by cloud infrastructure", saleProceeds: 180_000, bookValue: 80_556, gainLoss: 180_000 - 80_556 },
];

const transferStore = createMockStore<AssetTransfer>(transferSeed);
const disposalStore = createMockStore<AssetDisposal>(disposalSeed);

export const assetTransfersApi = {
  list: () => transferStore.list(),
  snapshot: () => transferStore.snapshot(),
  async create(input: Omit<AssetTransfer, "id">) {
    assertRequired(input.assetId, "Asset");
    assertRequired(input.toBranchId, "To Branch/Location");
    const record = await transferStore.create({ ...input, id: makeId("tr") });
    await fixedAssetsApi.update(input.assetId, { locationBranchId: input.toBranchId, status: "Transferred" });
    return record;
  },
  remove: (id: string) => transferStore.remove(id),
};

export const assetDisposalsApi = {
  list: () => disposalStore.list(),
  snapshot: () => disposalStore.snapshot(),
  async create(input: Omit<AssetDisposal, "id" | "gainLoss">) {
    assertRequired(input.assetId, "Asset");
    assertRequired(input.disposalDate, "Disposal Date");
    const gainLoss = input.saleProceeds - input.bookValue;
    const record = await disposalStore.create({ ...input, id: makeId("ds"), gainLoss });
    await fixedAssetsApi.update(input.assetId, { status: "Disposed" });
    return record;
  },
  remove: (id: string) => disposalStore.remove(id),
};

/** Current book value for an asset — used to prefill a new Disposal record. */
export function currentBookValue(assetId: string): number {
  const asset = fixedAssetsApi.snapshot().find((a) => a.id === assetId);
  if (!asset) return 0;
  return calculateDepreciation(asset).netBookValue;
}

export { BRANCHES, EMPLOYEES };
