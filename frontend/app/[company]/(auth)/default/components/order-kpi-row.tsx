"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Hourglass,
  PlayCircle,
  ShoppingBag,
  SquareCheckBig,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchOrderKpis, type OrderKpi, type OrderKpiKey } from "./order-kpi-data";
import { TruncatedTitle } from "./truncated-title";

const ICONS: Record<OrderKpiKey, LucideIcon> = {
  total: ShoppingBag,
  running: PlayCircle,
  completed: SquareCheckBig,
  delayed: Clock,
  pending: Hourglass,
  cancelled: XCircle
};

const ICON_STYLES: Record<OrderKpiKey, string> = {
  total: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  running: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  completed: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  delayed: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  pending: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  cancelled: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
};

function OrderKpiCard({ kpi }: { kpi: OrderKpi }) {
  const Icon = ICONS[kpi.key];
  const unsupported = kpi.value === null;
  const sparkData = kpi.spark.map((v, i) => ({ i, v }));
  const hasTrend = kpi.trendPct !== null;
  const trendUp = (kpi.trendPct ?? 0) >= 0;

  return (
    <Card className="gap-3 py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", ICON_STYLES[kpi.key])}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <TruncatedTitle as="p" className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              {kpi.label}
            </TruncatedTitle>
            <p className={cn("text-xl leading-tight font-semibold tabular-nums", unsupported && "text-muted-foreground/60")}>
              {unsupported ? "—" : kpi.value}
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-8 items-center justify-between gap-2">
          {unsupported ? (
            <span className="text-muted-foreground/70 text-[11px] leading-tight">Not available yet</span>
          ) : hasTrend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trendUp ? "text-emerald-600" : "text-red-600"
              )}>
              {trendUp ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {Math.abs(kpi.trendPct!)}%
              <span className="text-muted-foreground font-normal">&nbsp;from last month</span>
            </span>
          ) : (
            <span className="text-muted-foreground text-[11px]">No prior-month data</span>
          )}

          {!unsupported && sparkData.length > 0 && (
            <div className="h-8 w-14 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`order-spark-${kpi.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    fill={`url(#order-spark-${kpi.key})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OrderKpiRow() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [kpis, setKpis] = React.useState<OrderKpi[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetchOrderKpis();
        if (!cancelled) setKpis(res);
      } catch (e: any) {
        if (!cancelled) {
          setError(true);
          toast.error("Failed to load order metrics", { description: e?.message || "Please try again." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="py-6">
        <CardContent className="text-muted-foreground px-4 text-center text-sm">
          Couldn't load order metrics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi) => (
        <OrderKpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}
