"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

const START_TYPES = ["Start to Start", "Start to Finish", "Finish to Start", "Finish to Finish"];

const emptyForm = {
  code: "", name: "", explanation: "", accessCode: "", specialCode: "",
  connectedActivityTypeId: "", departmentId: "", resourceId: "", processId: "",
  productionVariant: "", sampleTypeId: "", durationDay: "",
  nextTransactionStartDuration: "", nextTransactionStartDurationType: "Start to Start",
  previousTransactionStartDuration: "", previousTransactionStartDurationType: "",
  transactionType: "", sampleTaskRequestResourceS: true,
  preProduction: false, postProduction: false, resourceFromUserCard: false,
  generateResourceAssignmentsAutomatically: false, useForPlmTaskRequest: true, inUse: true,
};

export default function ActivityTypeCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [sampleTypes, setSampleTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const [r, d, res, p, s] = await Promise.all([
        plmApi.activityTypes.list({ branchId: user?.branchId }),
        plmApi.departments.list(),
        plmApi.resources.list(),
        plmApi.processCards.list(),
        plmApi.sampleTypes.list(),
      ]);
      setData(Array.isArray(r) ? r : []);
      setDepts(Array.isArray(d) ? d : []);
      setResources(Array.isArray(res) ? res : []);
      setProcesses(Array.isArray(p) ? p : []);
      setSampleTypes(Array.isArray(s) ? s : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.code || !form.name) return toast.error("Code and name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = {
        ...form,
        branchId: user?.branchId,
        durationDay: form.durationDay ? parseInt(form.durationDay) : undefined,
        nextTransactionStartDuration: form.nextTransactionStartDuration ? parseInt(form.nextTransactionStartDuration) : undefined,
        previousTransactionStartDuration: form.previousTransactionStartDuration ? parseInt(form.previousTransactionStartDuration) : undefined,
        connectedActivityTypeId: form.connectedActivityTypeId || undefined,
        departmentId: form.departmentId || undefined,
        resourceId: form.resourceId || undefined,
        processId: form.processId || undefined,
        sampleTypeId: form.sampleTypeId || undefined,
      };
      if (editing) { await plmApi.activityTypes.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.activityTypes.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Activity Type Cards</p><h1 className="text-xl font-semibold">Activity Type Cards</h1></div>
      <PlmCrudTable title="" storageKey="activityTypeCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm(emptyForm); setEditing(null); setOpen(true); }}
        onEdit={(r: any) => { setForm({
          ...emptyForm, ...r,
          durationDay: r.durationDay ?? "", nextTransactionStartDuration: r.nextTransactionStartDuration ?? "",
          previousTransactionStartDuration: r.previousTransactionStartDuration ?? "",
          connectedActivityTypeId: r.connectedActivityTypeId || "", departmentId: r.departmentId || "",
          resourceId: r.resourceId || "", processId: r.processId || "", sampleTypeId: r.sampleTypeId || "",
        }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r: any) => { await plmApi.activityTypes.delete(r.id); load(); }}
        columns={[
          { key: 'code', label: 'Code', render: (r: any) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'name', label: 'Name' },
          { key: 'department', label: 'Department', render: (r: any) => r.department?.name || '—' },
          { key: 'durationDay', label: 'Duration (Day)', render: (r: any) => r.durationDay ?? '—' },
          { key: 'inUse', label: 'Status', render: (r: any) => <Badge variant={r.inUse ? 'default' : 'secondary'}>{r.inUse ? 'In Use' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Activity Type</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="col-span-2"><Label>Explanation</Label><Input value={form.explanation} onChange={(e) => set('explanation', e.target.value)} /></div>
            <div><Label>Access Code</Label><Input value={form.accessCode} onChange={(e) => set('accessCode', e.target.value)} /></div>
            <div><Label>Special Code</Label><Input value={form.specialCode} onChange={(e) => set('specialCode', e.target.value)} /></div>
            <div><Label>Connected Activity Type</Label>
              <Select value={form.connectedActivityTypeId} onValueChange={(v) => set('connectedActivityTypeId', v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>{data.filter((d) => d.id !== editing).map((d) => <SelectItem key={d.id} value={d.id}>{d.code} - {d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Department</Label>
              <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Resource</Label>
              <Select value={form.resourceId} onValueChange={(v) => set('resourceId', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{resources.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Process</Label>
              <Select value={form.processId} onValueChange={(v) => set('processId', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{processes.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Production Variant</Label><Input value={form.productionVariant} onChange={(e) => set('productionVariant', e.target.value)} /></div>
            <div><Label>Sample Type</Label>
              <Select value={form.sampleTypeId} onValueChange={(v) => set('sampleTypeId', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{sampleTypes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Duration (Day)</Label><Input type="number" value={form.durationDay} onChange={(e) => set('durationDay', e.target.value)} /></div>
            <div><Label>Next Transaction Start Duration</Label><Input type="number" value={form.nextTransactionStartDuration} onChange={(e) => set('nextTransactionStartDuration', e.target.value)} /></div>
            <div><Label>Next Transaction Start Type</Label>
              <Select value={form.nextTransactionStartDurationType} onValueChange={(v) => set('nextTransactionStartDurationType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{START_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Previous Transaction Start Duration</Label><Input type="number" value={form.previousTransactionStartDuration} onChange={(e) => set('previousTransactionStartDuration', e.target.value)} /></div>
            <div><Label>Previous Transaction Start Type</Label>
              <Select value={form.previousTransactionStartDurationType} onValueChange={(v) => set('previousTransactionStartDurationType', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{START_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Transaction Type</Label><Input value={form.transactionType} onChange={(e) => set('transactionType', e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.sampleTaskRequestResourceS} onCheckedChange={(v) => set('sampleTaskRequestResourceS', v)} /><Label>Sample Task Request Resource S</Label></div>
            <div className="col-span-2 grid grid-cols-2 gap-2 pt-2 border-t">
              <div className="flex items-center gap-2"><Switch checked={form.preProduction} onCheckedChange={(v) => set('preProduction', v)} /><Label>Pre-Production</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.postProduction} onCheckedChange={(v) => set('postProduction', v)} /><Label>Post-Production</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.resourceFromUserCard} onCheckedChange={(v) => set('resourceFromUserCard', v)} /><Label>Resource from User Card</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.generateResourceAssignmentsAutomatically} onCheckedChange={(v) => set('generateResourceAssignmentsAutomatically', v)} /><Label>Auto-Generate Resource Assignments</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.useForPlmTaskRequest} onCheckedChange={(v) => set('useForPlmTaskRequest', v)} /><Label>Use for PLM Task Request</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.inUse} onCheckedChange={(v) => set('inUse', v)} /><Label>In Use</Label></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
