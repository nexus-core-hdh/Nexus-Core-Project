"use client";

import { EditableGridInput } from "@/components/ui/editable-grid-input";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v));

// Thin re-export so every call site in this grid keeps using `GridInput` — the actual
// styling (border, background, focus ring, disabled state) all comes from the shared
// EditableGridInput/Input components, not from a local copy of the CSS.
export function GridInput({
  value,
  onChange,
  align = "left",
  type = "text",
}: {
  value: string | number;
  onChange: (v: string) => void;
  align?: "left" | "right";
  type?: string;
}) {
  return <EditableGridInput value={value} onChange={onChange} align={align} type={type} />;
}
