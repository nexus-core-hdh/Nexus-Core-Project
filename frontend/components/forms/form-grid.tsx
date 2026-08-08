import * as React from "react";

import { cn } from "@/lib/utils";

// The Mandatory Form Grid Standard: every master screen's form lays its fields
// on exactly THREE equal-width columns on desktop — never two, never four,
// never a proportional/fractional split. One column on mobile (the only
// concession, since three columns cannot fit a phone screen). No screen picks
// its own column count; this is the single definition every screen inherits.
export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-3", className)}>
      {children}
    </div>
  );
}
