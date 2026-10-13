"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { RefreshCw, DollarSign } from "lucide-react";

export default function SampleCostReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try { const r: any = await plmApi.reports.sampleCost({ from, to }); setData(Array.isArray(r) ? r : []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to]);

  const totalCost = data.reduce((s, r) => s + (r.totalCost || 0), 0);
  const totalSamples = data.reduce((s, r) => s + (r.sampleCount || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-500" />
          <div><h1 className="text-xl font-semibold">Sample Cost Report</h1><p className="text-xs text-muted-foreground">Cost analysis by style and sample type</p></div>
        </div>
        <div className="flex gap-2 items-center">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-3 gap-4 max-w-xl">
          <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/20">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-2xl font-bold text-green-600">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Samples</p>
            <p className="text-2xl font-bold">{totalSamples}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Avg Cost/Sample</p>
            <p className="text-2xl font-bold">${totalSamples ? (totalCost / totalSamples).toFixed(2) : '0.00'}</p>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Style</TableHead><TableHead>Sample Type</TableHead><TableHead>Count</TableHead><TableHead>Total Cost</TableHead><TableHead>Avg Cost</TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No cost data for this period</TableCell></TableRow>
            ) : data.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.styleTitle || r.styleCardId || '—'}</TableCell>
                <TableCell><Badge variant="outline">{r.sampleType || '—'}</Badge></TableCell>
                <TableCell>{r.sampleCount || 0}</TableCell>
                <TableCell>${(r.totalCost || 0).toFixed(2)}</TableCell>
                <TableCell>${r.sampleCount ? ((r.totalCost || 0) / r.sampleCount).toFixed(2) : '0.00'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
