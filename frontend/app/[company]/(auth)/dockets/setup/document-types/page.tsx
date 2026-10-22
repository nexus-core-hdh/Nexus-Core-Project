"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { docketSetupApi } from "@/lib/docket-api";
import { toast } from "sonner";
import { Tag, Plus, RefreshCw, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";

const CATEGORIES = ["design", "sample", "material", "compliance", "commercial", "quality"];
const FORMATS = ["pdf", "jpg", "png", "xlsx", "docx", "dwg"];

const emptyForm = {
  name: "", code: "", category: "", allowedFormats: [] as string[],
  maxSizeMb: "", requiresApproval: true, expiryDays: "", isActive: true,
};

function codeFromName(name: string) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
}

export default function DocumentTypesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketSetupApi.documentTypes.list();
      setData(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (field: keyof typeof emptyForm, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const toggleFormat = (fmt: string) => {
    setForm((p) => ({
      ...p,
      allowedFormats: p.allowedFormats.includes(fmt)
        ? p.allowedFormats.filter((f) => f !== fmt)
        : [...p.allowedFormats, fmt],
    }));
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      name: row.name ?? "", code: row.code ?? "", category: row.category ?? "",
      allowedFormats: Array.isArray(row.allowedFormats) ? row.allowedFormats : [],
      maxSizeMb: row.maxSizeMb != null ? String(row.maxSizeMb) : "",
      requiresApproval: row.requiresApproval ?? true,
      expiryDays: row.expiryDays != null ? String(row.expiryDays) : "",
      isActive: row.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    if (!form.category) { toast.error("Category is required"); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        category: form.category,
        allowedFormats: form.allowedFormats,
        maxSizeMb: form.maxSizeMb ? Number(form.maxSizeMb) : undefined,
        requiresApproval: form.requiresApproval,
        expiryDays: form.expiryDays ? Number(form.expiryDays) : undefined,
        isActive: form.isActive,
      };
      if (editing) { await docketSetupApi.documentTypes.update(editing.id, payload); toast.success("Updated"); }
      else { await docketSetupApi.documentTypes.create(payload); toast.success("Created"); }
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
      await docketSetupApi.documentTypes.delete(id);
      toast.success("Deleted");
      setData((p) => p.filter((r) => r.id !== id));
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      await docketSetupApi.documentTypes.toggle(id);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Document Types</h1>
            <p className="text-xs text-muted-foreground">Define document type cards for docket items</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Type</Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Formats</TableHead>
              <TableHead className="w-20">Max MB</TableHead>
              <TableHead className="w-28">Approval</TableHead>
              <TableHead className="w-24">Expiry Days</TableHead>
              <TableHead className="w-16">Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No document types yet.</TableCell></TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{row.code}</Badge></TableCell>
                  <TableCell className="font-medium text-sm">{row.name}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground capitalize">{row.category}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(Array.isArray(row.allowedFormats) ? row.allowedFormats : []).map((f: string) => (
                        <span key={f} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs uppercase">{f}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.maxSizeMb ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.requiresApproval ? "default" : "outline"} className="text-xs">
                      {row.requiresApproval ? "Required" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.expiryDays ? `${row.expiryDays}d` : "Never"}</TableCell>
                  <TableCell>
                    <Switch checked={row.isActive} onCheckedChange={() => handleToggle(row.id)} disabled={togglingId === row.id} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={deletingId === row.id}>
                          {deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Document Type" : "Add Document Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Tech Pack"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  set("name", name);
                  if (!editing) set("code", codeFromName(name));
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input placeholder="TECH_PACK" className="font-mono uppercase" value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={form.category || "__none__"} onValueChange={(v) => set("category", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="w-full">
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Allowed Formats</Label>
              <div className="flex gap-2 flex-wrap">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFormat(f)}
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${
                      form.allowedFormats.includes(f)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Max Size (MB)</Label>
                <Input type="number" min={0} placeholder="e.g. 50" value={form.maxSizeMb}
                  onChange={(e) => set("maxSizeMb", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Days (0 = never)</Label>
                <Input type="number" min={0} placeholder="e.g. 365" value={form.expiryDays}
                  onChange={(e) => set("expiryDays", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label className="text-sm cursor-pointer">Requires Approval</Label>
                <Switch checked={form.requiresApproval} onCheckedChange={(v) => set("requiresApproval", v)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label className="text-sm cursor-pointer">Active</Label>
                <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
