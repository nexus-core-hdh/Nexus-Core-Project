"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, AlertTriangle } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
const STATUSES = ['pending', 'in-progress', 'review', 'completed', 'delayed', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_TYPES = ['design', 'sampling', 'production', 'qc', 'sourcing', 'approval', 'general'];

const STATUS_ROW_COLORS: Record<string, string> = {
  delayed: 'bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-500',
  completed: 'bg-green-50 dark:bg-green-950/20',
};

const empty = { title: '', description: '', taskType: 'general', assignedTo: '', plannedEnd: '', priority: 'medium' };

export default function TasksPage() {
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'all' | 'my' | 'overdue'>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState<string | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const q: any = { page: String(page), limit: '50' };
      if (search) q.search = search;
      if (status) q.status = status;
      let r: any;
      if (view === 'my' && user?.id) r = await plmApi.tasks.myTasks(String(user.id));
      else if (view === 'overdue') r = await plmApi.tasks.overdue();
      else r = await plmApi.tasks.list(q);
      setData(r?.data ?? (Array.isArray(r) ? r : []));
      setMeta(r?.meta ?? { total: 0, page: 1, pages: 1 });
    } finally { setLoading(false); }
  }, [search, status, view]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title) return toast.error("Title required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.tasks.create({ ...form, createdBy: user?.id });
      toast.success("Task created");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const quickStatus = async (id: string, newStatus: string) => {
    setStatusChanging(id);
    try {
      const user = getCurrentUser();
      await plmApi.tasks.changeStatus(id, { status: newStatus, changedBy: user?.id });
      toast.success("Status updated");
      load();
    } catch (e: any) { toast.error(e.message); } finally { setStatusChanging(null); }
  };

  const isToday = (d: string) => { if (!d) return false; const t = new Date(d); const n = new Date(); return t.getDate() === n.getDate() && t.getMonth() === n.getMonth() && t.getFullYear() === n.getFullYear(); };
  const isPast = (d: string) => { if (!d) return false; return new Date(d) < new Date() && !isToday(d); };

  const rowClass = (row: any) => {
    if (row.status === 'delayed' || (row.plannedEnd && isPast(row.plannedEnd) && row.status !== 'completed')) return 'bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-400';
    if (row.plannedEnd && isToday(row.plannedEnd)) return 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-400';
    if (row.status === 'completed') return 'bg-green-50/50 dark:bg-green-950/10';
    return '';
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold">PLM Tasks</h1><p className="text-xs text-muted-foreground">{meta.total} tasks</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Task</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(['all', 'my', 'overdue'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 font-medium capitalize transition-colors ${view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{v === 'my' ? 'My Tasks' : v}</button>
          ))}
        </div>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48 h-9" /></div>
        <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : v)}><SelectTrigger className="w-36 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="__all__">All</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Assigned</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Quick</TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No tasks found</TableCell></TableRow>
            ) : data.map((row) => (
              <TableRow key={row.id} className={rowClass(row)}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {(row.status === 'delayed' || (row.plannedEnd && isPast(row.plannedEnd) && row.status !== 'completed')) && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <span className="font-medium text-sm">{row.title}</span>
                  </div>
                  {row.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{row.description}</p>}
                </TableCell>
                <TableCell><span className={`px-1.5 py-0.5 rounded text-xs ${row.priority === 'urgent' ? 'bg-red-100 text-red-700' : row.priority === 'high' ? 'bg-orange-100 text-orange-700' : row.priority === 'low' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>{row.priority || 'medium'}</span></TableCell>
                <TableCell className="text-sm">{row.assignedTo || '—'}</TableCell>
                <TableCell className={`text-sm ${row.plannedEnd && isPast(row.plannedEnd) && row.status !== 'completed' ? 'text-red-600 font-medium' : ''}`}>{row.plannedEnd ? new Date(row.plannedEnd).toLocaleDateString() : '—'}</TableCell>
                <TableCell><Badge variant={row.status === 'completed' ? 'default' : row.status === 'delayed' ? 'destructive' : 'secondary'}>{row.status}</Badge></TableCell>
                <TableCell>
                  <Select value={row.status} onValueChange={(v) => quickStatus(row.id, v)} disabled={statusChanging === row.id}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => load(meta.page - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.pages} onClick={() => load(meta.page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New PLM Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Task Type *</Label>
                <Select value={form.taskType} onValueChange={(v) => setForm((p: any) => ({ ...p, taskType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((p: any) => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Assigned To</Label><Input value={form.assignedTo} onChange={(e) => setForm((p: any) => ({ ...p, assignedTo: e.target.value }))} placeholder="Email or name" /></div>
              <div><Label>Planned End</Label><DatePicker value={form.plannedEnd} onChange={(e) => setForm((p: any) => ({ ...p, plannedEnd: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
