"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Pencil, Copy, Trash2 } from "lucide-react";

const TYPES = ['style-card', 'sample-card', 'product-card', 'order', 'task'];
const empty = { name: '', type: 'style-card', description: '', isDefault: false, isActive: true, structure: '' };

export default function TemplatesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await plmApi.templates.list({}); setData(Array.isArray(r) ? r : []); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return toast.error("Name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      let structure: any = {};
      try { structure = form.structure ? JSON.parse(form.structure) : {}; } catch { return toast.error("Structure must be valid JSON"); }
      const payload = { ...form, branchId: user?.branchId, createdBy: user?.id, structure };
      if (editing) { await plmApi.templates.update(editing, payload); toast.success("Updated"); }
      else { await plmApi.templates.create(payload); toast.success("Created"); }
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const duplicate = async (id: string) => {
    try { await plmApi.templates.duplicate(id); toast.success("Duplicated"); load(); } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    try { await plmApi.templates.delete(id); toast.success("Deleted"); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold">PLM Templates</h1><p className="text-xs text-muted-foreground">Reusable templates for PLM entities</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Template</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Default</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No templates yet</TableCell></TableRow>
            ) : data.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                <TableCell>{t.isDefault ? <Badge>Default</Badge> : '—'}</TableCell>
                <TableCell><Badge variant={t.isActive ? 'default' : 'secondary'}>{t.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({ name: t.name, type: t.type, description: t.description || '', isDefault: t.isDefault, isActive: t.isActive, structure: JSON.stringify(t.structure || {}, null, 2) }); setEditing(t.id); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicate(t.id)}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p: any) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
            <div><Label>Structure (JSON)</Label><Textarea value={form.structure} onChange={(e) => setForm((p: any) => ({ ...p, structure: e.target.value }))} rows={4} placeholder="{}" className="font-mono text-xs" /></div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={form.isDefault} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isDefault: v }))} /><Label>Default</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((p: any) => ({ ...p, isActive: v }))} /><Label>Active</Label></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
