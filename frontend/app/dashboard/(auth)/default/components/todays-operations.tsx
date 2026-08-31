"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Calculator,
  Droplets,
  Gauge,
  PackageCheck,
  Printer,
  Scissors,
  Shirt,
  Sparkles,
  Truck,
  Waves,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchTodaysOperations, type ProcessKey, type ProcessMetric, type TodaysSummary } from "./operations-data";
import { TruncatedTitle } from "./truncated-title";

// Existing frontend routes for the two tracked processes — only Costing has one
// today (frontend/app/dashboard/(auth)/plm/costing-sheets/page.tsx); there is no
// Cutting Orders screen anywhere in the app yet, so no link is shown for it.
const PROCESS_ROUTES: Partial<Record<ProcessKey, string>> = {
  costing: "/dashboard/plm/costing-sheets"
};

const PROCESS_ICONS: Record<ProcessKey, LucideIcon> = {
  costing: Calculator,
  cutting: Scissors,
  knitting: Waves,
  dyeing: Droplets,
  sewing: Shirt,
  printing: Printer,
  embroidery: Sparkles,
  finishing: BadgeCheck,
  packing: PackageCheck,
  dispatch: Truck
};

// Rotates through a few equally-honest ways of saying "no process-tracking
// module exists for this yet" so the row doesn't read as 8 repeats of the
// same error string — purely a copy choice, not different underlying states.
const UNAVAILABLE_COPY: Record<ProcessKey, string> = {
  costing: "",
  cutting: "",
  knitting: "Tracking not configured",
  dyeing: "Process data unavailable",
  sewing: "Tracking not configured",
  printing: "Coming with process tracking",
  embroidery: "Process data unavailable",
  finishing: "Tracking not configured",
  packing: "Coming with process tracking",
  dispatch: "Process data unavailable"
};

function ProcessTile({ metric }: { metric: ProcessMetric }) {
  const Icon = PROCESS_ICONS[metric.key];

  if (!metric.tracked) {
    return (
      <div className="border-muted-foreground/20 bg-muted/20 flex flex-col items-center gap-1.5 rounded-lg border border-dashed p-3 text-center">
        <Icon className="text-muted-foreground/40 size-5" />
        <TruncatedTitle className="text-muted-foreground/80 text-xs font-medium">{metric.label}</TruncatedTitle>
        <span className="text-muted-foreground/60 text-[10px] leading-tight">{UNAVAILABLE_COPY[metric.key]}</span>
      </div>
    );
  }

  const showProgress = typeof metric.progressPct === "number";
  const route = PROCESS_ROUTES[metric.key];

  return (
    <div className="hover:border-primary/30 group relative flex flex-col gap-1.5 rounded-lg border p-3 transition-colors">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-3.5" />
          </div>
          <TruncatedTitle className="text-xs font-semibold">{metric.label}</TruncatedTitle>
        </div>
        <span className="flex size-1.5 shrink-0 rounded-full bg-emerald-500" title="Live data" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg leading-none font-bold tabular-nums">{metric.jobs ?? 0}</span>
        <span className="text-muted-foreground text-[10px]">jobs today</span>
      </div>

      {metric.key === "cutting" ? (
        <>
          <div className="text-muted-foreground flex items-center justify-between text-[10px] tabular-nums">
            <span className="text-emerald-600">{metric.completed ?? 0} done</span>
            <span className="text-amber-600">{metric.pending ?? 0} pending</span>
          </div>
          {showProgress && (
            <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, metric.progressPct!))}%` }}
              />
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground text-[10px] tabular-nums">
          {metric.planned ? `${metric.planned.toLocaleString()} qty costed` : "No qty today"}
        </div>
      )}

      {route && (
        <Link
          href={route}
          className="text-primary mt-0.5 flex items-center gap-0.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 hover:underline">
          View details
          <ArrowUpRight className="size-2.5" />
        </Link>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "good" }) {
  return (
    <div className="rounded-lg border p-2.5">
      <TruncatedTitle as="p" className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        {label}
      </TruncatedTitle>
      <p
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "warn" && "text-amber-600",
          tone === "good" && "text-emerald-600"
        )}>
        {value}
      </p>
    </div>
  );
}

export function TodaysOperations() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [processes, setProcesses] = React.useState<ProcessMetric[]>([]);
  const [summary, setSummary] = React.useState<TodaysSummary | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchTodaysOperations();
      setProcesses(res.processes);
      setSummary(res.summary);
    } catch (e: any) {
      setError(true);
      toast.error("Failed to load today's operations", { description: e?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const trackedCount = React.useMemo(() => processes.filter((p) => p.tracked).length, [processes]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="py-4 xl:col-span-8">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="text-primary size-4" />
            Today's Operations
          </CardTitle>
          {!loading && !error && (
            <CardAction>
              <Badge variant="outline" className="text-muted-foreground gap-1.5 font-normal">
                <span className="bg-primary block size-1.5 rounded-full" />
                {trackedCount} of {processes.length} processes tracked
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="px-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-[92px] rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
              <AlertTriangle className="size-5" />
              Couldn't load operations data.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {processes.map((m) => (
                <ProcessTile key={m.key} metric={m} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-4 xl:col-span-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Today's Reports</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[56px] rounded-lg" />
              ))}
            </div>
          ) : error || !summary ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
              <AlertTriangle className="size-5" />
              No report data available.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile label="Cutting Jobs" value={String(summary.cuttingJobsToday)} />
              <StatTile label="Output (pcs)" value={summary.cuttingOutputPiecesToday.toLocaleString()} />
              <StatTile
                label="Completed"
                value={String(summary.cuttingCompletedToday)}
                tone={summary.cuttingCompletedToday > 0 ? "good" : undefined}
              />
              <StatTile label="Pending" value={String(summary.cuttingPendingToday)} tone={summary.cuttingPendingToday > 0 ? "warn" : undefined} />
              <StatTile label="Reject (pcs)" value={summary.cuttingRejectPiecesToday.toLocaleString()} tone={summary.cuttingRejectPiecesToday > 0 ? "warn" : undefined} />
              <StatTile
                label="Cut Efficiency"
                value={summary.cuttingEfficiencyPct != null ? `${summary.cuttingEfficiencyPct}%` : "—"}
                tone={summary.cuttingEfficiencyPct != null ? "good" : undefined}
              />
              <StatTile label="Costing Sheets" value={String(summary.costingSheetsToday)} />
              <StatTile label="Qty Costed" value={summary.costingQtyToday.toLocaleString()} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
