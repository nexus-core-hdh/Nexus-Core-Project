"use client";

import { BarChart3, FileText, Package, Receipt, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { glanceStats, type GlanceStat } from "./dashboard-data";
import { TruncatedTitle } from "./truncated-title";

const ICONS: Record<GlanceStat["key"], typeof Receipt> = {
  receivables: Receipt,
  payables: FileText,
  stock: Package,
  users: Users
};

export function BusinessGlance() {
  return (
    <Card className="border-none bg-violet-950 py-0 text-white dark:bg-violet-950">
      <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-3 lg:w-64">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <BarChart3 className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Business at a Glance</p>
            <p className="text-xs text-white/70">Real-time insights to drive smarter decisions.</p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {glanceStats.map((s) => {
            const Icon = ICONS[s.key];
            return (
              <div key={s.key} className="flex items-center gap-2.5">
                <Icon className="size-4 shrink-0 text-white/60" />
                <div className="min-w-0">
                  <TruncatedTitle as="p" className="text-xs text-white/70">
                    {s.label}
                  </TruncatedTitle>
                  <p className="text-sm font-semibold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-white/50">{s.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
