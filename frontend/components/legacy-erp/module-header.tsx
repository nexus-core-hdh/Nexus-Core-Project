"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared header block for every Inventory (and other Legacy ERP) screen — the icon chip +
// title + subtitle/badges row that inventory-cards-list, fabric/yarn/trim-cards(-list),
// warehouses, warehouse-parameters and item-statement each used to hand-roll as an identical
// (or near-identical) inline block. Purely presentational: takes the same title/subtitle/badge
// content every screen already computed itself and renders the one shared layout, so visual
// consistency across the module comes from one place instead of N copies drifting apart.
// `actions` (search box, buttons, tabs, ...) stays screen-owned — this component only unifies
// the left-hand identity block and the row's spacing/alignment.
const SIZES = {
  sm: { chip: "h-9 w-9", icon: "h-4 w-4", title: "text-[15px]", gap: "gap-3" },
  md: { chip: "h-11 w-11", icon: "h-5 w-5", title: "text-[22px]", gap: "gap-4" },
  lg: { chip: "h-12 w-12", icon: "h-6 w-6", title: "text-2xl", gap: "gap-4" },
} as const;

export function ModuleHeader({
  icon: Icon,
  title,
  subtitle,
  badges,
  actions,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small inline badges/status next to the subtitle (record count, View Only, ...). */
  badges?: React.ReactNode;
  /** Right-aligned toolbar — search box, buttons, tabs. Screen-owned, unchanged. */
  actions?: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div className={cn("flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className={cn("flex min-w-0 items-center", s.gap)}>
        <div className={cn(s.chip, "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10")}>
          <Icon className={cn(s.icon, "text-primary")} />
        </div>
        <div className="min-w-0">
          <h1 className={cn(s.title, "truncate font-semibold leading-tight tracking-tight")}>{title}</h1>
          {(subtitle || badges) && (
            <div className="mt-0.5 flex items-center gap-2">
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
              {badges}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
