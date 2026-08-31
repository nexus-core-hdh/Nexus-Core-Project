// "Today's Operations" data layer.
//
// Investigated first (see prisma/schema.prisma + nexuscore-backend/src/modules,
// plus a live query against the dev DB): of the 10 requested manufacturing
// processes, only two have any real backing entity/API in this codebase:
//
//   - Cutting  → CuttingOrder / CuttingOrderLine / CuttingBatch / CutPiece
//                (nexuscore-backend/src/modules/cutting, GET /cutting-orders)
//   - Costing  → CostingSheet (nexuscore-backend/src/modules/costing, mounted
//                under /plm/costing-sheets, already wrapped by plmApi.costingSheets)
//
// Knitting, Dyeing, Sewing, Printing, Embroidery, Finishing, Packing and
// Dispatch have no Prisma model, no service/controller, and no DB table
// (confirmed via `SELECT tablename FROM pg_tables ... ILIKE '%knit%' / '%dye%'
// / '%sew%' / '%print%' / '%embroid%' / '%finish%' / '%pack%' / '%dispatch%'`
// — MD_DyeType/MD_FinishGSM/MD_Printer/IM_Packaging* exist but are definition
// masters, not job/order tracking). Per the task's own data rules ("do not
// invent calculations unsupported by the schema", "show only metrics actually
// supported by existing data"), those 8 are rendered as untracked placeholders
// instead of fabricated numbers — see `tracked: false` below.
//
// "Delayed" is intentionally never computed: CuttingOrder/CuttingBatch and
// CostingSheet have no due/expected-date field to compare against (only
// cutDate/costingDate — the date the work happened, not a deadline), so a
// delay figure would be invented, not derived.

import { cuttingApi, plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";

export type ProcessKey =
  | "costing" | "cutting" | "knitting" | "dyeing" | "sewing"
  | "printing" | "embroidery" | "finishing" | "packing" | "dispatch";

export interface ProcessMetric {
  key: ProcessKey;
  label: string;
  tracked: boolean;
  jobs?: number;
  planned?: number;
  completed?: number;
  pending?: number;
  rejected?: number;
  unit?: string;
  progressPct?: number;
}

export interface TodaysSummary {
  cuttingJobsToday: number;
  cuttingCompletedToday: number;
  cuttingPendingToday: number;
  cuttingOutputPiecesToday: number;
  cuttingRejectPiecesToday: number;
  cuttingEfficiencyPct: number | null;
  costingSheetsToday: number;
  costingQtyToday: number;
}

const UNTRACKED_LABELS: Record<Exclude<ProcessKey, "costing" | "cutting">, string> = {
  knitting: "Knitting",
  dyeing: "Dyeing",
  sewing: "Sewing",
  printing: "Printing",
  embroidery: "Embroidery",
  finishing: "Finishing",
  packing: "Packing",
  dispatch: "Dispatch"
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(dateLike?: string | null) {
  if (!dateLike) return false;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return false;
  return isSameDay(d, new Date());
}

export async function fetchTodaysOperations(): Promise<{ processes: ProcessMetric[]; summary: TodaysSummary }> {
  const user = getCurrentUser();

  const [cuttingRes, costingRes] = await Promise.all([
    cuttingApi.list({ branchId: user?.branchId != null ? String(user.branchId) : undefined, limit: 200 }).catch(() => null),
    plmApi.costingSheets.list({ limit: 200 }).catch(() => null)
  ]);

  // ── Cutting ──────────────────────────────────────────────────────────────
  // Both list endpoints return { data, meta } from their service, but the
  // backend's ResponseInterceptor hoists `data` to the top of the envelope
  // and the frontend client unwraps it — so the resolved value is normally
  // the array itself. Handled defensively either way, matching the existing
  // convention in plm/costing-sheets/page.tsx and plm/product-cards/page.tsx.
  const cuttingOrders: any[] = Array.isArray(cuttingRes) ? cuttingRes : ((cuttingRes as any)?.data ?? []);
  const todaysCuttingOrders = cuttingOrders.filter((o) => isToday(o.cutDate) || isToday(o.createdAt));

  let cuttingPlanned = 0;
  let cuttingCompleted = 0;
  let cuttingRejected = 0;
  let cuttingPendingOrders = 0;

  for (const order of todaysCuttingOrders) {
    const batches: any[] = Array.isArray(order.batches) ? order.batches : [];
    for (const b of batches) {
      cuttingPlanned += Number(b.plannedPieces) || 0;
      if (b.status === "completed") {
        cuttingCompleted += Number(b.actualPieces) || 0;
        cuttingRejected += Number(b.defectPieces) || 0;
      }
    }
    if (order.status !== "completed" && order.status !== "rejected") cuttingPendingOrders += 1;
  }

  const cuttingEfficiencyPct = cuttingPlanned > 0 ? Math.round((cuttingCompleted / cuttingPlanned) * 1000) / 10 : null;

  const cuttingMetric: ProcessMetric = {
    key: "cutting",
    label: "Cutting",
    tracked: true,
    jobs: todaysCuttingOrders.length,
    planned: cuttingPlanned,
    completed: cuttingCompleted,
    pending: cuttingPendingOrders,
    rejected: cuttingRejected,
    unit: "pcs",
    progressPct: cuttingEfficiencyPct ?? undefined
  };

  // ── Costing ──────────────────────────────────────────────────────────────
  const costingSheets: any[] = Array.isArray(costingRes) ? costingRes : ((costingRes as any)?.data ?? []);
  const todaysCostingSheets = costingSheets.filter((c) => isToday(c.costingDate) || isToday(c.createdAt));
  const costingQty = todaysCostingSheets.reduce((sum, c) => sum + (Number(c.orderQuantity) || 0), 0);

  const costingMetric: ProcessMetric = {
    key: "costing",
    label: "Costing",
    tracked: true,
    jobs: todaysCostingSheets.length,
    planned: costingQty || undefined,
    unit: "sheets"
  };

  // ── Untracked processes: no model/API exists for these in this codebase ──
  const untracked: ProcessMetric[] = (Object.keys(UNTRACKED_LABELS) as (keyof typeof UNTRACKED_LABELS)[]).map((key) => ({
    key,
    label: UNTRACKED_LABELS[key],
    tracked: false
  }));

  const processes: ProcessMetric[] = [costingMetric, cuttingMetric, ...untracked];

  const summary: TodaysSummary = {
    cuttingJobsToday: todaysCuttingOrders.length,
    cuttingCompletedToday: todaysCuttingOrders.filter((o) => o.status === "completed").length,
    cuttingPendingToday: cuttingPendingOrders,
    cuttingOutputPiecesToday: cuttingCompleted,
    cuttingRejectPiecesToday: cuttingRejected,
    cuttingEfficiencyPct,
    costingSheetsToday: todaysCostingSheets.length,
    costingQtyToday: costingQty
  };

  return { processes, summary };
}
