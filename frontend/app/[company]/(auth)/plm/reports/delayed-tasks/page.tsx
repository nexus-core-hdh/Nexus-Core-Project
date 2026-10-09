"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";

export default function DelayedTasksReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r: any = await plmApi.reports.delayedTasks(); setData(Array.isArray(r) ? r : []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const daysOverdue = (due: string) => Math.ceil((new Date().getTime() - new Date(due).getTime()) / 86400000);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <div><h1 className="text-lg font-semibold">Delayed Tasks Report</h1><p className="text-xs text-muted-foreground">Tasks past their due date that are not completed</p></div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {!loading && <div className="grid grid-cols-3 gap-4 max-w-xl">
        <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20">
          <p className="text-xs text-muted-foreground">Total Delayed</p>
          <p className="text-2xl font-bold text-red-600">{data.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Avg Days Overdue</p>
          <p className="text-2xl font-bold">{data.length ? Math.round(data.reduce((s, t) => s + daysOverdue(t.dueDate), 0) / data.length) : 0}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Urgent</p>
          <p className="text-2xl font-bold text-orange-500">{data.filter((t) => t.priority === 'urgent').length}</p>
        </div>
      </div>}

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Priority</TableHead><TableHead>Assigned To</TableHead><TableHead>Due Date</TableHead><TableHead>Days Overdue</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-green-600 font-medium">No delayed tasks!</TableCell></TableRow>
            ) : data.map((t) => (
              <TableRow key={t.id} className="bg-red-50/50 dark:bg-red-950/10">
                <TableCell><p className="font-medium">{t.title}</p>{t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}</TableCell>
                <TableCell><Badge variant={t.priority === 'urgent' ? 'destructive' : 'outline'}>{t.priority || 'normal'}</Badge></TableCell>
                <TableCell>{t.assignedTo || '—'}</TableCell>
                <TableCell className="text-red-600 font-medium">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</TableCell>
                <TableCell><span className="font-bold text-red-600">{t.dueDate ? daysOverdue(t.dueDate) : '—'}</span></TableCell>
                <TableCell><Badge variant="destructive">{t.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
