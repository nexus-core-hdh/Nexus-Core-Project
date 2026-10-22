"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { docketSetupApi } from "@/lib/docket-api";
import { toast } from "sonner";
import { LayoutTemplate, Plus, RefreshCw, MoreHorizontal, Pencil, Trash2, Loader2, Star, Copy, ExternalLink } from "lucide-react";

const ENTITY_TYPES = ["style_card", "sample_card", "product_card", "plm_order"];

const emptyForm = { name: "", code: "", entityType: "", description: "", isActive: true };

function codeFromName(name: string) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
}

export default function DocketTemplatesPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicatingFrom, setDuplicatingFrom] = useState<any>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketSetupApi.templates.list();
      setData(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (field: keyof typeof emptyForm, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (row: any) => {
    setEditing(row);
    setForm({ name: row.name ?? "", code: row.code ?? "", entityType: row.entityType ?? "", description: row.description ?? "", isActive: row.isActive ?? true });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    if (!form.entityType) { toast.error("Entity type is required"); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim().toUpperCase(), entityType: form.entityType, description: form.description || undefined, isActive: form.isActive };
      if (editing) { await docketSetupApi.templates.update(editing.id, payload); toast.success("Updated"); }
      else { await docketSetupApi.templates.create(payload); toast.success("Created"); }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await docketSetupApi.templates.delete(id);
      toast.success("Deleted");
      setData((p) => p.filter((r) => r.id !== id));
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await docketSetupApi.templates.setDefault(id);
      toast.success("Set as default");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const openDuplicate = (row: any) => {
    setDuplicatingFrom(row);
    setDuplicateName(`${row.name} (Copy)`);
    setDuplicateOpen(true);
  };

  const handleDuplicate = async () => {
    if (!duplicateName.trim()) { toast.error("Name is required"); return; }
    setDuplicating(true);
    try {
      await docketSetupApi.templates.duplicate(duplicatingFrom.id, { name: duplicateName.trim() });
      toast.success("Duplicated");
      setDuplicateOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Docket Templates</h1>
            <p className="text-xs text-muted-foreground">Predefined document checklists for each entity type</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Template</Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Code</TableHead>
              <TableHead className="w-32">Entity Type</TableHead>
              <TableHead className="w-20">Default</TableHead>
              <TableHead className="w-20">Items</TableHead>
              <TableHead className="w-16">Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No templates yet.</TableCell></TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/dockets/setup/docket-templates/${row.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {row.isDefault && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                      <span className="font-medium text-sm">{row.name}</span>
                    </div>
                    {row.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.description}</p>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{row.code}</Badge></TableCell>
                  <TableCell>
                    <span className="text-xs capitalize">{(row.entityType ?? "").replace("_", " ")}</span>
                  </TableCell>
                  <TableCell>
                    {row.isDefault ? <Badge variant="secondary" className="text-xs">Default</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{row._count?.items ?? row.items?.length ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "outline"} className="text-xs">{row.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={deletingId === row.id}>
                          {deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/dockets/setup/docket-templates/${row.id}`)}>
                          <ExternalLink className="h-4 w-4 mr-2" />Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDuplicate(row)}><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                        {!row.isDefault && <DropdownMenuItem onClick={() => handleSetDefault(row.id)}><Star className="h-4 w-4 mr-2" />Set as Default</DropdownMenuItem>}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(row.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Standard Style Docket" value={form.name} onChange={(e) => { const n = e.target.value; set("name", n); if (!editing) set("code", codeFromName(n)); }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input className="font-mono uppercase" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label>Entity Type <span className="text-destructive">*</span></Label>
                <Select value={form.entityType || "__none__"} onValueChange={(v) => set("entityType", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="w-full">
                    {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="Brief description" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Duplicate Template</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>New Template Name</Label>
            <Input value={duplicateName} onChange={(e) => setDuplicateName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)} disabled={duplicating}>Cancel</Button>
            <Button onClick={handleDuplicate} disabled={duplicating}>{duplicating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
