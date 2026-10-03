"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface PreviewField {
  id: string;
  name: string;
  type: string;
  required: boolean;
  options: string[] | null;
  defaultValue: unknown;
}

// Renders fields exactly as the screens' "Customized Fields" tabs do (same layout, controls and
// value handling per runtime type — see e.g. inventory-receipts/_components/customized-fields-tab
// .tsx), starting from each field's Default Value the way those tabs now do for a record without
// a saved value. Interactive, so an administrator can try the control; nothing is saved.
export function CustomFieldFormPreview({ fields }: { fields: PreviewField[] }) {
  const [values, setValues] = useState<Record<string, any>>({});
  useEffect(() => {
    setValues(Object.fromEntries(fields.filter((f) => f.defaultValue != null).map((f) => [f.id, f.defaultValue])));
  }, [fields]);
  const setValue = (id: string, v: any) => setValues((s) => ({ ...s, [id]: v }));

  return (
    <div className="max-w-2xl space-y-3 rounded-xl border bg-muted/20 p-4">
      {fields.map((f) => {
        const missing = f.required && f.type !== "checkbox" && (values[f.id] === undefined || values[f.id] === null || String(values[f.id]).trim() === "");
        return (
          <div key={f.id} className="grid grid-cols-3 items-start gap-3">
            <Label className="pt-1.5 text-sm text-muted-foreground">{f.name}{f.required ? " *" : ""}</Label>
            <div className="col-span-2 space-y-1">
              {f.type === "textarea" ? (
                <Textarea rows={3} value={values[f.id] || ""} onChange={(e) => setValue(f.id, e.target.value)} />
              ) : f.type === "select" ? (
                <Select value={values[f.id] || ""} onValueChange={(v) => setValue(f.id, v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(Array.isArray(f.options) ? f.options : []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
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
              {missing && <p className="text-xs text-destructive">Required — the record cannot be saved without a value.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
