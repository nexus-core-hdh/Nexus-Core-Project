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
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { usePlmLookupReturn } from "@/hooks/use-plm-lookup-return";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";

const emptyForm = { code: "", name: "", explanation: "", isActive: true };

// F2 lookup target for the General tab's Gender field, plus a plain CRUD screen otherwise —
// see brand-cards/page.tsx for the identical pattern this mirrors.
export default function GenderCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const searchParams = useWorkspaceSearchParams();
  const lookupMode = searchParams.get("mode") === "lookup";
  const requestId = searchParams.get("requestId");
  const returnTab = searchParams.get("returnTab") ?? undefined;
  const returnAndClose = usePlmLookupReturn();

  const load = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      const r = await plmApi.genders.list({ branchId: user?.branchId });
      setData(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.code || !form.name) return toast.error("Code and name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, branchId: user?.branchId };
      if (editing) { await plmApi.genders.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.genders.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6">
      <div className="mb-2"><p className="text-xs text-muted-foreground">General Definitions › Gender Cards</p><h1 className="text-xl font-semibold">Gender Cards</h1></div>
      <PlmCrudTable title="" storageKey="genderCards" data={data} loading={loading} searchKey="name"
        onAdd={() => { setForm(emptyForm); setEditing(null); setOpen(true); }}
        onEdit={(r: any) => { setForm({ ...emptyForm, ...r }); setEditing(r.id); setOpen(true); }}
        onDelete={async (r: any) => { await plmApi.genders.delete(r.id); load(); }}
        lookupMode={lookupMode}
        onSelectRow={lookupMode ? (r: any) => { if (requestId) returnAndClose(requestId, returnTab, { id: r.id, code: r.code, name: r.name }); } : undefined}
        columns={[
          { key: 'code', label: 'Code', render: (r: any) => <Badge variant="outline">{r.code}</Badge> },
          { key: 'name', label: 'Name' },
          { key: 'isActive', label: 'Status', render: (r: any) => <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Gender</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>Explanation</Label><Input value={form.explanation} onChange={(e) => set('explanation', e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
