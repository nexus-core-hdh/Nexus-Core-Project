"use client";

import { useEffect, useState } from "react";
import { PlmCrudTable } from "../../_components/plm-crud-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";

const emptyForm = {
  code: "", name: "", password: "", inUse: true,
  startOfPeriod: "", endOfPeriod: "", taxOffice: "", taxNo: "", idNo: "",
  mersisNo: "", tradeNo: "", companyType: "", activityType: "", naceCode: "",
  directedCompanies: "", forex: "", forexCalculationType: "Use parameter", useWorkplace: false,
};

export default function CompanyCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await plmApi.companyCards.list();
      setData(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.code || !form.name) return toast.error("Code and name required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        password: form.password || undefined,
        startOfPeriod: form.startOfPeriod || undefined,
        endOfPeriod: form.endOfPeriod || undefined,
      };
      if (editing) { await plmApi.companyCards.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.companyCards.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const toDateInput = (v: any) => v ? new Date(v).toISOString().slice(0, 10) : "";

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Company Cards</p><h1 className="text-xl font-semibold">Company Cards</h1></div>
      <PlmCrudTable title="" storageKey="companyCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm(emptyForm); setEditing(null); setOpen(true); }}
        onEdit={(r: any) => { setForm({ ...emptyForm, ...r, startOfPeriod: toDateInput(r.startOfPeriod), endOfPeriod: toDateInput(r.endOfPeriod), password: "" }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r: any) => { await plmApi.companyCards.delete(r.id); load(); }}
        columns={[
          { key: 'code', label: 'Code', render: (r: any) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'name', label: 'Name' },
          { key: 'taxNo', label: 'Tax No', render: (r: any) => r.taxNo || '—' },
          { key: 'startOfPeriod', label: 'Start of Period', render: (r: any) => r.startOfPeriod ? new Date(r.startOfPeriod).toLocaleDateString() : '—' },
          { key: 'endOfPeriod', label: 'End of Period', render: (r: any) => r.endOfPeriod ? new Date(r.endOfPeriod).toLocaleDateString() : '—' },
          { key: 'inUse', label: 'Status', render: (r: any) => <Badge variant={r.inUse ? 'default' : 'secondary'}>{r.inUse ? 'In Use' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Company Card</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={editing ? "Leave blank to keep" : ""} /></div>
            <div className="flex items-center gap-2 pt-6"><Switch checked={form.inUse} onCheckedChange={(v) => set('inUse', v)} /><Label>In Use</Label></div>
            <div><Label>Start of Period</Label><Input type="date" value={form.startOfPeriod} onChange={(e) => set('startOfPeriod', e.target.value)} /></div>
            <div><Label>End of Period</Label><Input type="date" value={form.endOfPeriod} onChange={(e) => set('endOfPeriod', e.target.value)} /></div>
            <div><Label>Tax Office</Label><Input value={form.taxOffice} onChange={(e) => set('taxOffice', e.target.value)} /></div>
            <div><Label>Tax No</Label><Input value={form.taxNo} onChange={(e) => set('taxNo', e.target.value)} /></div>
            <div><Label>Id No</Label><Input value={form.idNo} onChange={(e) => set('idNo', e.target.value)} /></div>
            <div><Label>MERSIS No</Label><Input value={form.mersisNo} onChange={(e) => set('mersisNo', e.target.value)} /></div>
            <div><Label>Trade No</Label><Input value={form.tradeNo} onChange={(e) => set('tradeNo', e.target.value)} /></div>
            <div><Label>Company Type</Label><Input value={form.companyType} onChange={(e) => set('companyType', e.target.value)} /></div>
            <div><Label>Activity Type</Label><Input value={form.activityType} onChange={(e) => set('activityType', e.target.value)} /></div>
            <div><Label>NACE Code</Label><Input value={form.naceCode} onChange={(e) => set('naceCode', e.target.value)} /></div>
            <div className="col-span-2"><Label>Directed Companies</Label><Input value={form.directedCompanies} onChange={(e) => set('directedCompanies', e.target.value)} placeholder="Separate companies by commas" /></div>
            <div><Label>Forex</Label><Input value={form.forex} onChange={(e) => set('forex', e.target.value)} placeholder="Leave empty to use local currency" /></div>
            <div><Label>Forex Calculation Type</Label><Input value={form.forexCalculationType} onChange={(e) => set('forexCalculationType', e.target.value)} /></div>
            <div className="col-span-2 flex items-center gap-2 pt-2 border-t"><Switch checked={form.useWorkplace} onCheckedChange={(v) => set('useWorkplace', v)} /><Label>Use Workplace (Workplace will be Mandatory in Transactions)</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
