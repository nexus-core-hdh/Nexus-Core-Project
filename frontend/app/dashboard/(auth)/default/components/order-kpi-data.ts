// Order KPI data layer.
//
// Backed by the real `MA_WorkOrder` legacy table (nexuscore-backend/src/modules/legacy-erp/
// work-order.service.ts) via GET /legacy-erp/work-orders (legacyErpApi.workOrders.list) — the
// exact same list query the Work Orders screen itself uses (work-orders-list/page.tsx),
// "IsDeleted" = 0 only, no separate company/tenant filter (MA_WorkOrder has no per-row tenant
// scoping in this codebase today — every row is written with CompanyId=1, see work-order.service.ts's
// own create()). Previously this file read financeApi.orders.list() (the unrelated Prisma `Order`
// Sales-Order model) — a different table from the real Work Orders being created on the Work
// Order screen, which is why this row showed all zeros despite real Work Orders existing. Fixed
// to read the real source of truth instead of inventing a second one.
//
// Status bucketing reuses MA_WorkOrder's own real "Status" smallint column, via the SAME
// convention already assigned to it by work-orders/page.tsx's STATUS_OPTIONS (there is no
// existing lookup/enum table for this legacy smallint column — see that file's own comment) —
// not a second, invented convention:
//   0 Open | 1 Planned | 2 In Production | 3 Completed | 4 Cancelled
//
//   Pending   = Open                          (created, not yet scheduled)
//   Running   = Planned | In Production        (actively in the pipeline, not yet done)
//   Completed = Completed
//   Cancelled = Cancelled
//   Total     = all of the above (every non-deleted Work Order in scope)
// A null/undefined Status (legacy rows written before this column was used) falls into none of
// the four buckets but still counts toward Total — same "counted, not fabricated into a bucket"
// rule the Sales-Order version used for out-of-window rows.
//
// Delayed IS computable here (unlike the Sales `Order` model, which has no due-date field):
// MA_WorkOrder has a real "DeliveryDate" column (work-order.service.ts's HEADER_COLUMNS, shown
// as "Delivery" on the Work Order screen). Delayed = DeliveryDate in the past AND Status is not
// Completed/Cancelled — a real, derived snapshot as of now, not a fabricated figure. Any Work
// Order missing a DeliveryDate is correctly excluded (no invented due date), not counted as
// delayed. Delayed is a live current-state count, not a calendar-month bucket (an order overdue
// since last month is still overdue today) — so, like the prior Sales-Order version, it carries
// no month-over-month trend or sparkline.
//
// "From last month" is a real month-over-month comparison computed from `workOrderDate`
// (Total/Running/Completed/Pending/Cancelled only), not a fabricated percentage.

import { legacyErpApi } from "@/lib/nexuscore-api";

export type OrderKpiKey = "total" | "running" | "completed" | "delayed" | "pending" | "cancelled";

export interface OrderKpi {
  key: OrderKpiKey;
  label: string;
  value: number | null; // null = unsupported by schema (never the case here now, kept for the shared card component's contract)
  trendPct: number | null; // null = no comparable prior-period data
  spark: number[]; // last 6 months' counts for this bucket, oldest -> newest
}

// Real MA_WorkOrder.Status values — see this file's own top comment for why these exact numbers.
const OPEN_STATUS = 0;
const RUNNING_STATUSES = new Set([1, 2]); // Planned, In Production
const COMPLETED_STATUS = 3;
const CANCELLED_STATUS = 4;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function workOrderDate(o: any): Date {
  const raw = o.workOrderDate;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function bucketOf(status: number | null): Exclude<OrderKpiKey, "total" | "delayed"> | null {
  if (status === OPEN_STATUS) return "pending";
  if (status != null && RUNNING_STATUSES.has(status)) return "running";
  if (status === COMPLETED_STATUS) return "completed";
  if (status === CANCELLED_STATUS) return "cancelled";
  return null; // no Status recorded yet — counted in Total only, not fabricated into a bucket
}

export async function fetchOrderKpis(): Promise<OrderKpi[]> {
  const res = await legacyErpApi.workOrders.list().catch(() => null);
  const orders: any[] = Array.isArray(res) ? res : ((res as any)?.data ?? []);

  const now = new Date();
  const thisMonthKey = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = monthKey(lastMonthDate);

  // Last 6 calendar months (oldest -> newest, including the current one) for sparklines.
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    monthKeys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }

  const emptyCounts = () => ({ total: 0, running: 0, completed: 0, pending: 0, cancelled: 0 });
  const byMonth = new Map<string, ReturnType<typeof emptyCounts>>();
  for (const mk of monthKeys) byMonth.set(mk, emptyCounts());
  if (!byMonth.has(lastMonthKey)) byMonth.set(lastMonthKey, emptyCounts());

  let delayed = 0;

  for (const o of orders) {
    const status: number | null = o.status == null ? null : Number(o.status);

    // Delayed — a live snapshot across ALL in-scope Work Orders, not just the tracked months
    // (see top comment), so this loop iteration handles it independently of the month bucketing.
    if (o.deliveryDate) {
      const due = new Date(o.deliveryDate);
      if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime() && status !== COMPLETED_STATUS && status !== CANCELLED_STATUS) {
        delayed += 1;
      }
    }

    const mk = monthKey(workOrderDate(o));
    const bucket = byMonth.get(mk);
    if (!bucket) continue; // outside the tracked window — ignored, not fabricated
    bucket.total += 1;
    const b = bucketOf(status);
    if (b) bucket[b] += 1;
  }

  const thisMonth = byMonth.get(thisMonthKey) ?? emptyCounts();
  const lastMonth = byMonth.get(lastMonthKey) ?? emptyCounts();

  const trend = (curr: number, prev: number): number | null => {
    if (prev > 0) return Math.round(((curr - prev) / prev) * 1000) / 10;
    if (prev === 0 && curr > 0) return null; // no baseline to compare against — not "infinite%"
    return null; // both zero — nothing to compare
  };

  const sparkFor = (field: keyof ReturnType<typeof emptyCounts>) =>
    monthKeys.map((mk) => byMonth.get(mk)?.[field] ?? 0);

  const kpis: OrderKpi[] = [
    { key: "total", label: "Total Orders", value: thisMonth.total, trendPct: trend(thisMonth.total, lastMonth.total), spark: sparkFor("total") },
    { key: "running", label: "Running Orders", value: thisMonth.running, trendPct: trend(thisMonth.running, lastMonth.running), spark: sparkFor("running") },
    { key: "completed", label: "Completed Orders", value: thisMonth.completed, trendPct: trend(thisMonth.completed, lastMonth.completed), spark: sparkFor("completed") },
    { key: "delayed", label: "Delayed Orders", value: delayed, trendPct: null, spark: [] },
    { key: "pending", label: "Pending Orders", value: thisMonth.pending, trendPct: trend(thisMonth.pending, lastMonth.pending), spark: sparkFor("pending") },
    { key: "cancelled", label: "Cancelled Orders", value: thisMonth.cancelled, trendPct: trend(thisMonth.cancelled, lastMonth.cancelled), spark: sparkFor("cancelled") }
  ];

  return kpis;
}
