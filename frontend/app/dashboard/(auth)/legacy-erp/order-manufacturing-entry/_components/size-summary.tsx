"use client";

// Lower "Order / Will Be Cut / Cutting / Sent / Received / Return / Balance" size matrix — the same
// block on the main Order Manufacturing Entry screen and at the bottom of the Manufacturing
// IN/OUT/Repair child screen. Purely presentational: every number comes from the backend read model
// (order-manufacturing.service.ts's buildReadModel) — nothing here is calculated from UI state.

import { Fragment } from "react";
import { cn } from "@/lib/utils";

export interface QtyCell {
  order: number; willBeCut: number; cutting: number; sent: number; received: number; returned: number; balance: number;
}
export interface MaterialCell { code: string | null; name: string | null; hex: string | null }
export interface ReadRow {
  color: string;
  cells: Record<string, MaterialCell>;
  bySize: Record<string, QtyCell>;
  totals: QtyCell;
  byQuality: Record<string, number>;
}
export interface GrandTotal { bySize: Record<string, QtyCell>; totals: QtyCell; byQuality: Record<string, number> }
export interface MaterialColumn { key: string; lineType: string; label: string; mainFabric: boolean }
export interface QualityType { id: number; code: string | null; name: string | null }

const LINES: { key: keyof QtyCell; label: string; tone: string }[] = [
  { key: "order", label: "Order", tone: "bg-yellow-50 dark:bg-yellow-500/10" },
  { key: "willBeCut", label: "Will be Cut", tone: "bg-indigo-50 dark:bg-indigo-500/10" },
  { key: "cutting", label: "Cutting", tone: "bg-pink-50 dark:bg-pink-500/10" },
  { key: "sent", label: "Sent", tone: "bg-rose-100 dark:bg-rose-500/20" },
  { key: "received", label: "Received", tone: "bg-rose-100 dark:bg-rose-500/20" },
  { key: "returned", label: "Return", tone: "bg-rose-100 dark:bg-rose-500/20" },
  { key: "balance", label: "Balance", tone: "bg-orange-200 dark:bg-orange-500/25" },
];

export function SizeSummary({
  sizes, row, grand, fmt,
}: {
  sizes: string[]; row: ReadRow | null; grand: GrandTotal | null; fmt: (n: number) => string;
}) {
  const th = "border border-border/70 bg-muted/60 px-1.5 h-6 text-[10.5px] font-semibold text-muted-foreground whitespace-nowrap";
  const td = "border border-border/50 px-1.5 h-[22px] text-right font-mono text-[11px] whitespace-nowrap";
  const label = "border border-border/50 px-2 h-[22px] text-[11px] whitespace-nowrap";
  const block = (bySize: Record<string, QtyCell>, totals: QtyCell, keyPrefix: string) =>
    LINES.map((l) => (
      <tr key={`${keyPrefix}-${l.key}`} className={l.tone}>
        <td className={label}>{l.label}</td>
        {sizes.map((s) => {
          const v = bySize[s]?.[l.key] || 0;
          return <td key={s} className={td}>{v ? fmt(v) : ""}</td>;
        })}
        <td className={cn(td, "font-semibold")}>{totals[l.key] ? fmt(totals[l.key]) : ""}</td>
      </tr>
    ));
  return (
    <div className="overflow-auto rounded-sm border border-border/70">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className={cn(th, "min-w-[150px] text-left")} />
            {sizes.map((s) => <th key={s} className={cn(th, "min-w-[68px] text-right")}>{s}</th>)}
            <th className={cn(th, "min-w-[80px] text-right")}>Total</th>
          </tr>
        </thead>
        <tbody>
          {row ? block(row.bySize, row.totals, "sel") : (
            <tr><td className={cn(label, "text-muted-foreground")} colSpan={sizes.length + 2}>Select a row to see its size summary.</td></tr>
          )}
          {grand && (
            <Fragment>
              <tr><td className={cn(label, "bg-muted/50 text-center font-semibold")} colSpan={sizes.length + 2}>** Grand Total **</td></tr>
              {block(grand.bySize, grand.totals, "grand")}
            </Fragment>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Black/white text for a swatch background — display only.
export function textOn(hex: string | null): string | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

// Cross-tab "the data changed" signal: the child Manufacturing screens dispatch it after a
// successful Save/Delete, the (still mounted) main screen listens and re-reads from the DB.
export const OM_CHANGED_EVENT = "order-manufacturing:changed";
export const OM_ROUTE = "/dashboard/legacy-erp/order-manufacturing-entry";
