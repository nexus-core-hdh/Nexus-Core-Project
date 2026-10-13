"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

interface Chart { id: string; name: string; description?: string; lines: Line[]; }
interface Line { id: string; measurementDefinitionId: string; xsValue?: number; sValue?: number; mValue?: number; lValue?: number; xlValue?: number; xxlValue?: number; definition?: { name: string }; }

const SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl'] as const;

export default function MeasurementChartsPage() {
  const [charts, setCharts] = useState<Chart[]>([]);
  const [defs, setDefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [lineChartId, setLineChartId] = useState('');
  const [lineForm, setLineForm] = useState<any>({ measurementDefinitionId: '', xsValue: '', sValue: '', mValue: '', lValue: '', xlValue: '', xxlValue: '' });

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const [c, d] = await Promise.all([plmApi.measurementCharts.list({ branchId: user?.branchId }), plmApi.measurementDefs.list()]);
      setCharts(Array.isArray(c) ? c : []);
      setDefs(Array.isArray(d) ? d : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createChart = async () => {
    if (!form.name) return toast.error("Name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.measurementCharts.create({ ...form, branchId: user?.branchId });
      toast.success("Chart created"); setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const addLine = async () => {
    if (!lineForm.measurementDefinitionId) return toast.error("Select a measurement");
    setSaving(true);
    try {
      const payload = { measurementDefinitionId: lineForm.measurementDefinitionId };
      SIZES.forEach((s) => { if (lineForm[`${s}Value`]) (payload as any)[`${s}Value`] = parseFloat(lineForm[`${s}Value`]); });
      await plmApi.measurementCharts.addLine(lineChartId, payload);
      toast.success("Line added"); setLineOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const deleteLine = async (chartId: string, lineId: string) => {
    try { await plmApi.measurementCharts.deleteLine(chartId, lineId); load(); toast.success("Removed"); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div><p className="text-xs text-muted-foreground">General Definitions › Measurement Charts</p><h1 className="text-xl font-semibold">Measurement Charts</h1></div>
        <Button size="sm" onClick={() => { setForm({ name: '', description: '' }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Chart</Button>
      </div>

      {loading ? <Skeleton className="h-32 w-full" /> : charts.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No measurement charts yet.</p>
      ) : (
        <div className="space-y-2">
          {charts.map((chart) => (
            <div key={chart.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(expanded === chart.id ? null : chart.id)}>
                <div className="flex items-center gap-2">
                  {expanded === chart.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium">{chart.name}</span>
                  <Badge variant="secondary">{chart.lines?.length ?? 0} lines</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setLineChartId(chart.id); setLineForm({ measurementDefinitionId: '', xsValue: '', sValue: '', mValue: '', lValue: '', xlValue: '', xxlValue: '' }); setLineOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Line
                </Button>
              </div>
              {expanded === chart.id && (
                <div className="border-t">
                  {!chart.lines?.length ? (
                    <p className="text-center py-4 text-sm text-muted-foreground">No lines yet. Add measurement lines.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Measurement</TableHead>{SIZES.map((s) => <TableHead key={s} className="text-center">{s.toUpperCase()}</TableHead>)}<TableHead></TableHead></TableRow></TableHeader>
                        <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
                          {chart.lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="font-medium">{line.definition?.name || line.measurementDefinitionId}</TableCell>
                              {SIZES.map((s) => <TableCell key={s} className="text-center">{(line as any)[`${s}Value`] ?? '—'}</TableCell>)}
                              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLine(chart.id, line.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Measurement Chart</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={createChart} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Measurement Line</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Measurement *</Label>
              <select value={lineForm.measurementDefinitionId} onChange={(e) => setLineForm((p: any) => ({ ...p, measurementDefinitionId: e.target.value }))} className="w-full border rounded-md h-9 px-3 text-sm bg-background">
                <option value="">Select measurement</option>
                {defs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map((s) => (
                <div key={s}><Label className="text-xs">{s.toUpperCase()}</Label><Input type="number" step="0.1" value={lineForm[`${s}Value`]} onChange={(e) => setLineForm((p: any) => ({ ...p, [`${s}Value`]: e.target.value }))} className="h-8 text-sm" /></div>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLineOpen(false)}>Cancel</Button><Button onClick={addLine} disabled={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
