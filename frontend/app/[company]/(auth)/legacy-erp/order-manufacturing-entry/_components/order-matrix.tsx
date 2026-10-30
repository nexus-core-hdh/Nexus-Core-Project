"use client";

// Order Manufacturing Entry's Order matrix (one row per Production Color). Sent, each Quality Type
// (A Quality, B Quality, ...), Received, Return and Balance can be shown / hidden / reordered with
// the shared Manage Columns (useGridColumns + ManageColumnsModal, storageKey "omEntryGrid", same
// session / permanent persistence as every other ERP grid). The BOM material columns, Order,
// Will be Cut and Cutting always stay, first. Values come straight from the read model — hiding a
// column never changes a total.
//
// Mounted only once the screen's context has loaded, so the Quality Type columns (a global master)
// are declared before useGridColumns restores the saved layout.

import { useMemo } from "react";
import { ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { useGridColumns, type GridColumnDef } from "@/hooks/use-grid-columns";
import { cn } from "@/lib/utils";
import { textOn, type MaterialColumn, type QualityType, type ReadRow } from "./size-summary";

export type OmColumnKey = "sent" | `quality:${number}` | "received" | "returned" | "balance";

/** The Manage Columns columns, in the grid's existing order: Sent, each Quality Type, Received, Return, Balance. */
export function omManagedColumns(qualityColumns: QualityType[]): GridColumnDef<OmColumnKey>[] {
  const col = (key: OmColumnKey, label: string) => ({ key, label, defaultWidth: 84, minWidth: 84 });
  return [
    col("sent", "Sent"),
    ...qualityColumns.map((q) => col(`quality:${q.id}`, q.name || q.code || `Quality ${q.id}`)),
    col("received", "Received"),
    col("returned", "Return"),
    col("balance", "Balance"),
  ];
}

const th = "sticky top-0 z-10 border border-border/70 bg-slate-700 dark:bg-slate-800 px-1.5 h-8 text-[10.5px] font-semibold text-white whitespace-nowrap text-left align-bottom";
const tdNum = "border border-border/50 px-1.5 h-[22px] text-right font-mono text-[11px] whitespace-nowrap";

export function OrderMatrix({ materialColumns, qualityColumns, rows, selectedColor, onSelectColor, fmt }: {
  materialColumns: MaterialColumn[];
  qualityColumns: QualityType[];
  rows: ReadRow[];
  selectedColor: string | null;
  onSelectColor: (color: string) => void;
  fmt: (n: number) => string;
}) {
  // Re-derived only when the Quality Types themselves change (each reload returns new objects).
  const qualityKey = qualityColumns.map((q) => `${q.id}:${q.code}:${q.name}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => omManagedColumns(qualityColumns), [qualityKey]);
  const grid = useGridColumns<OmColumnKey>({ storageKey: "omEntryGrid", columns });
  const qualityByKey = useMemo(() => new Map(qualityColumns.map((q) => [`quality:${q.id}`, q])), [qualityColumns]);
  const blank = (v: number) => (v ? fmt(v) : "");

  const header = (key: OmColumnKey, label: string) => {
    const q = qualityByKey.get(key);
    return <th key={key} data-col={key} className={cn(th, "min-w-[84px] text-right")} title={q ? q.code || undefined : undefined}>{q ? q.name || q.code : label}</th>;
  };
  const cell = (key: OmColumnKey, r: ReadRow) => {
    if (key.startsWith("quality:")) return <td key={key} data-col={key} className={tdNum}>{blank(r.byQuality[key.slice("quality:".length)] || 0)}</td>;
    if (key === "sent") return <td key={key} data-col={key} className={tdNum}>{blank(r.totals.sent)}</td>;
    if (key === "received") return <td key={key} data-col={key} className={tdNum}>{blank(r.totals.received)}</td>;
    if (key === "returned") return <td key={key} data-col={key} className={tdNum}>{blank(r.totals.returned)}</td>;
    return <td key={key} data-col={key} className={cn(tdNum, "font-semibold")}>{blank(r.totals.balance)}</td>;
  };

  return (
    <>
      <div className="flex shrink-0 justify-end border-b border-border/70 px-1 py-0.5">
        <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={grid.manageColumns.openModal}>
          <ListOrdered className="h-3 w-3 mr-1" />Manage Columns
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-max border-collapse">
          <thead>
            <tr className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0">
              <th className={cn(th, "left-0 z-20 w-3 min-w-3 px-0")} />
              {materialColumns.map((m, i) => (
                <th key={m.key} className={cn(th, "min-w-[112px] max-w-[132px] whitespace-normal leading-tight", i === 0 && "sticky left-3 z-20")} title={`${m.lineType} — ${m.label}`}>{m.label}</th>
              ))}
              <th className={cn(th, "min-w-[84px] text-right")}>Order</th>
              <th className={cn(th, "min-w-[84px] text-right")}>Will be Cut</th>
              <th className={cn(th, "min-w-[84px] text-right")}>Cutting</th>
              {grid.displayColumnDefs.map((c) => header(c.key, c.label))}
            </tr>
          </thead>
          <tbody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {rows.map((r) => {
              const sel = r.color === selectedColor;
              return (
                <tr key={r.color} className={cn("cursor-pointer", sel ? "bg-primary text-primary-foreground" : "odd:bg-background even:bg-muted/25 hover:bg-accent/50")} onClick={() => onSelectColor(r.color)}>
                  <td className={cn("sticky left-0 z-10 w-3 border border-border/50 p-0", sel ? "bg-primary" : "bg-muted")} title={r.color} />
                  {materialColumns.map((m, i) => {
                    const c = r.cells[m.key];
                    const label = c?.code || c?.name || "";
                    return (
                      <td
                        key={m.key} title={c?.name || c?.code || r.color}
                        className={cn("max-w-[132px] truncate border border-border/50 px-1.5 h-[22px] whitespace-nowrap", i === 0 && "sticky left-3 z-10", !c?.hex && i === 0 && (sel ? "bg-primary" : "bg-background"))}
                        style={c?.hex ? { backgroundColor: c.hex, color: textOn(c.hex) } : undefined}
                      >{label}</td>
                    );
                  })}
                  <td className={cn(tdNum, "font-semibold")}>{fmt(r.totals.order)}</td>
                  <td className={tdNum}>{blank(r.totals.willBeCut)}</td>
                  <td className={tdNum}>{blank(r.totals.cutting)}</td>
                  {grid.displayColumnDefs.map((c) => cell(c.key, r))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ManageColumnsModal
        state={grid.manageColumns}
        fixedColumns={[]}
        columns={columns}
        description="Show, hide and reorder Sent, the Quality columns, Received, Return and Balance. The material columns, Order, Will be Cut and Cutting always stay first."
      />
    </>
  );
}
