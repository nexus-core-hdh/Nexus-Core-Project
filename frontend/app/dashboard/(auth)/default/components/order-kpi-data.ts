// Order KPI data layer.
//
// Backed by the real `MA_WorkOrder` legacy table — the Work Orders the Work Orders screen lists
// ("IsDeleted" = 0) — counted server-side by GET /dashboard/order-kpis (dashboard.service.ts's
// orderKpis()) for the dashboard's selected date range, by each order's own "WorkOrderDate".
//
// Status bucketing reuses MA_WorkOrder's own real "Status" smallint column, via the SAME
// convention already assigned to it by work-orders/page.tsx's STATUS_OPTIONS (there is no
// existing lookup/enum table for this legacy smallint column — see that file's own comment):
//   0 Open | 1 Planned | 2 In Production | 3 Completed | 4 Cancelled
//
//   Pending   = Open                          (created, not yet scheduled)
//   Running   = Planned | In Production        (actively in the pipeline, not yet done)
//   Completed = Completed
//   Cancelled = Cancelled
//   Total     = every Work Order dated in the range (a row with no Status counts here only)
//
// The range is whole local days: the browser's start of the first day to the end of the last day
// (the same local calendar day the Work Orders list shows each order on), sent as exact instants.
// The trend compares the range with the same-length period immediately before it; the sparkline
// splits the range into equal slices.
//
// Delayed is a live snapshot, not a range bucket: DeliveryDate already past AND Status not
// Completed/Cancelled, across all Work Orders (an order overdue since before the range is still
// overdue today) — so it carries no trend or sparkline.

import { endOfDay, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { dashboardApi } from "@/lib/nexuscore-api";

export type OrderKpiKey = "total" | "running" | "completed" | "delayed" | "pending" | "cancelled";

export interface OrderKpi {
  key: OrderKpiKey;
  label: string;
  value: number | null; // null = unsupported by schema (never the case here now, kept for the shared card component's contract)
  trendPct: number | null; // null = no comparable prior-period data
  spark: number[]; // counts per equal slice of the selected range, oldest -> newest
}

/** The range as exact instants covering whole local days; a half-picked range is its one day. */
export function toDayBounds(range: DateRange | undefined): { from: Date; to: Date } | null {
  if (!range?.from) return null;
  return { from: startOfDay(range.from), to: endOfDay(range.to ?? range.from) };
}

const trend = (curr: number, prev: number): number | null => {
  if (prev > 0) return Math.round(((curr - prev) / prev) * 1000) / 10;
  return null; // no baseline to compare against — not "infinite%", and both-zero compares nothing
};

export async function fetchOrderKpis(from: Date, to: Date): Promise<OrderKpi[]> {
  const { current, previous, delayed, spark } = await dashboardApi.orderKpis(from, to);
  const kpi = (key: Exclude<OrderKpiKey, "delayed">, label: string): OrderKpi => ({
    key, label, value: current[key], trendPct: trend(current[key], previous[key]), spark: spark[key]
  });
  return [
    kpi("total", "Total Orders"),
    kpi("running", "Running Orders"),
    kpi("completed", "Completed Orders"),
    { key: "delayed", label: "Delayed Orders", value: delayed, trendPct: null, spark: [] },
    kpi("pending", "Pending Orders"),
    kpi("cancelled", "Cancelled Orders")
  ];
}
