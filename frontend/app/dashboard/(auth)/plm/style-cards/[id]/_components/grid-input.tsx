"use client";

import { EditableGridInput } from "@/components/ui/editable-grid-input";
import type { DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v));
export const fmt2 = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Thin re-export so every call site in this grid keeps using `GridInput` — the actual
// styling (border, background, focus ring, disabled state) all comes from the shared
// EditableGridInput/Input components, not from a local copy of the CSS.
export function GridInput({
  value,
  onChange,
  align = "left",
  type = "text",
  decimalKey,
}: {
  value: string | number;
  onChange: (v: string) => void;
  align?: "left" | "right";
  type?: string;
  /** Opt-in Decimal Parameters rounding (Settings -> Screen Parameters -> Decimal) — forwarded
   *  straight through to EditableGridInput. Omitted by every existing caller today, so behavior
   *  is unchanged unless a cell explicitly adopts it. */
  decimalKey?: DecimalFieldKey;
}) {
  return <EditableGridInput value={value} onChange={onChange} align={align} type={type} decimalKey={decimalKey} />;
}

export function GridCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-center h-7">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
    </div>
  );
}
