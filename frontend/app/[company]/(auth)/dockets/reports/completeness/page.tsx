"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docketReportApi, docketApi } from "@/lib/docket-api";
import { TrendingUp, RefreshCw, Download, AlertCircle, CheckCircle2 } from "lucide-react";

function completenessColor(pct: number) {
  if (pct === 100) return "bg-green-500";
  if (pct >= 70) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function rowBg(pct: number) {
  if (pct < 40) return "bg-red-50/50 dark:bg-red-950/20";
  return "";
}

const ENTITY_TYPES = ["style_card", "sample_card", "product_card", "plm_order"];

export default function CompletenessReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let res: any;
      try {
        res = await docketReportApi.completeness({ entityType: entityType || undefined, status: status || undefined });
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setData(list);
      } catch {
        // Fallback: use docket list
        const fallback: any = await docketApi.list({ entityType: entityType || undefined, status: status || undefined, limit: 200 });
        const list = Array.isArray(fallback) ? fallback : (fallback?.data ?? []);
        setData(list);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, status]);

  useEffect(() => { load(); }, [load]);

  const total = data.length;
  const fullyComplete = data.filter((d) => Number(d.completeness) === 100).length;
  const avgCompleteness = total > 0 ? Math.round(data.reduce((a, d) => a + Number(d.completeness ?? 0), 0) / total) : 0;
  const criticallyIncomplete = data.filter((d) => Number(d.completeness) < 40).length;

  const exportCsv = () => {
    const rows = [["Docket #", "Title", "Entity Type", "Status", "Completeness %"]];
    data.forEach((d) => rows.push([d.docketNumber, d.title, d.entityType, d.status, String(Math.round(Number(d.completeness ?? 0)))]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "docket-completeness.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Completeness Report</h1>
            <p className="text-xs text-muted-foreground">Track document docket completion rates</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Dockets", value: total, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950" },
          { label: "Fully Complete", value: fullyComplete, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950" },
          { label: "Avg Completeness", value: `${avgCompleteness}%`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950" },
          { label: "Critical (<40%)", value: criticallyIncomplete, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
              <div>
                {loading ? <Skeleton className="h-6 w-10 mb-0.5" /> : <p className="text-xl font-bold">{s.value}</p>}
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={entityType || "__all__"} onValueChange={(v) => setEntityType(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Entity Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Entity Types</SelectItem>
            {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {["incomplete", "in_progress", "complete", "approved", "locked"].map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Docket #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-32">Entity Type</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-52">Completeness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No dockets found.</TableCell></TableRow>
            ) : (
              data.map((d) => {
                const comp = Math.round(Number(d.completeness ?? 0));
                return (
                  <TableRow key={d.id} className={rowBg(comp)}>
                    <TableCell className="font-mono text-xs">{d.docketNumber}</TableCell>
                    <TableCell className="font-medium text-sm">{d.title}</TableCell>
                    <TableCell className="text-xs capitalize">{(d.entityType ?? "").replace("_", " ")}</TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-full text-xs capitalize bg-muted text-muted-foreground">{d.status}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${completenessColor(comp)}`} style={{ width: `${comp}%` }} />
                        </div>
                        <span className="text-xs font-medium w-8">{comp}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
