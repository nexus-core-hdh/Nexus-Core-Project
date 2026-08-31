"use client";

import Link from "next/link";
import { BadgeDollarSign, Boxes, DollarSign, ShoppingBag, ShoppingCart } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { recentActivity, type ActivityEvent } from "./dashboard-data";

const ICONS: Record<ActivityEvent["icon"], typeof ShoppingBag> = {
  sale: ShoppingBag,
  purchase: ShoppingCart,
  payment: DollarSign,
  item: Boxes,
  stock: BadgeDollarSign
};

const ICON_STYLES: Record<ActivityEvent["icon"], string> = {
  sale: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  purchase: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  payment: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  item: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  stock: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
};

export function RecentActivity() {
  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardAction>
          <Link href="#" className="text-primary text-sm font-medium hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="space-y-3.5">
          {recentActivity.map((ev) => {
            const Icon = ICONS[ev.icon];
            return (
              <li key={ev.id} className="flex items-start gap-3">
                <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", ICON_STYLES[ev.icon])}>
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-medium">{ev.title}</p>
                  <p className="text-muted-foreground text-xs">{ev.meta}</p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">{ev.time}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
