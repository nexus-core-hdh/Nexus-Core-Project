import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import type { DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";
import { normalizeNonNegative, stripNegativeInput } from "@/lib/numeric-guards";

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
  /** Opt-in: blocks negative values for normal business quantity/value cells (Qty, Consumption,
   *  Weight, Length/Width, Percentage, ordinary Price/Amount, ...) — see lib/numeric-guards.ts.
   *  Strips "-" as it's typed/pasted (so a negative number can never actually be entered) and,
   *  as a belt-and-braces net for values set programmatically (e.g. a decrement button, or a
   *  calculated update), floors any still-negative value back to 0 on blur. Omitted by every
   *  existing caller today (no behavior change) — a grid opts in per-cell for exactly the columns
   *  that are genuinely non-negative, leaving legitimately signed cells (credit/reversal amounts)
   *  completely untouched. */
  nonNegative?: boolean;
}

// The single control every editable DataGrid cell in the app should render through
// (trim lines, style-card BOM grids, costing-sheet grids, ...) so borders, background,
// focus ring, hover and disabled styling always come from the same place as every other
// form input (components/ui/input.tsx) instead of each grid inventing its own CSS.
export function EditableGridInput({ value, onChange, align = "left", type = "text", className, decimalKey, nonNegative, onBlur, ...props }: EditableGridInputProps) {
  const { ensureLoaded, round } = useDecimalParameters();

  React.useEffect(() => {
    if (decimalKey) ensureLoaded();
  }, [decimalKey, ensureLoaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(nonNegative ? stripNegativeInput(e.target.value) : e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let committed = value;
    if (nonNegative && committed !== "" && committed !== null && committed !== undefined) {
      committed = String(normalizeNonNegative(committed));
      if (committed !== String(value)) onChange(committed);
    }
    if (decimalKey && committed !== "" && committed !== null && committed !== undefined) {
      onChange(String(round(committed, decimalKey)));
    }
    onBlur?.(e);
  };

  return (
    <Input
      type={type}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(align === "right" && "text-right font-mono", className)}
      {...props}
      min={nonNegative ? 0 : props.min}
    />
  );
}
