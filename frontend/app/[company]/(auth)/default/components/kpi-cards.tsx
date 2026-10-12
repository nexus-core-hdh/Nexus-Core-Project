"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowDown, ArrowUp, Boxes, ShoppingBag, ShoppingCart, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { kpis, type Kpi } from "./dashboard-data";
import { TruncatedTitle } from "./truncated-title";

const ICONS: Record<Kpi["icon"], typeof ShoppingBag> = {
  sales: ShoppingBag,
  purchases: ShoppingCart,
  profit: TrendingUp,
  inventory: Boxes
};

const ICON_STYLES: Record<Kpi["icon"], string> = {
  sales: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  purchases: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  profit: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  inventory: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
};

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = ICONS[kpi.icon];
        const sparkData = kpi.spark.map((v, i) => ({ i, v }));
        return (
          <Card key={kpi.key} className="gap-3 py-4">
            <CardContent className="px-4">
              <div className="flex items-center gap-3">
                <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", ICON_STYLES[kpi.icon])}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <TruncatedTitle as="p" className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {kpi.label}
                  </TruncatedTitle>
                  <p className="text-xl leading-tight font-semibold tabular-nums">{kpi.value}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-medium",
                    kpi.trend === "up" ? "text-emerald-600" : "text-red-600"
                  )}>
                  {kpi.trend === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {kpi.change}
                  <span className="text-muted-foreground font-normal">&nbsp;from last month</span>
                </span>
                <div className="h-8 w-16 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`spark-${kpi.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={kpi.trend === "up" ? "var(--chart-1)" : "var(--destructive)"}
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor={kpi.trend === "up" ? "var(--chart-1)" : "var(--destructive)"}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={kpi.trend === "up" ? "var(--chart-1)" : "var(--destructive)"}
                        strokeWidth={1.5}
                        fill={`url(#spark-${kpi.key})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
