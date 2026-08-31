// Order KPI data layer.
//
// Backed by the real `Order` model (nexuscore-backend/prisma/schema.prisma) via
// GET /finance/orders (nexuscore-backend/src/modules/finance) — company/branch
// scoped server-side. Real enum values only (OrderStatus): PENDING, PROCESSING,
// PAID, SHIPPED, DELIVERED, COMPLETED, CANCELLED, FAILED. No status name here is
// invented — the six KPI buckets are groupings of these exact values:
//
//   Pending   = PENDING
//   Running   = PROCESSING | PAID | SHIPPED   (actively being worked, not yet done)
//   Completed = DELIVERED | COMPLETED         (reached a fulfilled end state)
//   Cancelled = CANCELLED | FAILED            (did not complete)
//   Total     = all of the above, type = SALE only (RETURN/REFUND are a distinct
//               OrderType and would double-count against "orders placed")
//
// Delayed is intentionally NEVER computed: `Order` has orderDate/shippedDate/
// deliveredDate (all either creation or *actual* event timestamps) but no
// expected/due/promised delivery date field to compare "today" against — so a
// delay figure would be invented, not derived. Mirrors the same rule already
// applied to Cutting/Costing in operations-data.ts.
//
// "From last month" is a real month-over-month comparison computed from
// `orderDate` (falling back to `createdAt`), not a fabricated percentage.

import { financeApi } from "@/lib/nexuscore-api";

export type OrderKpiKey = "total" | "running" | "completed" | "delayed" | "pending" | "cancelled";

export interface OrderKpi {
  key: OrderKpiKey;
  label: string;
  value: number | null; // null = unsupported by schema (Delayed only)
  trendPct: number | null; // null = no comparable prior-period data
  spark: number[]; // last 6 months' counts for this bucket, oldest -> newest
}

const RUNNING_STATUSES = new Set(["PROCESSING", "PAID", "SHIPPED"]);
const COMPLETED_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const CANCELLED_STATUSES = new Set(["CANCELLED", "FAILED"]);

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function orderDate(o: any): Date {
  const raw = o.orderDate || o.createdAt;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function bucketOf(status: string): Exclude<OrderKpiKey, "total" | "delayed"> | null {
  if (status === "PENDING") return "pending";
  if (RUNNING_STATUSES.has(status)) return "running";
  if (COMPLETED_STATUSES.has(status)) return "completed";
  if (CANCELLED_STATUSES.has(status)) return "cancelled";
  return null;
}

export async function fetchOrderKpis(): Promise<OrderKpi[]> {
  const res = await financeApi.orders.list({ type: "SALE" }).catch(() => null);
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

  for (const o of orders) {
    const mk = monthKey(orderDate(o));
    const bucket = byMonth.get(mk);
    if (!bucket) continue; // outside the tracked window — ignored, not fabricated
    bucket.total += 1;
    const b = bucketOf(String(o.status));
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
    { key: "delayed", label: "Delayed Orders", value: null, trendPct: null, spark: [] },
    { key: "pending", label: "Pending Orders", value: thisMonth.pending, trendPct: trend(thisMonth.pending, lastMonth.pending), spark: sparkFor("pending") },
    { key: "cancelled", label: "Cancelled Orders", value: thisMonth.cancelled, trendPct: trend(thisMonth.cancelled, lastMonth.cancelled), spark: sparkFor("cancelled") }
  ];

  return kpis;
}
