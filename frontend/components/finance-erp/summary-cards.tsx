import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/finance-erp/utils/format";

export interface SummaryCardItem {
  label: string;
  value: number | string;
  isCurrency?: boolean;
  icon?: LucideIcon;
  tone?: "default" | "success" | "danger" | "warning";
  hint?: string;
}

const TONE_CLASS: Record<string, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-rose-600 dark:text-rose-400",
  warning: "text-orange-600 dark:text-orange-400",
};

const TONE_ICON_WRAP: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  warning: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

/** Row of KPI / financial summary cards — used on the Dashboard and every ledger/report header
 *  (Opening/Total Debit/Total Credit/Closing, Aging summary, PO totals, etc). */
export function SummaryCards({ items, className }: { items: SummaryCardItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((item, i) => {
        const Icon = item.icon;
        const tone = item.tone ?? "default";
        return (
          <div key={i} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{item.label}</div>
                <div className={cn("mt-1.5 truncate text-xl font-bold", TONE_CLASS[tone])}>
                  {item.isCurrency === false ? item.value : typeof item.value === "number" ? formatAmount(item.value) : item.value}
                </div>
                {item.hint && <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>}
              </div>
              {Icon && (
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE_ICON_WRAP[tone])}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
