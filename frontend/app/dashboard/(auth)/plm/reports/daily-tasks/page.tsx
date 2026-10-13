"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { RefreshCw, Calendar } from "lucide-react";

export default function DailyTasksReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try { const r: any = await plmApi.reports.dailyTasks({ date }); setData(Array.isArray(r) ? r : []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          <div><h1 className="text-xl font-semibold">Daily Tasks Report</h1><p className="text-xs text-muted-foreground">Tasks due on a specific date</p></div>
        </div>
        <div className="flex gap-2 items-center">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-4 gap-3 max-w-2xl">
          {['pending', 'in-progress', 'completed', 'delayed'].map((s) => (
            <div key={s} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
              <p className="text-xl font-bold">{data.filter((t) => t.status === s).length}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Task</TableHead><TableHead>Priority</TableHead><TableHead>Assigned To</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No tasks due on {new Date(date).toLocaleDateString()}</TableCell></TableRow>
            ) : data.map((t) => (
              <TableRow key={t.id}>
                <TableCell><p className="font-medium">{t.title}</p></TableCell>
                <TableCell><Badge variant={t.priority === 'urgent' ? 'destructive' : 'outline'}>{t.priority || 'normal'}</Badge></TableCell>
                <TableCell>{t.assignedTo || '—'}</TableCell>
                <TableCell><Badge variant={t.status === 'completed' ? 'default' : t.status === 'delayed' ? 'destructive' : 'secondary'}>{t.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
