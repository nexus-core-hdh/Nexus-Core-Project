import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface EditableGridInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string | number;
  onChange: (value: string) => void;
  align?: "left" | "right";
}

// The single control every editable DataGrid cell in the app should render through
// (trim lines, style-card BOM grids, costing-sheet grids, ...) so borders, background,
// focus ring, hover and disabled styling always come from the same place as every other
// form input (components/ui/input.tsx) instead of each grid inventing its own CSS.
export function EditableGridInput({ value, onChange, align = "left", type = "text", className, ...props }: EditableGridInputProps) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(align === "right" && "text-right font-mono", className)}
      {...props}
    />
  );
}
