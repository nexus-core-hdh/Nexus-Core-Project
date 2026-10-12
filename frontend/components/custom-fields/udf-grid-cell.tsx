"use client";

import { cn } from "@/lib/utils";
import type { GridUdfField } from "@/hooks/use-grid-udf";

// One grid cell of a User Defined Field column (hooks/use-grid-udf.ts) — the same control types
// the screens' Customized Fields tabs render, sized for a grid row. At rest it reads as plain text
// (transparent, borderless); focus shows the editor. Value shapes match the server's validation
// exactly: text/textarea/email/date/select as strings, number as a number, checkbox as a boolean,
// blank as null.

const display = (field: GridUdfField, value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "checkbox") return value ? "Yes" : "No";
  return String(value);
};

export function UdfGridCell({ field, value, onChange, readOnly = false, invalid = false, unsavedRow = false, className }: {
  field: GridUdfField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  /** Required and still blank after a failed Save. */
  invalid?: boolean;
  /** The row has no saved id yet — its UDF values can only be entered once the row is saved. */
  unsavedRow?: boolean;
  className?: string;
}) {
  const base = cn(
    "h-full w-full min-w-0 bg-transparent px-2 text-[12px] outline-none focus:bg-accent/50 disabled:cursor-not-allowed",
    invalid && "bg-destructive/10 ring-1 ring-inset ring-destructive",
    className,
  );
  if (unsavedRow) {
    return <div className="flex h-full items-center px-2 text-[11px] italic text-muted-foreground" title="Save the document first — values are stored on saved lines">—</div>;
  }
  if (readOnly) {
    return <div className="flex h-full items-center truncate px-2 text-[12px]" title={display(field, value)}>{display(field, value)}</div>;
  }
  const label = field.name;
  switch (field.type) {
    case "checkbox":
      return (
        <div className="flex h-full items-center justify-center">
          <input type="checkbox" aria-label={label} checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
        </div>
      );
    case "select":
      return (
        <select aria-label={label} aria-invalid={invalid || undefined} className={base} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="" />
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          {/* A stored option deactivated since stays visible (and is accepted unchanged by the server). */}
          {typeof value === "string" && value && !(field.options ?? []).includes(value) && <option value={value}>{value}</option>}
        </select>
      );
    case "number":
      return (
        <input type="number" aria-label={label} aria-invalid={invalid || undefined} className={cn(base, "text-right font-mono")}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => { const n = e.target.value === "" ? null : Number(e.target.value); onChange(n === null || Number.isFinite(n) ? n : null); }} />
      );
    case "date":
      return <input type="date" aria-label={label} aria-invalid={invalid || undefined} className={base} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} />;
    default:
      return (
        <input type={field.type === "email" ? "email" : "text"} aria-label={label} aria-invalid={invalid || undefined} className={base}
          value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      );
  }
}
