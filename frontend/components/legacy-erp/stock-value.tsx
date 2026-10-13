"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import type { WorklistTableColumn } from "@/components/legacy-erp/worklist-table";

// Stock In Hand / Stock Value for Yarn, Fabric and Trim cards (and the combined Inventory Card list).
// The server computes it (nexuscore-backend inventory-card.service.ts loadStockValuations): Stock In
// Hand in the item's Base Unit × the UnitPrice of the item's latest priced stock-IN receipt line,
// expressed per Base Unit. Rows/records carry:
//   stockOnHand, stockUnit, stockUnitPrice (per Base Unit), stockValue (null = stock but no priced
//   receipt), stockPriceReceiptNo, stockPriceReceiptDate.
// Numbers are shown with the Decimal Parameters' Quantity / Unit Price / Amount precision.

export interface StockValueFields {
  stockOnHand?: number | null;
  stockUnit?: string | null;
  stockUnitPrice?: number | null;
  stockValue?: number | null;
  stockPriceReceiptNo?: string | null;
  stockPriceReceiptDate?: string | null;
}

const muted = <span className="text-muted-foreground">—</span>;

export function priceSourceText(r: StockValueFields, formatPrice: (v: unknown) => string) {
  if (r.stockUnitPrice == null) return "No priced receipt for this item yet";
  const per = r.stockUnit ? ` per ${r.stockUnit}` : "";
  const from = r.stockPriceReceiptNo ? ` — receipt ${r.stockPriceReceiptNo}${r.stockPriceReceiptDate ? ` (${r.stockPriceReceiptDate})` : ""}` : "";
  return `Price ${formatPrice(r.stockUnitPrice)}${per}${from}`;
}

/**
 * The standard stock columns of an inventory card list, in order: Stock In Hand (quantity only),
 * Unit (the item's Base Unit name — the unit Stock In Hand is expressed in), Stock Value.
 */
export function useStockValueColumns(): WorklistTableColumn<StockValueFields & Record<string, any>>[] {
  const { format, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  return useMemo(() => [
    {
      key: "stockOnHand", label: "Stock In Hand", align: "right", defaultWidth: 130,
      render: (row) => row.stockOnHand == null ? muted : <span className="tabular-nums">{format(row.stockOnHand, "quantity")}</span>,
    },
    {
      key: "stockUnit", label: "Unit", defaultWidth: 100,
      render: (row) => row.stockUnit || muted,
    },
    {
      key: "stockValue", label: "Stock Value", align: "right", defaultWidth: 150,
      render: (row) => (
        <span className="tabular-nums" title={priceSourceText(row, (v) => format(v, "unit-price"))}>
          {row.stockValue == null ? muted : format(row.stockValue, "amount")}
        </span>
      ),
    },
  ], [format]);
}

/**
 * Read-only Stock In Hand / Stock Value strip for an individual card screen. Loads its own figures
 * (the card's get() includes them) so a save — whose response carries only the card's own fields —
 * never blanks it; reloads whenever `reloadKey` changes.
 */
export function StockValueSummary({ id, load, reloadKey }: { id: number | null | undefined; load: (id: number) => Promise<any>; reloadKey?: unknown }) {
  const { format, ensureLoaded } = useDecimalParameters();
  const [data, setData] = useState<StockValueFields | null>(null);
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  useEffect(() => {
    if (!id) { setData(null); return; }
    let cancelled = false;
    load(id).then((r) => { if (!cancelled) setData(r ?? null); }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);
  if (!id || !data) return null;

  const cell = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums" title={hint}>{value}</p>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border bg-muted/20 px-4 py-3" aria-label="Stock value">
      <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
      {cell("Stock In Hand", data.stockOnHand == null ? "—" : format(data.stockOnHand, "quantity"))}
      {cell("Unit", data.stockUnit || "—")}
      {cell("Unit Price", data.stockUnitPrice == null ? "—" : `${format(data.stockUnitPrice, "unit-price")}${data.stockUnit ? ` / ${data.stockUnit}` : ""}`, priceSourceText(data, (v) => format(v, "unit-price")))}
      {cell("Stock Value", data.stockValue == null ? "—" : format(data.stockValue, "amount"), priceSourceText(data, (v) => format(v, "unit-price")))}
      <p className="text-[11px] text-muted-foreground">{priceSourceText(data, (v) => format(v, "unit-price"))}</p>
    </div>
  );
}
