"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, GripVertical, Lock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DATA_TYPES, controlLabel, dataTypeOf, newOptionKey, suggestCode,
  type ControlType, type DataType, type Scope, type UdfDraft, type UdfOption,
} from "@/lib/custom-fields/udf-model";

// Tabs the runtime cannot honour yet — shown, but disabled, so nothing pretends to work.
const FUTURE_TABS = ["Validation", "Visibility", "Placement", "Permissions"] as const;

interface Props {
  draft: UdfDraft;
  onChange: (next: UdfDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreview: () => void;
  saving: boolean;
  hasBranch: boolean;
}

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <Label className="text-xs font-medium text-muted-foreground">
    {children}{required && <span className="ml-0.5 text-destructive">*</span>}
  </Label>
);

export function FieldConfigPanel({ draft, onChange, onSave, onCancel, onPreview, saving, hasBranch }: Props) {
  const set = (patch: Partial<UdfDraft>) => onChange({ ...draft, ...patch });
  const isNew = draft.id === null;
  const hasValues = draft.valueCount > 0;
  const dataType = dataTypeOf(draft.controlType);
  const controls = DATA_TYPES.find((d) => d.value === dataType)!.controls;
  const activeLabels = draft.options.filter((o) => o.isActive && o.label.trim()).map((o) => o.label.trim());

  const changeDataType = (dt: DataType) => {
    const control = DATA_TYPES.find((d) => d.value === dt)!.controls[0].value;
    changeControl(control);
  };
  const changeControl = (control: ControlType) => set({
    controlType: control,
    defaultValue: null,
    required: control === "checkbox" ? false : draft.required,
    options: control === "dropdown" && !draft.options.length
      ? [{ key: newOptionKey(), code: "01", label: "", isActive: true }]
      : draft.options,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Field Configuration</h2>
          <p className="truncate text-xs text-muted-foreground">{isNew ? "New field" : draft.code}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Switch checked={draft.isActive} onCheckedChange={(v) => set({ isActive: v })} aria-label="Active" />
            {draft.isActive ? "Active" : "Inactive"}
          </label>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} title="Close"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b px-4">
          <TooltipProvider>
            <TabsList className="h-9 bg-transparent p-0">
              <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
              <TabsTrigger value="control" className="text-xs">Control</TabsTrigger>
              {FUTURE_TABS.map((t) => (
                <Tooltip key={t}>
                  <TooltipTrigger asChild>
                    <span><TabsTrigger value={t} disabled className="text-xs">{t}</TabsTrigger></span>
                  </TooltipTrigger>
                  <TooltipContent>Coming in a future runtime phase — the screens do not apply this yet.</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </TooltipProvider>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="general" className="space-y-4 p-4">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Basic Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel required>Field Code</FieldLabel>
                  <div className="relative">
                    <Input
                      value={draft.code}
                      disabled={!isNew}
                      onChange={(e) => set({ code: e.target.value.replace(/\s+/g, "_"), codeTouched: true })}
                      className={cn("h-9 font-mono text-sm", !isNew && "pr-8")}
                      placeholder="UD_FabricType"
                    />
                    {!isNew && <Lock className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{isNew ? "Letters, digits, underscores. Fixed once saved." : "Fixed after creation."}</p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Caption</FieldLabel>
                  <Input
                    value={draft.name}
                    maxLength={120}
                    onChange={(e) => set({ name: e.target.value, ...(isNew && !draft.codeTouched ? { code: suggestCode(e.target.value) } : {}) })}
                    className="h-9 text-sm"
                    placeholder="Fabric Type"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Description</FieldLabel>
                <Textarea rows={2} maxLength={500} value={draft.description} onChange={(e) => set({ description: e.target.value })} className="text-sm" placeholder="What this field records" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel required>Data Type</FieldLabel>
                  <Select value={dataType} onValueChange={(v) => changeDataType(v as DataType)} disabled={hasValues}>
                    <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{DATA_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Control Type</FieldLabel>
                  <Select value={draft.controlType} onValueChange={(v) => changeControl(v as ControlType)} disabled={hasValues || controls.length < 2}>
                    <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{controls.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {hasValues && (
                <p className="text-[11px] text-muted-foreground">
                  This field already holds {draft.valueCount} saved value{draft.valueCount === 1 ? "" : "s"}, so its type and scope are fixed.
                </p>
              )}
            </section>

            <section className="space-y-3 border-t pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel required>Scope</FieldLabel>
                  <Select value={draft.scope} onValueChange={(v) => set({ scope: v as Scope })} disabled={hasValues}>
                    <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="branch" disabled={!hasBranch}>Branch{!hasBranch ? " (no branch assigned)" : ""}</SelectItem>
                      <SelectItem value="global" disabled>Global — needs an ERP-wide admin permission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Default Value</FieldLabel>
                  <DefaultValueInput draft={draft} activeLabels={activeLabels} onChange={(v) => set({ defaultValue: v })} />
                </div>
              </div>
              <label className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5", draft.controlType === "checkbox" && "opacity-60")}>
                <span>
                  <span className="block text-sm font-medium">Required</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {draft.controlType === "checkbox" ? "A Yes / No field always has a value." : "The record cannot be saved while this field is empty."}
                  </span>
                </span>
                <Switch checked={draft.required && draft.controlType !== "checkbox"} disabled={draft.controlType === "checkbox"} onCheckedChange={(v) => set({ required: v })} />
              </label>
            </section>
          </TabsContent>

          <TabsContent value="control" className="space-y-3 p-4">
            {draft.controlType === "dropdown" ? (
              <OptionsEditor draft={draft} onChange={(options, defaultValue) => set({ options, defaultValue })} />
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{controlLabel(draft.controlType)}</p>
                <p className="mt-1 text-xs">
                  {draft.controlType === "textarea" ? "A multi-line text box."
                    : draft.controlType === "email" ? "A text box for an email address."
                    : draft.controlType === "number" ? "A numeric input."
                    : draft.controlType === "date" ? "A date picker."
                    : draft.controlType === "checkbox" ? "A Yes / No check box."
                    : "A single-line text box."} No further settings for this control.
                </p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <Button variant="outline" size="sm" onClick={onPreview}><Eye className="mr-1.5 h-3.5 w-3.5" />Preview</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save Field"}</Button>
        </div>
      </div>
    </div>
  );
}

function DefaultValueInput({ draft, activeLabels, onChange }: { draft: UdfDraft; activeLabels: string[]; onChange: (v: UdfDraft["defaultValue"]) => void }) {
  const v = draft.defaultValue;
  switch (draft.controlType) {
    case "dropdown":
      return (
        <Select value={typeof v === "string" && activeLabels.includes(v) ? v : "__none"} onValueChange={(x) => onChange(x === "__none" ? null : x)}>
          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="No default" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No default</SelectItem>
            {activeLabels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "checkbox":
      return (
        <Select value={v === true ? "yes" : v === false ? "no" : "__none"} onValueChange={(x) => onChange(x === "yes" ? true : x === "no" ? false : null)}>
          <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No default</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      );
    case "number":
      return <Input type="number" className="h-9 text-sm" value={typeof v === "number" ? v : v === null ? "" : String(v)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder="None" />;
    case "date":
      return <Input type="date" className="h-9 text-sm" value={typeof v === "string" ? v : ""} onChange={(e) => onChange(e.target.value || null)} />;
    default:
      return <Input type={draft.controlType === "email" ? "email" : "text"} className="h-9 text-sm" value={typeof v === "string" ? v : ""} onChange={(e) => onChange(e.target.value || null)} placeholder="None" />;
  }
}

function OptionsEditor({ draft, onChange }: { draft: UdfDraft; onChange: (options: UdfOption[], defaultValue: UdfDraft["defaultValue"]) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const opts = draft.options;
  const def = typeof draft.defaultValue === "string" ? draft.defaultValue : null;
  // The default is held by label (the runtime value); keep it pointing at the same option when its
  // label is edited, and clear it if that option is removed or deactivated.
  const update = (key: string, patch: Partial<UdfOption>) => {
    const before = opts.find((o) => o.key === key)!;
    const next = opts.map((o) => (o.key === key ? { ...o, ...patch } : o));
    const after = next.find((o) => o.key === key)!;
    let nextDefault = draft.defaultValue;
    if (def !== null && before.label.trim() === def) nextDefault = after.isActive && after.label.trim() ? after.label.trim() : null;
    onChange(next, nextDefault);
  };
  const remove = (key: string) => {
    const gone = opts.find((o) => o.key === key)!;
    onChange(opts.filter((o) => o.key !== key), def !== null && gone.label.trim() === def ? null : draft.defaultValue);
  };
  const add = () => {
    const used = new Set(opts.map((o) => o.code));
    let n = opts.length + 1;
    while (used.has(String(n).padStart(2, "0"))) n++;
    onChange([...opts, { key: newOptionKey(), code: String(n).padStart(2, "0"), label: "", isActive: true }], draft.defaultValue);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(opts, opts.findIndex((o) => o.key === active.id), opts.findIndex((o) => o.key === over.id)), draft.defaultValue);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Dropdown Options</h3>
        <span className="text-[11px] text-muted-foreground">The screen stores the selected label.</span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[28px_70px_minmax(0,1fr)_56px_56px_36px] items-center gap-2 bg-slate-700 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-slate-800">
          <span /><span>Code</span><span>Label</span><span className="text-center">Default</span><span className="text-center">Active</span><span />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={opts.map((o) => o.key)} strategy={verticalListSortingStrategy}>
            {opts.map((o) => (
              <OptionRow
                key={o.key}
                option={o}
                isDefault={def !== null && o.isActive && o.label.trim() === def}
                onUpdate={(patch) => update(o.key, patch)}
                onSetDefault={() => onChange(opts, def === o.label.trim() ? null : o.label.trim())}
                onRemove={() => remove(o.key)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {!opts.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No options yet.</p>}
      </div>
      <Button variant="outline" size="sm" onClick={add}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Option</Button>
    </div>
  );
}

function OptionRow({ option, isDefault, onUpdate, onSetDefault, onRemove }: {
  option: UdfOption; isDefault: boolean; onUpdate: (patch: Partial<UdfOption>) => void; onSetDefault: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("grid grid-cols-[28px_70px_minmax(0,1fr)_56px_56px_36px] items-center gap-2 border-t bg-card px-2 py-1.5", isDragging && "relative z-10 shadow-md")}
    >
      <button type="button" className="flex cursor-grab items-center justify-center text-muted-foreground" aria-label="Reorder option" {...attributes} {...listeners}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Input value={option.code} onChange={(e) => onUpdate({ code: e.target.value.replace(/\s+/g, "") })} className="h-7 font-mono text-xs" maxLength={20} />
      <Input value={option.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-7 text-xs" placeholder="Label" maxLength={120} />
      <div className="flex justify-center">
        <input type="radio" checked={isDefault} disabled={!option.isActive || !option.label.trim()} onChange={onSetDefault} onClick={() => isDefault && onSetDefault()} className="h-3.5 w-3.5" aria-label="Default option" />
      </div>
      <div className="flex justify-center"><Switch checked={option.isActive} onCheckedChange={(v) => onUpdate({ isActive: v })} aria-label="Option active" /></div>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove} title="Delete option"><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
