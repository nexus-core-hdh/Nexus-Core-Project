"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bpmApi } from "@/lib/api";
import { RefreshCw, ListChecks, Search } from "lucide-react";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  in_progress: "default",
  completed: "secondary",
  failed: "destructive",
  cancelled: "outline",
};

export default function BpmTaskQueuePage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await bpmApi.taskQueue.list();
      setData(Array.isArray(r) ? r : []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = data.filter((t) => {
    if (status && t.status !== status) return false;
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Task Queue</h1>
            <p className="text-xs text-muted-foreground">Business process tasks and their execution status</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tasks..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Process</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No tasks in queue
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-medium">{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{t.process || t.processName || "—"}</TableCell>
                  <TableCell className="text-sm">{t.assignedTo || t.assignee || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.priority === "high" || t.priority === "urgent" ? "destructive" : "outline"}>
                      {t.priority || "normal"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[t.status] ?? "outline"}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
