import * as React from "react";

import { FormGrid } from "./form-grid";

// Every major group of fields on a master screen renders as its own bordered,
// soft-background "section card" with a titled header — enterprise object-page
// composition instead of a flat field grid with inline dividers. Shared across
// every master screen so no screen defines its own copy of this wrapper.
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">{title}</h3>
      </div>
      <FormGrid>{children}</FormGrid>
    </div>
  );
}
