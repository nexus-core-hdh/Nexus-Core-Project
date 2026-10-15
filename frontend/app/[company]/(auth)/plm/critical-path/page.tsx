"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
const STATUSES = ['pending', 'confirmed', 'cutting', 'sewing', 'finishing', 'qc', 'shipped', 'delivered', 'cancelled'];

export default function CriticalPathPage() {
  const [paths, setPaths] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [gantt, setGantt] = useState<any[]>([]);
  const [styleCards, setStyleCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', styleCardId: '', startDate: '', endDate: '' });
  const [taskForm, setTaskForm] = useState<any>({ name: '', plannedStart: '', plannedEnd: '', daysOffset: 0, duration: 1, responsibleDept: '' });
  const [saving, setSaving] = useState(false);

  const loadPaths = async () => {
    setLoading(true);
    try {
      const [cp, sc] = await Promise.all([plmApi.criticalPath.list({}), plmApi.styleCards.list({ limit: '200' })]);
      setPaths(Array.isArray(cp) ? cp : (cp?.data ?? []));
      setStyleCards((sc as any)?.data ?? []);
      if (!selected && (Array.isArray(cp) ? cp : cp?.data ?? []).length > 0) {
        const first = (Array.isArray(cp) ? cp[0] : (cp?.data ?? [])[0]);
        if (first) { setSelected(first.id); }
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadPaths(); }, []);

  useEffect(() => {
    if (!selected) return;
    plmApi.criticalPath.gantt(selected).then((r: any) => setGantt(Array.isArray(r) ? r : []));
  }, [selected]);

  const createPath = async () => {
    if (!form.title || !form.styleCardId) return toast.error("Title and style required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const r: any = await plmApi.criticalPath.create({ ...form, createdBy: user?.id });
      toast.success("Critical path created");
      setOpen(false); setSelected(r.id); loadPaths();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const addTask = async () => {
    if (!taskForm.name || !selected) return toast.error("Task name required");
    setSaving(true);
    try {
      await plmApi.criticalPath.addTask(selected, { ...taskForm, daysOffset: parseInt(taskForm.daysOffset), duration: parseInt(taskForm.duration) });
      toast.success("Task added");
      setTaskOpen(false);
      plmApi.criticalPath.gantt(selected).then((r: any) => setGantt(Array.isArray(r) ? r : []));
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const selectedPath = paths.find((p) => p.id === selected);

  const minDate = gantt.length ? gantt.reduce((m, t) => t.plannedStart < m ? t.plannedStart : m, gantt[0].plannedStart) : null;
  const maxDate = gantt.length ? gantt.reduce((m, t) => t.plannedEnd > m ? t.plannedEnd : m, gantt[0].plannedEnd) : null;
  const totalDays = minDate && maxDate ? Math.ceil((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86400000) + 1 : 0;
  const getPercent = (date: string) => totalDays ? ((new Date(date).getTime() - new Date(minDate!).getTime()) / 86400000 / totalDays) * 100 : 0;
  const getDurPercent = (start: string, end: string) => totalDays ? ((new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1) / totalDays * 100 : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Critical Path</h1>
        <div className="flex gap-2">
          {selected && <Button size="sm" variant="outline" onClick={() => { setTaskForm({ name: '', plannedStart: '', plannedEnd: '', daysOffset: 0, duration: 1, responsibleDept: '' }); setTaskOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add Task</Button>}
          <Button size="sm" onClick={() => { setForm({ title: '', styleCardId: '', startDate: '', endDate: '' }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Path</Button>
        </div>
      </div>

      {paths.length > 0 && (
        <div className="flex items-center gap-3">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Select critical path" /></SelectTrigger>
            <SelectContent>{paths.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
          </Select>
          {selectedPath && <Badge variant="outline">{selectedPath.styleCard?.title}</Badge>}
        </div>
      )}

      {loading ? <Skeleton className="h-64 w-full" /> : gantt.length === 0 ? (
        <div className="text-center py-16 border rounded-lg text-muted-foreground">
          {paths.length === 0 ? "No critical paths yet. Create one to get started." : "No tasks in this critical path. Add tasks to build the Gantt chart."}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-4">
            <span className="text-xs text-muted-foreground w-48 shrink-0">Task</span>
            <div className="flex-1 relative">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{minDate ? new Date(minDate).toLocaleDateString() : ''}</span>
                <span>{maxDate ? new Date(maxDate).toLocaleDateString() : ''}</span>
              </div>
            </div>
          </div>
          <div className="divide-y">
            {gantt.map((task) => {
              const planStart = getPercent(task.plannedStart);
              const planDur = getDurPercent(task.plannedStart, task.plannedEnd);
              const hasActual = task.actualStart && task.actualEnd;
              const actStart = hasActual ? getPercent(task.actualStart) : 0;
              const actDur = hasActual ? getDurPercent(task.actualStart, task.actualEnd) : 0;
              return (
                <div key={task.id} className="flex items-center gap-4 px-4 py-2 hover:bg-muted/20">
                  <div className="w-48 shrink-0">
                    <p className="text-sm font-medium">{task.name}</p>
                    {task.responsibleDept && <p className="text-xs text-muted-foreground">{task.responsibleDept}</p>}
                  </div>
                  <div className="flex-1 relative h-8">
                    {/* Planned bar */}
                    <div className="absolute top-0.5 h-3 rounded bg-blue-300 dark:bg-blue-700 opacity-80" style={{ left: `${planStart}%`, width: `${planDur}%` }} title={`Planned: ${task.plannedStart} → ${task.plannedEnd}`} />
                    {/* Actual bar */}
                    {hasActual && <div className="absolute bottom-0.5 h-3 rounded bg-green-400 dark:bg-green-600" style={{ left: `${actStart}%`, width: `${actDur}%` }} title={`Actual: ${task.actualStart} → ${task.actualEnd}`} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 border-t bg-muted/20 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-blue-300 dark:bg-blue-700" /> Planned</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-green-400 dark:bg-green-600" /> Actual</span>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Critical Path</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Style Card *</Label>
              <Select value={form.styleCardId} onValueChange={(v) => setForm((p: any) => ({ ...p, styleCardId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
                <SelectContent>{styleCards.map((s) => <SelectItem key={s.id} value={s.id}>{s.styleNumber} — {s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start Date</Label><DatePicker value={form.startDate} onChange={(e) => setForm((p: any) => ({ ...p, startDate: e.target.value }))} /></div>
              <div><Label>End Date</Label><DatePicker value={form.endDate} onChange={(e) => setForm((p: any) => ({ ...p, endDate: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={createPath} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Critical Path Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Task Name *</Label><Input value={taskForm.name} onChange={(e) => setTaskForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Planned Start *</Label><DatePicker value={taskForm.plannedStart} onChange={(e) => setTaskForm((p: any) => ({ ...p, plannedStart: e.target.value }))} /></div>
              <div><Label>Planned End *</Label><DatePicker value={taskForm.plannedEnd} onChange={(e) => setTaskForm((p: any) => ({ ...p, plannedEnd: e.target.value }))} /></div>
            </div>
            <div><Label>Department</Label><Input value={taskForm.responsibleDept} onChange={(e) => setTaskForm((p: any) => ({ ...p, responsibleDept: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button><Button onClick={addTask} disabled={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
