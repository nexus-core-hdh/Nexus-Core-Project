"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "@/components/app-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { docketApi } from "@/lib/docket-api";
import { FolderOpen, CheckCircle2, TrendingUp, Clock, AlertCircle, ArrowRight } from "lucide-react";

export default function DocketsPage() {
  const [dockets, setDockets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketApi.list({ limit: 100 });
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setDockets(list);
    } catch {
      setDockets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = dockets.length;
  const complete = dockets.filter((d) => Number(d.completeness) === 100).length;
  const avgCompleteness = total > 0
    ? Math.round(dockets.reduce((acc, d) => acc + Number(d.completeness ?? 0), 0) / total)
    : 0;
  const pendingApprovals = dockets.filter((d) =>
    d.items?.some((i: any) => i.status === 'uploaded' || i.status === 'in_review')
  ).length;

  const stats = [
    { label: "Total Dockets", value: total, icon: FolderOpen, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950" },
    { label: "100% Complete", value: complete, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950" },
    { label: "Avg Completeness", value: `${avgCompleteness}%`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950" },
    { label: "Pending Approvals", value: pendingApprovals, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950" },
  ];

  const recentDockets = dockets.slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Docket Management</h1>
            <p className="text-xs text-muted-foreground">Track and manage document dockets across your operations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dockets/document-control/approval-queue">
              <Clock className="h-4 w-4 mr-1" />Approval Queue
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dockets/reports/missing-documents">
              <AlertCircle className="h-4 w-4 mr-1" />Missing Documents
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                {loading ? (
                  <Skeleton className="h-7 w-16 mb-1" />
                ) : (
                  <p className="text-2xl font-bold">{stat.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Style Dockets", href: "/dockets/style-dockets", desc: "Design & tech pack dockets" },
          { title: "Sample Dockets", href: "/dockets/sample-dockets", desc: "Sample approval dockets" },
          { title: "Product Dockets", href: "/dockets/product-dockets", desc: "Product specification dockets" },
          { title: "Order Dockets", href: "/dockets/order-dockets", desc: "Export & local order dockets" },
        ].map((item) => (
          <Card key={item.href} className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <Link href={item.href} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Dockets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Dockets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : recentDockets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No dockets yet. Create your first docket from any list page.</p>
          ) : (
            <div className="space-y-2">
              {recentDockets.map((d) => {
                const comp = Number(d.completeness ?? 0);
                return (
                  <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <span className="font-mono text-xs text-muted-foreground w-24 truncate">{d.docketNumber}</span>
                    <span className="text-sm flex-1 truncate">{d.title}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${comp === 100 ? 'bg-green-500' : comp >= 70 ? 'bg-blue-500' : comp >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${comp}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">{comp}%</span>
                    </div>
                    <Badge variant={d.status === 'complete' ? 'default' : d.status === 'locked' ? 'secondary' : 'outline'} className="text-xs">
                      {d.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reports quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Completeness Report", href: "/dockets/reports/completeness", icon: TrendingUp, desc: "Track docket completion rates" },
          { title: "Missing Documents", href: "/dockets/reports/missing-documents", icon: AlertCircle, desc: "Find dockets with missing required docs" },
          { title: "Document Expiry", href: "/dockets/reports/document-expiry", icon: Clock, desc: "Certificates expiring soon" },
        ].map((item) => (
          <Card key={item.href} className="hover:border-primary/50 transition-colors">
            <CardContent className="p-4">
              <Link href={item.href} className="flex items-start gap-3">
                <item.icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
