import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import type { DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";

export interface EditableGridInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string | number;
  onChange: (value: string) => void;
  align?: "left" | "right";
  /** Opt-in: rounds the committed value to the configured Decimal Parameters precision (Settings
   *  -> Screen Parameters -> Decimal) on blur, e.g. decimalKey="quantity". Omitted by every
   *  existing caller today, so behavior is unchanged unless a grid explicitly adopts it — see
   *  hooks/use-decimal-parameters.ts. Fetches Decimal Parameters lazily, only when a caller
   *  actually passes this prop, never for the many callers that don't. */
  decimalKey?: DecimalFieldKey;
}

// The single control every editable DataGrid cell in the app should render through
// (trim lines, style-card BOM grids, costing-sheet grids, ...) so borders, background,
// focus ring, hover and disabled styling always come from the same place as every other
// form input (components/ui/input.tsx) instead of each grid inventing its own CSS.
export function EditableGridInput({ value, onChange, align = "left", type = "text", className, decimalKey, onBlur, ...props }: EditableGridInputProps) {
  const { ensureLoaded, round } = useDecimalParameters();

  React.useEffect(() => {
    if (decimalKey) ensureLoaded();
  }, [decimalKey, ensureLoaded]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (decimalKey && value !== "" && value !== null && value !== undefined) {
      onChange(String(round(value, decimalKey)));
    }
    onBlur?.(e);
  };

  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={handleBlur}
      className={cn(align === "right" && "text-right font-mono", className)}
      {...props}
    />
  );
}
