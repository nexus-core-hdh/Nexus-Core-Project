"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Ban, ChevronRight, CircleCheck, Copy, Download, Eye, GripVertical, ListPlus, Pencil, Plus, Search, SearchX, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { CustomFieldFormPreview, type PreviewField } from "@/components/custom-fields/custom-field-form-preview";
import { entitiesApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  UDF_ENTITIES, controlLabel, controlOf, dataTypeLabel, definitionsCsv, draftFromField, emptyDraft, payloadOf, runtimeFieldOf,
  type UdfDraft, type UdfEntity, type UdfField,
} from "@/lib/custom-fields/udf-model";
import { FieldConfigPanel } from "./_components/field-config-panel";

// Administration > User Defined Fields — configuration of the CustomField engine whose fields the
// screens' "Customized Fields" tabs render (see lib/custom-fields/udf-model.ts and the backend's
// custom-fields.service.ts). Only runtime-supported entities and controls are configurable here;
// everything is persisted and enforced server-side (scope, immutable codes, delete safety, audit).

type StatusFilter = "all" | "active" | "inactive";

export default function UserDefinedFieldsPage() {
  const user = typeof window !== "undefined" ? getCurrentUser() : null;
  const hasBranch = !!(user as any)?.branchId;
  const [fields, setFields] = useState<UdfField[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entityKey, setEntityKey] = useState(UDF_ENTITIES[0].key);
  const [entitySearch, setEntitySearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [draft, setDraft] = useState<UdfDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<UdfDraft | null>(null);
  const [screenPreviewOpen, setScreenPreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UdfField | null>(null);

  const entity = UDF_ENTITIES.find((e) => e.key === entityKey)!;
  const supported = entity.capability === "supported";

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r: any = await entitiesApi.listCustomFieldsAdmin();
      setFields(Array.isArray(r) ? r : []);
    } catch (e: any) {
      setLoadError(e.message || "Failed to load fields");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const countByEntity = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fields) m.set(f.entity, (m.get(f.entity) ?? 0) + 1);
    return m;
  }, [fields]);

  const entityFields = useMemo(
    () => fields.filter((f) => f.entity === entityKey).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields, entityKey],
  );
  const shownFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    return entityFields.filter((f) =>
      (status === "all" || (status === "active" ? f.isActive : !f.isActive))
      && (!q || f.code.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)));
  }, [entityFields, fieldSearch, status]);
  const reorderable = status === "all" && !fieldSearch.trim();

  const visibleEntities = UDF_ENTITIES.filter((e) => !entitySearch.trim() || e.label.toLowerCase().includes(entitySearch.trim().toLowerCase()));

  const selectEntity = (e: UdfEntity) => { setEntityKey(e.key); setDraft(null); setFieldSearch(""); };
  const newField = () => supported && setDraft(emptyDraft(entityKey, "company"));
  const editField = (f: UdfField) => setDraft(draftFromField(f));
  const duplicateField = (f: UdfField) => setDraft({ ...draftFromField(f), id: null, code: `${f.code}_Copy`, codeTouched: true, name: `${f.name} (Copy)`, valueCount: 0 });

  const replaceField = (saved: UdfField) => setFields((list) => {
    const exists = list.some((f) => f.id === saved.id);
    return exists ? list.map((f) => (f.id === saved.id ? saved : f)) : [...list, saved];
  });

  const save = async () => {
    if (!draft) return;
    const p = payloadOf(draft);
    if (!p.name) return toast.error("Caption is required.");
    if (!draft.id && !/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(draft.code.trim())) return toast.error("Field Code must start with a letter and use only letters, digits and underscores.");
    setSaving(true);
    try {
      const saved: any = draft.id ? await entitiesApi.updateCustomField(draft.id, p) : await entitiesApi.createCustomField(p);
      replaceField(saved);
      setDraft(draftFromField(saved));
      toast.success(draft.id ? "Field saved" : "Field created");
    } catch (e: any) {
      toast.error(e.message || "Failed to save the field");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (f: UdfField, isActive: boolean) => {
    try {
      const saved: any = await entitiesApi.updateCustomField(f.id, { isActive });
      replaceField(saved);
      if (draft?.id === f.id) setDraft({ ...draft, isActive: saved.isActive });
      toast.success(isActive ? "Field activated" : "Field deactivated — existing values are kept");
    } catch (e: any) {
      toast.error(e.message || "Failed to update the field");
    }
  };

  const confirmDelete = async () => {
    const f = deleteTarget;
    if (!f) return;
    setDeleteTarget(null);
    try {
      await entitiesApi.deleteCustomField(f.id);
      setFields((list) => list.filter((x) => x.id !== f.id));
      if (draft?.id === f.id) setDraft(null);
      toast.success("Field deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete the field");
      load();
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ordered = arrayMove(entityFields, entityFields.findIndex((f) => f.id === active.id), entityFields.findIndex((f) => f.id === over.id));
    const previous = fields;
    setFields((list) => list.map((f) => { const i = ordered.findIndex((o) => o.id === f.id); return i >= 0 ? { ...f, sortOrder: i } : f; }));
    try {
      const r: any = await entitiesApi.reorderCustomFields(entityKey, ordered.map((f) => f.id));
      if (Array.isArray(r)) setFields((list) => [...list.filter((f) => f.entity !== entityKey), ...r]);
    } catch (e: any) {
      setFields(previous);
      toast.error(e.message || "Failed to reorder the fields");
    }
  };

  const exportCsv = () => {
    const blob = new Blob(["﻿" + definitionsCsv(entityFields)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-defined-fields-${entity.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const screenPreviewFields: PreviewField[] = entityFields.filter((f) => f.isActive).map((f) => ({
    id: f.id, name: f.name, type: f.type, required: f.required, options: Array.isArray(f.options) ? f.options : [], defaultValue: f.defaultValue,
  }));

  const rowActions = (f: UdfField): RowAction[] => [
    { key: "edit", label: "Edit", icon: Pencil, onSelect: () => editField(f) },
    { key: "duplicate", label: "Duplicate", icon: Copy, onSelect: () => duplicateField(f), disabled: !supported },
    f.isActive
      ? { key: "deactivate", label: "Deactivate", icon: Ban, onSelect: () => setActive(f, false) }
      : { key: "activate", label: "Activate", icon: CircleCheck, onSelect: () => setActive(f, true), disabled: !supported },
    {
      key: "delete", label: f.valueCount ? `Delete (has ${f.valueCount} value${f.valueCount === 1 ? "" : "s"} — deactivate instead)` : "Delete",
      icon: Trash2, onSelect: () => setDeleteTarget(f), destructive: true, separatorBefore: true, disabled: f.valueCount > 0,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Administration</span><ChevronRight className="h-3 w-3" /><span>System Configuration</span><ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">User Defined Fields</span>
      </div>

      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15"><ListPlus className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">User Defined Fields</h1>
            <p className="text-xs text-muted-foreground">Create and manage custom fields for ERP screens and business entities.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setScreenPreviewOpen(true)} disabled={!supported}><Eye className="mr-1.5 h-3.5 w-3.5" />Preview on Screen</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!entityFields.length}><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button>
          <Button size="sm" onClick={newField} disabled={!supported}><Plus className="mr-1.5 h-3.5 w-3.5" />New Field</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_420px]">
        {/* LEFT — business entities */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="space-y-2 border-b p-3">
            <h2 className="text-sm font-semibold">Business Entities</h2>
            <InputGroup className="h-8">
              <InputGroupAddon><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
              <InputGroupInput placeholder="Search entities..." value={entitySearch} onChange={(e) => setEntitySearch(e.target.value)} className="text-sm" />
            </InputGroup>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Business entities">
            {visibleEntities.map((e) => {
              const active = e.key === entityKey;
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => selectEntity(e)}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                    active ? "bg-primary/10 text-foreground ring-1 ring-primary/25" : "hover:bg-muted/60")}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", active && "font-medium")}>{e.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{e.hint}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={e.capability === "supported" ? "secondary" : "outline"} className={cn("h-4 px-1.5 text-[10px] font-normal", e.capability === "supported" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                      {e.capability === "supported" ? "Supported" : "Definitions only"}
                    </Badge>
                    {(countByEntity.get(e.key) ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{countByEntity.get(e.key)} field{countByEntity.get(e.key) === 1 ? "" : "s"}</span>}
                  </span>
                </button>
              );
            })}
            {!visibleEntities.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No entity matches.</p>}
          </nav>
        </section>

        {/* CENTER — field definitions */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <h2 className="mr-auto flex items-center gap-2 text-sm font-semibold">
              Field Definitions
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">{entityFields.length}</Badge>
              <span className="text-xs font-normal text-muted-foreground">· {entity.label}</span>
            </h2>
            <InputGroup className="h-8 w-48">
              <InputGroupAddon><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
              <InputGroupInput placeholder="Search fields..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} className="text-sm" />
            </InputGroup>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fields</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8" onClick={newField} disabled={!supported}><Plus className="mr-1 h-3.5 w-3.5" />Add Field</Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!supported && (
              <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <span className="font-medium">Not supported at runtime.</span> The {entity.label} screen does not display User Defined Fields yet, so fields cannot be created or activated for it.
              </div>
            )}
            {loading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : loadError ? (
              <Empty className="py-12">
                <EmptyHeader><EmptyMedia variant="icon"><SearchX /></EmptyMedia><EmptyTitle>Could not load fields</EmptyTitle><EmptyDescription>{loadError}</EmptyDescription></EmptyHeader>
                <EmptyContent><Button size="sm" variant="outline" onClick={load}>Retry</Button></EmptyContent>
              </Empty>
            ) : !shownFields.length ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">{entityFields.length ? <SearchX /> : <ListPlus />}</EmptyMedia>
                  <EmptyTitle>{entityFields.length ? "No matching fields" : "No fields yet"}</EmptyTitle>
                  <EmptyDescription>
                    {entityFields.length ? "Try a different search or status." : supported ? `Add the first custom field for ${entity.label}.` : "Fields arrive once this screen can display them."}
                  </EmptyDescription>
                </EmptyHeader>
                {!entityFields.length && supported && <EmptyContent><Button size="sm" onClick={newField}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Field</Button></EmptyContent>}
              </Empty>
            ) : (
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-700 text-left text-[11px] font-semibold uppercase tracking-wide text-white dark:bg-slate-800">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2">Field Code</th>
                    <th className="px-3 py-2">Caption</th>
                    <th className="w-32 px-3 py-2">Data Type</th>
                    <th className="w-24 px-3 py-2">Status</th>
                    <th className="w-14 px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={shownFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {shownFields.map((f) => (
                        <FieldRow
                          key={f.id}
                          field={f}
                          selected={draft?.id === f.id}
                          reorderable={reorderable}
                          onOpen={() => editField(f)}
                          actions={rowActions(f)}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            )}
          </div>
          {!loading && !loadError && entityFields.length > 1 && (
            <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              {reorderable ? "Drag the handle to change the order the screen shows the fields in." : "Clear the search and status filter to reorder."}
            </p>
          )}
        </section>

        {/* RIGHT — configuration */}
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card lg:col-span-2 xl:col-span-1">
          {draft ? (
            <FieldConfigPanel
              draft={draft}
              onChange={setDraft}
              onSave={save}
              onCancel={() => setDraft(null)}
              onPreview={() => setPreviewDraft(draft)}
              saving={saving}
              hasBranch={hasBranch}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Pencil /></EmptyMedia>
                <EmptyTitle>No field selected</EmptyTitle>
                <EmptyDescription>Select a field to configure it{supported ? ", or add a new one" : ""}.</EmptyDescription>
              </EmptyHeader>
              {supported && <EmptyContent><Button size="sm" variant="outline" onClick={newField}><Plus className="mr-1.5 h-3.5 w-3.5" />New Field</Button></EmptyContent>}
            </Empty>
          )}
        </section>
      </div>

      {/* Field preview — the draft exactly as the runtime would render it */}
      <Dialog open={!!previewDraft} onOpenChange={(o) => !o && setPreviewDraft(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Field Preview</DialogTitle>
            <DialogDescription>How this field appears in the {entity.screen ?? entity.label} screen&apos;s Customized Fields tab (nothing is saved).</DialogDescription>
          </DialogHeader>
          {previewDraft && <CustomFieldFormPreview fields={[runtimeFieldOf(previewDraft)]} />}
        </DialogContent>
      </Dialog>

      {/* Screen preview — every active field of the entity, in order */}
      <Dialog open={screenPreviewOpen} onOpenChange={setScreenPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{entity.screen ?? entity.label} — Customized Fields</DialogTitle>
            <DialogDescription>The active fields, in order, as the screen&apos;s Customized Fields tab shows them (saved configuration only; nothing is saved here).</DialogDescription>
          </DialogHeader>
          {screenPreviewFields.length
            ? <CustomFieldFormPreview fields={screenPreviewFields} />
            : <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No active fields for {entity.label} yet.</p>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete field “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.code} has no saved values, so it can be deleted permanently. If it is only temporarily unwanted, deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldRow({ field, selected, reorderable, onOpen, actions }: {
  field: UdfField; selected: boolean; reorderable: boolean; onOpen: () => void; actions: RowAction[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, disabled: !reorderable });
  const control = controlOf(field);
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onOpen}
      className={cn("cursor-pointer border-b transition-colors hover:bg-muted/50", selected && "bg-primary/5 hover:bg-primary/10", isDragging && "relative z-10 bg-card shadow-md")}
    >
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={cn("text-muted-foreground", reorderable ? "cursor-grab" : "cursor-not-allowed opacity-30")} aria-label="Reorder field" {...attributes} {...listeners}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="truncate px-3 py-2 font-mono text-xs" title={field.code}>{field.code}</td>
      <td className="truncate px-3 py-2" title={field.description ?? field.name}>
        {field.name}{field.required && <span className="ml-0.5 text-destructive">*</span>}
        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{field.scope}</span>
      </td>
      <td className="truncate px-3 py-2 text-xs text-muted-foreground" title={`${dataTypeLabel(control)} · ${controlLabel(control)}`}>{controlLabel(control)}</td>
      <td className="px-3 py-2">
        <Badge variant={field.isActive ? "secondary" : "outline"} className={cn("h-5 text-[11px] font-normal", field.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
          {field.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <RowActionsMenu actions={actions} className="ml-auto" />
      </td>
    </tr>
  );
}
