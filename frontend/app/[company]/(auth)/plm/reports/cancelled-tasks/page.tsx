"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { RefreshCw, XCircle } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
export default function CancelledTasksReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try { const r: any = await plmApi.reports.cancelledTasks({ from, to }); setData(Array.isArray(r) ? r : []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-muted-foreground" />
          <div><h1 className="text-lg font-semibold">Cancelled Tasks Report</h1><p className="text-xs text-muted-foreground">Tasks cancelled within a date range</p></div>
        </div>
        <div className="flex gap-2 items-center">
          <DatePicker value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-muted-foreground text-sm">to</span>
          <DatePicker value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {!loading && <div className="rounded-lg border p-3 inline-block bg-muted/50">
        <p className="text-xs text-muted-foreground">Total Cancelled</p>
        <p className="text-2xl font-bold">{data.length}</p>
      </div>}

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Priority</TableHead><TableHead>Created By</TableHead><TableHead>Assigned To</TableHead><TableHead>Cancelled At</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No cancelled tasks in this period</TableCell></TableRow>
            ) : data.map((t) => (
              <TableRow key={t.id} className="opacity-70">
                <TableCell><p className="font-medium line-through">{t.title}</p></TableCell>
                <TableCell><Badge variant="outline">{t.priority || 'normal'}</Badge></TableCell>
                <TableCell>{t.createdBy || '—'}</TableCell>
                <TableCell>{t.assignedTo || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
