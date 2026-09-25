import { fixedAssetsApi, calculateDepreciation, type FixedAsset } from "./register";
import { categoryName } from "./categories";

export interface DepreciationScheduleRow {
  assetId: string;
  assetName: string;
  period: string;
  openingValue: number;
  depreciation: number;
  accumulatedDepreciation: number;
  closingValue: number;
}

function periodsSince(purchaseDate: string, granularity: "monthly" | "yearly"): string[] {
  const start = new Date(purchaseDate);
  const now = new Date();
  const periods: string[] = [];
  if (granularity === "yearly") {
    for (let y = start.getFullYear(); y <= now.getFullYear(); y++) periods.push(String(y));
  } else {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= now) {
      periods.push(cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  // Keep the schedule readable — most recent 12 periods only.
  return periods.slice(-12);
}

function asOfForPeriod(period: string, granularity: "monthly" | "yearly"): string {
  if (granularity === "yearly") return `${period}-12-31`;
  const d = new Date(`01 ${period}`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/** Builds a period-by-period schedule for every asset (or one, if assetId given) by sampling
 *  calculateDepreciation() at each period's "as of" date and diffing consecutive closing values. */
export function buildDepreciationSchedule(granularity: "monthly" | "yearly", assetIdFilter?: string): DepreciationScheduleRow[] {
  const assets = fixedAssetsApi.snapshot().filter((a) => !assetIdFilter || a.id === assetIdFilter);
  const rows: DepreciationScheduleRow[] = [];

  for (const asset of assets) {
    const periods = periodsSince(asset.purchaseDate, granularity);
    let previousAccumulated = 0;
    for (const period of periods) {
      const asOf = asOfForPeriod(period, granularity);
      if (new Date(asOf) < new Date(asset.purchaseDate)) continue;
      const { accumulatedDepreciation, netBookValue } = calculateDepreciation(asset, asOf);
      const openingValue = asset.purchaseCost - previousAccumulated;
      rows.push({
        assetId: asset.assetId,
        assetName: `${asset.name} (${categoryName(asset.categoryId)})`,
        period,
        openingValue,
        depreciation: accumulatedDepreciation - previousAccumulated,
        accumulatedDepreciation,
        closingValue: netBookValue,
      });
      previousAccumulated = accumulatedDepreciation;
    }
  }
  return rows;
}

export function assetOptionsForFilter(): { id: string; label: string }[] {
  return fixedAssetsApi.snapshot().map((a: FixedAsset) => ({ id: a.id, label: `${a.assetId} - ${a.name}` }));
}
