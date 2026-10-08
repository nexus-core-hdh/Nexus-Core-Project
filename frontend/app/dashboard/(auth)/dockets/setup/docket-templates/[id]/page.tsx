"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { docketSetupApi } from "@/lib/docket-api";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Star, Copy, Loader2 } from "lucide-react";

export default function DocketTemplateDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [template, setTemplate] = useState<any>(null);
  useWorkspaceRecordLabel(template?.name || undefined);
  const [loading, setLoading] = useState(true);
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addForm, setAddForm] = useState({ documentTypeCardId: "", isRequired: true, dueDays: "" });
  const [addingItem, setAddingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, types]: any = await Promise.all([
        docketSetupApi.templates.get(id),
        docketSetupApi.documentTypes.list(),
      ]);
      setTemplate(tpl);
      setDocTypes(Array.isArray(types) ? types : (types?.data ?? []));
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddItem = async () => {
    if (!addForm.documentTypeCardId) { toast.error("Document type is required"); return; }
    setAddingItem(true);
    try {
      await docketSetupApi.templates.addItem(id, {
        documentTypeCardId: addForm.documentTypeCardId,
        isRequired: addForm.isRequired,
        dueDays: addForm.dueDays ? Number(addForm.dueDays) : undefined,
      });
      toast.success("Item added");
      setAddItemOpen(false);
      setAddForm({ documentTypeCardId: "", isRequired: true, dueDays: "" });
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add item");
    } finally {
      setAddingItem(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setDeletingItemId(itemId);
    try {
      await docketSetupApi.templates.removeItem(id, itemId);
      toast.success("Item removed");
      setTemplate((prev: any) => prev ? { ...prev, items: prev.items.filter((i: any) => i.id !== itemId) } : prev);
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleToggleRequired = async (itemId: string, isRequired: boolean) => {
    try {
      await docketSetupApi.templates.updateItem(id, itemId, { isRequired });
      setTemplate((prev: any) => prev ? { ...prev, items: prev.items.map((i: any) => i.id === itemId ? { ...i, isRequired } : i) } : prev);
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const handleSetDefault = async () => {
    setSettingDefault(true);
    try {
      await docketSetupApi.templates.setDefault(id);
      toast.success("Set as default");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSettingDefault(false);
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateName.trim()) { toast.error("Name is required"); return; }
    setDuplicating(true);
    try {
      const result: any = await docketSetupApi.templates.duplicate(id, { name: duplicateName.trim() });
      toast.success("Duplicated");
      setDuplicateOpen(false);
      if (result?.id) router.push(`/dashboard/dockets/setup/docket-templates/${result.id}`);
      else router.push("/dashboard/dockets/setup/docket-templates");
    } catch (e: any) {
      toast.error(e.message || "Failed to duplicate");
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!template) {
    return <div className="p-6 text-muted-foreground">Template not found.</div>;
  }

  const items = template.items ?? [];
  const existingTypeIds = new Set(items.map((i: any) => i.documentTypeCardId));
  const availableTypes = docTypes.filter((t) => !existingTypeIds.has(t.id));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">{template.code}</Badge>
              <span className="text-xs text-muted-foreground capitalize">{(template.entityType ?? "").replace("_", " ")}</span>
              {template.isDefault && <Badge variant="secondary" className="text-xs"><Star className="h-3 w-3 mr-1 inline fill-amber-500 text-amber-500" />Default</Badge>}
            </div>
            <h1 className="text-xl font-semibold mt-0.5">{template.name}</h1>
            {template.description && <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!template.isDefault && (
            <Button variant="outline" size="sm" onClick={handleSetDefault} disabled={settingDefault}>
              {settingDefault ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Star className="h-4 w-4 mr-1" />}Set Default
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setDuplicateName(`${template.name} (Copy)`); setDuplicateOpen(true); }}>
            <Copy className="h-4 w-4 mr-1" />Duplicate
          </Button>
          <Button size="sm" onClick={() => { setAddForm({ documentTypeCardId: "", isRequired: true, dueDays: "" }); setAddItemOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Item
          </Button>
        </div>
      </div>

      {/* Items Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Document Type</TableHead>
              <TableHead className="w-24">Category</TableHead>
              <TableHead className="w-24">Required</TableHead>
              <TableHead className="w-28">Due Days</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No items. Click "Add Item" to add document types to this template.</TableCell></TableRow>
            ) : (
              items.map((item: any, idx: number) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{item.documentTypeCard?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.documentTypeCard?.code}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.documentTypeCard?.category ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.isRequired}
                      onCheckedChange={(v) => handleToggleRequired(item.id, v)}
                    />
                  </TableCell>
                  <TableCell className="text-sm">{item.dueDays ? `${item.dueDays}d` : "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deletingItemId === item.id}
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      {deletingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Document Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Type <span className="text-destructive">*</span></Label>
              <Select value={addForm.documentTypeCardId || "__none__"} onValueChange={(v) => setAddForm((p) => ({ ...p, documentTypeCardId: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                <SelectContent>
                  {availableTypes.length === 0 ? (
                    <SelectItem value="__none__" disabled>All document types already added</SelectItem>
                  ) : (
                    availableTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} <span className="text-muted-foreground font-mono text-xs">({t.code})</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Due Days (after docket creation)</Label>
                <Input type="number" min={0} placeholder="e.g. 14" value={addForm.dueDays} onChange={(e) => setAddForm((p) => ({ ...p, dueDays: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 h-full">
                <Label className="text-sm">Required</Label>
                <Switch checked={addForm.isRequired} onCheckedChange={(v) => setAddForm((p) => ({ ...p, isRequired: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)} disabled={addingItem}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={addingItem}>{addingItem && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Duplicate Template</DialogTitle></DialogHeader>
          <div>
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
