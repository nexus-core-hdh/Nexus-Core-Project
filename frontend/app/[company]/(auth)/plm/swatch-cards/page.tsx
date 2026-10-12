"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, Pencil } from "lucide-react";

const empty = { colorName: '', swatchNumber: '', colorCode: '', supplierName: '', composition: '', width: '', gsm: '', notes: '', status: 'active' };

export default function SwatchCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: any = {};
      if (search) q.search = search;
      const r: any = await plmApi.swatchCards.list(q);
      setData(r?.data ?? (Array.isArray(r) ? r : []));
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.colorName) return toast.error("Color name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = { ...form, branchId: user?.branchId, width: form.width ? parseFloat(form.width) : undefined, gsm: form.gsm ? parseFloat(form.gsm) : undefined };
      if (editing) { await plmApi.swatchCards.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.swatchCards.create(payload); toast.success("Swatch created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold">Swatch Cards</h1><p className="text-xs text-muted-foreground">{Array.isArray(data) ? data.length : (data as any)?.meta?.total ?? 0} swatches</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Swatch</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search swatches..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" /></div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No swatch cards yet. Create your first swatch.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {data.map((sw) => (
            <div key={sw.id} className="rounded-lg border bg-card overflow-hidden group cursor-pointer hover:shadow-md transition-shadow">
              <div className="h-20 relative" style={{ backgroundColor: sw.colorCode || '#e5e7eb' }}>
                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 bg-white/80 hover:bg-white"
                  onClick={() => { setForm({ colorName: sw.colorName, swatchNumber: sw.swatchNumber || '', colorCode: sw.colorCode || '', supplierName: sw.supplierName || '', composition: sw.composition || '', width: sw.width || '', gsm: sw.gsm || '', notes: sw.notes || '', status: sw.status }); setEditing(sw.id); setOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              <div className="p-2">
                <p className="text-xs font-medium truncate">{sw.colorName}</p>
                <p className="text-xs text-muted-foreground">{sw.swatchNumber}</p>
                {sw.supplierName && <p className="text-xs text-muted-foreground truncate">{sw.supplierName}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Swatch Card</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Color Name *</Label><Input value={form.colorName} onChange={(e) => setForm((p: any) => ({ ...p, colorName: e.target.value }))} placeholder="e.g. Navy Blue" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Color Code</Label><Input type="color" value={form.colorCode || '#000000'} onChange={(e) => setForm((p: any) => ({ ...p, colorCode: e.target.value }))} /></div>
              <div><Label>Pantone</Label><Input value={form.pantoneCode} onChange={(e) => setForm((p: any) => ({ ...p, pantoneCode: e.target.value }))} /></div>
            </div>
            <div><Label>Supplier</Label><Input value={form.supplierName} onChange={(e) => setForm((p: any) => ({ ...p, supplierName: e.target.value }))} /></div>
            <div><Label>Composition</Label><Input value={form.composition} onChange={(e) => setForm((p: any) => ({ ...p, composition: e.target.value }))} placeholder="e.g. 100% Cotton" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Width (cm)</Label><Input type="number" value={form.width} onChange={(e) => setForm((p: any) => ({ ...p, width: e.target.value }))} /></div>
              <div><Label>GSM</Label><Input type="number" value={form.gsm} onChange={(e) => setForm((p: any) => ({ ...p, gsm: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
