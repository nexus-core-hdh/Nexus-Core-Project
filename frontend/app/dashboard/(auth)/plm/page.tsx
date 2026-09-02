"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import {
  Layers, Shirt, Package, Palette, FileText,
  ClipboardList, GitBranch, AlertTriangle, TrendingUp,
  ChevronRight, Plus
} from "lucide-react";

const nav = [
  { label: "Style Cards", href: "/dashboard/plm/style-cards", icon: Shirt, color: "text-blue-500", desc: "Manage style concepts & tech packs" },
  { label: "Sample Cards", href: "/dashboard/plm/sample-cards-list", icon: Package, color: "text-purple-500", desc: "Track samples through approval stages" },
  { label: "Product Cards", href: "/dashboard/plm/product-cards", icon: Layers, color: "text-emerald-500", desc: "Product definitions & measurements" },
  { label: "Swatch Cards", href: "/dashboard/plm/swatch-cards", icon: Palette, color: "text-amber-500", desc: "Fabric & color swatch library" },
  { label: "Mood Boards", href: "/dashboard/plm/mood-boards", icon: Palette, color: "text-pink-500", desc: "Season mood & concept boards" },
  { label: "PLM Orders", href: "/dashboard/plm/orders", icon: ClipboardList, color: "text-orange-500", desc: "Production order tracking" },
  { label: "PLM Tasks", href: "/dashboard/plm/tasks", icon: FileText, color: "text-cyan-500", desc: "Task queue with delay tracking" },
  { label: "Critical Path", href: "/dashboard/plm/critical-path", icon: GitBranch, color: "text-red-500", desc: "Gantt chart & milestone tracking" },
  { label: "Documents", href: "/dashboard/plm/documents", icon: FileText, color: "text-slate-500", desc: "Tech packs & document library" },
  { label: "Templates", href: "/dashboard/pages/form-builder", icon: FileText, color: "text-indigo-500", desc: "Reusable PLM templates" },
  { label: "General Definitions", href: "/dashboard/plm/general-definitions/style-sample-types", icon: Layers, color: "text-teal-500", desc: "Departments, processes, employees" },
  { label: "Reports", href: "/dashboard/plm/reports/delayed-tasks", icon: TrendingUp, color: "text-rose-500", desc: "Delayed tasks, cost analysis, cubes" },
];

interface Summary { styleConcepts: number; activeSamples: number; openOrders: number; overdueTasks: number; }

export default function PlmDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      plmApi.styleCards.list({ limit: '1' }).catch(() => ({ meta: { total: 0 } })),
      plmApi.sampleCards.list({ status: 'submitted', limit: '1' }).catch(() => ({ meta: { total: 0 } })),
      plmApi.orders.list({ status: 'confirmed', limit: '1' }).catch(() => ({ meta: { total: 0 } })),
      plmApi.tasks.overdue().catch(() => []),
    ]).then(([styles, samples, orders, overdue]) => {
      setSummary({
        styleConcepts: (styles as any)?.meta?.total ?? 0,
        activeSamples: (samples as any)?.meta?.total ?? 0,
        openOrders: (orders as any)?.meta?.total ?? 0,
        overdueTasks: Array.isArray(overdue) ? overdue.length : 0,
      });
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PLM Dashboard</h1>
          <p className="text-muted-foreground text-sm">Product Lifecycle Management</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
          <>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Style Concepts</p><p className="text-3xl font-bold mt-1">{summary?.styleConcepts}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active Samples</p><p className="text-3xl font-bold mt-1 text-purple-600">{summary?.activeSamples}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Open Orders</p><p className="text-3xl font-bold mt-1 text-orange-600">{summary?.openOrders}</p></CardContent></Card>
            <Card><CardContent className="pt-6 flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Overdue Tasks</p><p className="text-3xl font-bold mt-1 text-red-600">{summary?.overdueTasks}</p></div>{(summary?.overdueTasks ?? 0) > 0 && <AlertTriangle className="text-red-500 h-5 w-5 mt-1" />}</CardContent></Card>
          </>
        )}
      </div>

      {/* Nav Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {nav.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-5 pb-4 flex items-start gap-3">
                <item.icon className={`h-8 w-8 mt-0.5 shrink-0 ${item.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
