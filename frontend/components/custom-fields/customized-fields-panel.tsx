"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ListPlus, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DatePicker } from "@/components/ui/date-picker";
import { entitiesApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";

// The runtime "Customized Fields" tab every UDF-supported screen renders — one implementation
// instead of a copy per screen. Definitions come from Administration > User Defined Fields; the
// server (custom-fields.service.ts) authorizes the record, validates every value and enforces
// Required, so the checks here are only early, friendlier feedback.
//
// Two ways to save, chosen by the screen:
//  - Own Save (Inventory Receipts, Financial Receipts, Yarn Cards, Style Cards, Sample Cards): the
//    tab's own Save button, as these screens have always had. The tab is only mounted while open
//    and those documents save through their own transactional services, so a combined save could
//    leave one half written.
//  - `saveWithDocument` (Work Orders, Purchase Orders, Subcontract Orders, Contracts): no button of
//    its own — the screen keeps the panel mounted and its normal Save calls the handle: validate()
//    BEFORE the document is written (so a missing Required value never leaves a half-saved
//    record), then save(id) right after, with the id of the document just created or updated.
//    Values typed before a new document's first Save are kept and stored with it.
// Either way the tab shows what is unsaved — edited values and Default Values that are pre-filled
// but not stored yet — and which required fields are still empty.

export interface CustomizedFieldsHandle {
  /** Required check before the document saves; highlights what is missing. False = do not save. */
  validate: () => boolean;
  /** Stores the values against the document's id. True when stored (or nothing to store). */
  save: (entityId: string) => Promise<boolean>;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const CustomizedFieldsPanel = forwardRef<CustomizedFieldsHandle, {
  entity: string;
  /** The record's id; null for a document not saved yet (`saveWithDocument` only). */
  entityId: string | null;
  readOnly?: boolean;
  className?: string;
  saveWithDocument?: boolean;
  /** `saveWithDocument` only: whether the user has changed anything since the values loaded. */
  onDirtyChange?: (dirty: boolean) => void;
}>(function CustomizedFieldsPanel({ entity, entityId, readOnly = false, className, saveWithDocument = false, onDirtyChange }, ref) {
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [stored, setStored] = useState<Record<string, any>>({});
  // What the form showed right after loading (stored values + pre-filled defaults) — the user's
  // own edits are measured against this, so a pre-filled default alone never marks the screen dirty.
  const [baseline, setBaseline] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  // Bumped by every load and save: a load that a later save (or load) has overtaken is dropped,
  // so a slow read can never put older values back over ones just stored.
  const opRef = useRef(0);

  const withDefaults = (defList: any[], storedMap: Record<string, any>) => {
    // A field's Default Value is shown for a record that has no stored value for it yet — and,
    // until saved, is flagged as not stored. A stored value always wins over the default.
    const valueMap: Record<string, any> = { ...storedMap };
    defList.forEach((f: any) => { if (!(f.id in storedMap) && f.defaultValue != null) valueMap[f.id] = f.defaultValue; });
    return valueMap;
  };

  /** `keep`: values the user typed that must survive the reload (see the effect below). */
  const load = async (keep?: Record<string, any>) => {
    const op = ++opRef.current;
    setLoading(true);
    try {
      const [defs, vals] = await Promise.all([
        entitiesApi.getCustomFields(entity),
        entityId ? entitiesApi.getCustomFieldValues(entity, entityId) : Promise.resolve([]),
      ]);
      if (op !== opRef.current) return;
      const defList = Array.isArray(defs) ? defs : [];
      const storedMap: Record<string, any> = {};
      (Array.isArray(vals) ? vals : []).forEach((v: any) => { storedMap[v.customFieldId] = v.value; });
      const valueMap = withDefaults(defList, storedMap);
      setFields(defList);
      setStored(storedMap);
      setValues({ ...valueMap, ...keep });
      setBaseline(valueMap);
      setShowMissing(false);
    } catch (e: any) {
      if (op === opRef.current) toast.error(e.message || "Failed to load custom fields");
    } finally {
      if (op === opRef.current) setLoading(false);
    }
  };

  // Reloads whenever the record changes. When a new document receives its id from its first Save
  // (null -> id), the values the user typed before that Save are carried over — save(id) is about
  // to store exactly those; only the user's own edits are kept, never a previous record's values.
  const prevEntityIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevEntityIdRef.current;
    prevEntityIdRef.current = entityId;
    let keep: Record<string, any> | undefined;
    if (saveWithDocument && prev === null && entityId) {
      keep = {};
      for (const f of fieldsRef.current) {
        if (!same(valuesRef.current[f.id], baselineRef.current[f.id])) keep[f.id] = valuesRef.current[f.id];
      }
    }
    load(keep);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [entity, entityId]);

  const setValue = (fieldId: string, v: any) => setValues((s) => ({ ...s, [fieldId]: v }));

  const missingOf = (vals: Record<string, any>) => fields.filter((f) => f.required && f.type !== "checkbox" && isBlank(vals[f.id]));
  const missing = useMemo(() => missingOf(values), [fields, values]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = fields.some((f) => !same(values[f.id], stored[f.id]));
  const edited = fields.some((f) => !same(values[f.id], baseline[f.id]));
  const pendingDefault = (f: any) => !(f.id in stored) && f.defaultValue != null && same(values[f.id], f.defaultValue);

  useEffect(() => { if (saveWithDocument) onDirtyChange?.(edited); }, [edited]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportMissing = (list: any[]) => {
    setShowMissing(true);
    toast.error(`Customized Fields: ${list.map((f) => `"${f.name}"`).join(", ")} ${list.length === 1 ? "is" : "are"} required.`);
  };

  const persist = async (targetId: string) => {
    ++opRef.current; // any load still in flight is older than this save
    setLoading(false);
    const current = valuesRef.current;
    const payload = fieldsRef.current.map((f) => ({ customFieldId: f.id, value: current[f.id] ?? null }));
    const saved: any = await entitiesApi.upsertCustomFieldValues(entity, targetId, payload);
    const storedMap: Record<string, any> = {};
    (Array.isArray(saved) ? saved : []).forEach((v: any) => { storedMap[v.customFieldId] = v.value; });
    setStored(storedMap);
    setValues((s) => ({ ...s, ...storedMap }));
    setBaseline({ ...current, ...storedMap });
    setShowMissing(false);
  };

  // Own Save mode.
  const save = async () => {
    if (!entityId) return;
    if (missing.length) { reportMissing(missing); return; }
    setSaving(true);
    try {
      await persist(entityId);
      toast.success("Custom fields saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save custom fields");
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({
    validate: () => {
      if (readOnly || loading) return true;
      const list = missingOf(valuesRef.current);
      if (list.length) { reportMissing(list); return false; }
      return true;
    },
    save: async (targetId: string) => {
      if (readOnly || !fieldsRef.current.length) return true;
      setSaving(true);
      try {
        await persist(targetId);
        return true;
      } catch (e: any) {
        setShowMissing(true);
        toast.error(`Customized Fields were not saved: ${e.message || "unknown error"}`);
        return false;
      } finally {
        setSaving(false);
      }
    },
  }), [readOnly, loading, fields, entity]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  <DatePicker className={cn("h-9 text-sm", showError && "border-destructive")} value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} />
                ) : f.type === "number" ? (
                  <Input type="number" className="h-9 text-sm" value={values[f.id] ?? ""} aria-invalid={showError || undefined}
                    onChange={(e) => { const n = e.target.value === "" ? null : Number(e.target.value); setValue(f.id, n === null || Number.isFinite(n) ? n : null); }} />
                ) : (
                  <Input type={f.type === "email" ? "email" : "text"} className="h-9 text-sm" value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} aria-invalid={showError || undefined} />
                )}
                {showError && <p className="text-xs text-destructive">Required.</p>}
                {!readOnly && pendingDefault(f) && (
                  <p className="text-[11px] text-muted-foreground">Default value — stored when you {saveWithDocument ? "save the document" : "click Save"}.</p>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>
      {!readOnly && !saveWithDocument && (
        <div className="flex items-center justify-end gap-3 pt-2">
          {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes — saved separately from the document.</span>}
          <Button size="sm" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saving..." : "Save"}</Button>
        </div>
      )}
      {!readOnly && saveWithDocument && dirty && (
        <p className="pt-1 text-right text-xs text-amber-700 dark:text-amber-400">Unsaved changes — stored when you save the document.</p>
      )}
    </div>
  );
});
