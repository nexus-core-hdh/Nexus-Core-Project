"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Activity, BadgeDollarSign, Boxes, DollarSign, PackageCheck, ShoppingBag, ShoppingCart } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dashboardApi, type RecentActivityItem } from "@/lib/nexuscore-api";

// Real activity only: the newest records from the ERP's own audit trail (AuditLog) and Finance
// payments / sales orders, merged server-side (GET /dashboard/recent-activity). Nothing here is
// invented — a missing user, amount or party is simply not shown.

type Kind = RecentActivityItem["kind"];

const ICONS: Record<Kind, typeof ShoppingBag> = {
  sale: ShoppingBag,
  purchase: ShoppingCart,
  payment: DollarSign,
  receipt: PackageCheck,
  item: Boxes,
  stock: BadgeDollarSign,
  other: Activity
};

const ICON_STYLES: Record<Kind, string> = {
  sale: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  purchase: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  payment: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  receipt: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400",
  item: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  stock: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400"
};

// Existing audit/activity listing (Administration → Log Tracking).
const VIEW_ALL_HREF = "/dashboard/administration/log-tracking";

const title = (ev: RecentActivityItem) => [ev.label, ev.documentNo, ev.action].filter(Boolean).join(" ");

function meta(ev: RecentActivityItem) {
  const parts: string[] = [];
  if (ev.amount != null) {
    const amount = ev.amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    parts.push(ev.currency ? `${ev.currency} ${amount}` : amount);
  }
  if (ev.party) parts.push(`${ev.partyPrefix ?? ""} ${ev.party}`.trim());
  if (ev.userName) parts.push(`by ${ev.userName}`);
  return parts.join(" · ");
}

const timeAgo = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

export function RecentActivity() {
  const [items, setItems] = useState<RecentActivityItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Re-render once a minute so the relative times stay current.
  const [, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    dashboardApi
      .recentActivity(8)
      .then((rows) => { if (active) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) { setFailed(true); setItems([]); } });
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardAction>
          <Link href={VIEW_ALL_HREF} className="text-primary text-sm font-medium hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4">
        {items === null ? (
          <ul className="space-y-3.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-start gap-3">
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Activity className="size-6" />
            <p className="text-sm">{failed ? "Recent activity could not be loaded" : "No recent activity"}</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {items.map((ev) => {
              const Icon = ICONS[ev.kind] ?? Activity;
              const sub = meta(ev);
              return (
                <li key={ev.id} className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", ICON_STYLES[ev.kind] ?? ICON_STYLES.other)}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-medium">{title(ev)}</p>
                    {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs" title={new Date(ev.occurredAt).toLocaleString()}>
                    {timeAgo(ev.occurredAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
