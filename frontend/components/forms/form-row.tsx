import * as React from "react";

import { cn } from "@/lib/utils";

// The compact "label-left" row used by dense data-entry screens (costing sheets,
// cost detail entry) — as opposed to FormField's "label-above" card layout used
// by master screens like Current Account. Both guarantee the same principle:
// the label never changes a control's position. Here that's inherent to the
// layout itself (label and control sit side-by-side in one flex row, so one
// row's label can never push a *different* row's control down) — this
// component only needs to add a fixed minimum height and single-line
// truncation so neighbouring rows share a consistent rhythm instead of one
// row growing taller than the rest because its own label happened to wrap.
export function FormRow({
  label, children, labelWidth = "w-40", className,
}: { label: string; children: React.ReactNode; labelWidth?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-8 items-center gap-3 border-b border-dashed py-1 last:border-0", className)}>
      <div className={cn(labelWidth, "shrink-0 truncate text-xs text-muted-foreground")} title={label}>
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}
