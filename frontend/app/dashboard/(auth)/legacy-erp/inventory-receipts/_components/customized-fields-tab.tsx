"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { toast } from "sonner";
import { Save, ListPlus } from "lucide-react";
import { entitiesApi } from "@/lib/nexuscore-api";

// Reuses the existing generic custom-fields engine — same infrastructure Yarn Card/Style
// Card already use, just scoped to entity = "InventoryReceipt". No new backend module.
const ENTITY = "InventoryReceipt";

export function CustomizedFieldsTab({ itemId, readOnly = false }: { itemId: string; readOnly?: boolean }) {
  const [fields, setFields] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [defs, vals] = await Promise.all([
        entitiesApi.getCustomFields(ENTITY),
        entitiesApi.getCustomFieldValues(ENTITY, itemId),
      ]);
      const defList = Array.isArray(defs) ? defs : [];
      setFields(defList);
      const valMap: Record<string, any> = {};
      (Array.isArray(vals) ? vals : []).forEach((v: any) => { valMap[v.customFieldId] = v.value; });
      setValues(valMap);
    } catch (e: any) {
      toast.error(e.message || "Failed to load custom fields");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [itemId]);

  const setValue = (fieldId: string, v: any) => setValues((s) => ({ ...s, [fieldId]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = fields.map((f) => ({ customFieldId: f.id, value: values[f.id] ?? null }));
      await entitiesApi.upsertCustomFieldValues(ENTITY, itemId, payload);
      toast.success("Custom fields saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save custom fields");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

  if (!fields.length) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ListPlus /></EmptyMedia>
            <EmptyTitle className="text-sm">No customized fields configured</EmptyTitle>
            <EmptyDescription>Define fields in Custom Fields admin with entity &quot;{ENTITY}&quot;.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <fieldset disabled={readOnly} className="rounded-xl border bg-muted/20 p-4 max-w-2xl space-y-3">
      {fields.map((f) => (
        <div key={f.id} className="grid grid-cols-3 items-start gap-3">
          <Label className="text-sm text-muted-foreground pt-1.5">{f.name}{f.required ? " *" : ""}</Label>
          <div className="col-span-2">
            {f.type === "textarea" ? (
              <Textarea rows={3} value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} />
            ) : f.type === "select" ? (
              <Select value={values[f.id] || ""} onValueChange={(v) => setValue(f.id, v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(Array.isArray(f.options) ? f.options : []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            ) : f.type === "checkbox" ? (
              <input type="checkbox" checked={!!values[f.id]} onChange={(e) => setValue(f.id, e.target.checked)} className="h-4 w-4" />
            ) : f.type === "date" ? (
              <Input type="date" className="h-9 text-sm" value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} />
            ) : f.type === "number" ? (
              <Input type="number" className="h-9 text-sm" value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value === "" ? null : parseFloat(e.target.value))} />
            ) : (
              <Input type={f.type === "email" ? "email" : "text"} className="h-9 text-sm" value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} />
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
        </div>
      )}
    </fieldset>
  );
}
