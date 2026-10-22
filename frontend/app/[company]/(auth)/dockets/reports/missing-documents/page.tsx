"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docketReportApi, docketApi } from "@/lib/docket-api";
import { AlertCircle, RefreshCw } from "lucide-react";

const ENTITY_TYPES = ["style_card", "sample_card", "product_card", "plm_order"];

export default function MissingDocumentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let res: any;
      try {
        res = await docketReportApi.missingDocuments({ entityType: entityType || undefined, overdue: overdueOnly || undefined });
        const list = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
        setData(list);
      } catch {
        // Fallback
        const fallback: any = await docketApi.list({ entityType: entityType || undefined, limit: 200 });
        const dockets = Array.isArray(fallback) ? fallback : (fallback?.data ?? []);
        const missingItems: any[] = [];
        for (const d of dockets) {
          for (const item of (d.items ?? [])) {
            if (item.status === 'missing' && item.isRequired) {
              const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();
              if (!overdueOnly || isOverdue) {
                missingItems.push({ ...item, docket: d, docketNumber: d.docketNumber, entityType: d.entityType, isOverdue });
              }
            }
          }
        }
        setData(missingItems);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, overdueOnly]);

  useEffect(() => { load(); }, [load]);

  const total = data.length;
  const overdueCount = data.filter((i) => i.isOverdue || (i.dueDate && new Date(i.dueDate) < new Date())).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Missing Documents Report</h1>
            <p className="text-xs text-muted-foreground">Dockets with missing required documents</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 max-w-xs">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-600">{total}</p><p className="text-xs text-muted-foreground">Missing Required</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-700">{overdueCount}</p><p className="text-xs text-muted-foreground">Overdue</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <Select value={entityType || "__all__"} onValueChange={(v) => setEntityType(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Entity Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Entity Types</SelectItem>
            {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="overdue-only" checked={overdueOnly} onCheckedChange={setOverdueOnly} />
          <Label htmlFor="overdue-only" className="text-sm cursor-pointer">Overdue Only</Label>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Name</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-28">Docket #</TableHead>
              <TableHead className="w-32">Entity Type</TableHead>
              <TableHead className="w-28">Due Date</TableHead>
              <TableHead className="w-24">Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No missing required documents found.</TableCell></TableRow>
            ) : (
              data.map((item, idx) => {
                const isOverdue = item.isOverdue || (item.dueDate && new Date(item.dueDate) < new Date());
                return (
                  <TableRow key={item.id ?? idx} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-medium text-sm">{item.title ?? item.documentTypeCard?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{item.documentTypeCard?.code ?? item.documentTypeCode ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.docketNumber ?? item.docket?.docketNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{(item.entityType ?? item.docket?.entityType ?? "").replace("_", " ")}</TableCell>
                    <TableCell className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      {isOverdue ? (
                        <span className="text-xs font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">Overdue</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
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
