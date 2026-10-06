"use client";

import { useEffect, useMemo, useState } from "react";
import { ListPlus, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { entitiesApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";

// The runtime "Customized Fields" tab every UDF-supported screen renders (Inventory Receipts,
// Financial Receipts, Yarn Cards, Style Cards, Sample Cards) — one implementation instead of a
// copy per screen. Definitions come from Administration > User Defined Fields; the server
// (custom-fields.service.ts) authorizes the record, validates every value and enforces Required,
// so the checks here are only early, friendlier feedback.
//
// Saving stays explicit (this tab's own Save) rather than part of the document's Save: the tab is
// only mounted while open, and the documents save through their own transactional services, so a
// combined save could leave one half written. Instead the tab shows what is unsaved — edited
// values and Default Values that are pre-filled but not stored yet — and which required fields
// are still empty.

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function CustomizedFieldsPanel({ entity, entityId, readOnly = false, className }: {
  entity: string;
  entityId: string;
  readOnly?: boolean;
  className?: string;
}) {
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [stored, setStored] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [defs, vals] = await Promise.all([
        entitiesApi.getCustomFields(entity),
        entitiesApi.getCustomFieldValues(entity, entityId),
      ]);
      const defList = Array.isArray(defs) ? defs : [];
      const storedMap: Record<string, any> = {};
      (Array.isArray(vals) ? vals : []).forEach((v: any) => { storedMap[v.customFieldId] = v.value; });
      // A field's Default Value is shown for a record that has no stored value for it yet — and,
      // until Save, is flagged as not stored. A stored value always wins over the default.
      const valueMap: Record<string, any> = { ...storedMap };
      defList.forEach((f: any) => { if (!(f.id in storedMap) && f.defaultValue != null) valueMap[f.id] = f.defaultValue; });
      setFields(defList);
      setStored(storedMap);
      setValues(valueMap);
      setShowMissing(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to load custom fields");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, entityId]);

  const setValue = (fieldId: string, v: any) => setValues((s) => ({ ...s, [fieldId]: v }));

  const missing = useMemo(
    () => fields.filter((f) => f.required && f.type !== "checkbox" && isBlank(values[f.id])),
    [fields, values],
  );
  const dirty = fields.some((f) => !same(values[f.id], stored[f.id]));
  const pendingDefault = (f: any) => !(f.id in stored) && f.defaultValue != null && same(values[f.id], f.defaultValue);

  const save = async () => {
    if (missing.length) {
      setShowMissing(true);
      toast.error(`${missing.map((f) => `"${f.name}"`).join(", ")} ${missing.length === 1 ? "is" : "are"} required.`);
      return;
    }
    setSaving(true);
    try {
      const payload = fields.map((f) => ({ customFieldId: f.id, value: values[f.id] ?? null }));
      const saved: any = await entitiesApi.upsertCustomFieldValues(entity, entityId, payload);
      const storedMap: Record<string, any> = {};
      (Array.isArray(saved) ? saved : []).forEach((v: any) => { storedMap[v.customFieldId] = v.value; });
      setStored(storedMap);
      setValues((s) => ({ ...s, ...storedMap }));
      setShowMissing(false);
      toast.success("Custom fields saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save custom fields");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  if (!fields.length) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ListPlus /></EmptyMedia>
            <EmptyTitle className="text-sm">No customized fields configured</EmptyTitle>
            <EmptyDescription>Fields for this screen are defined in Administration › User Defined Fields.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className={cn("max-w-2xl space-y-3 rounded-xl border bg-muted/20 p-4", className)}>
      {readOnly && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />View only — these values cannot be changed here.</p>
      )}
      <fieldset disabled={readOnly || saving} className="space-y-3">
        {fields.map((f) => {
          const showError = showMissing && missing.some((m) => m.id === f.id);
          return (
            <div key={f.id} className="grid grid-cols-3 items-start gap-3">
              <Label className="pt-1.5 text-sm text-muted-foreground">{f.name}{f.required && f.type !== "checkbox" ? " *" : ""}</Label>
              <div className="col-span-2 space-y-1">
                {f.type === "textarea" ? (
                  <Textarea rows={3} value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} aria-invalid={showError || undefined} />
                ) : f.type === "select" ? (
                  <Select value={values[f.id] || ""} onValueChange={(v) => setValue(f.id, v)} disabled={readOnly || saving}>
                    <SelectTrigger className="h-9 text-sm" aria-invalid={showError || undefined}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(Array.isArray(f.options) ? f.options : []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                ) : f.type === "checkbox" ? (
                  <input type="checkbox" checked={!!values[f.id]} onChange={(e) => setValue(f.id, e.target.checked)} className="h-4 w-4" />
                ) : f.type === "date" ? (
                  <Input type="date" className="h-9 text-sm" value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} aria-invalid={showError || undefined} />
                ) : f.type === "number" ? (
                  <Input type="number" className="h-9 text-sm" value={values[f.id] ?? ""} aria-invalid={showError || undefined}
                    onChange={(e) => { const n = e.target.value === "" ? null : Number(e.target.value); setValue(f.id, n === null || Number.isFinite(n) ? n : null); }} />
                ) : (
                  <Input type={f.type === "email" ? "email" : "text"} className="h-9 text-sm" value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} aria-invalid={showError || undefined} />
                )}
                {showError && <p className="text-xs text-destructive">Required.</p>}
                {!readOnly && pendingDefault(f) && <p className="text-[11px] text-muted-foreground">Default value — stored when you click Save.</p>}
              </div>
            </div>
          );
        })}
      </fieldset>
      {!readOnly && (
        <div className="flex items-center justify-end gap-3 pt-2">
          {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes — saved separately from the document.</span>}
          <Button size="sm" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saving..." : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
