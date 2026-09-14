"use client";

// Cutting Card — MAIN screen. A proper, independently-searchable workspace screen (not reachable
// only via a button from inside a specific Work Order): search any Work Order, see its REAL
// Production Colors and per-size Order/Will-Be-Cut quantities (from Manufacturing Quantities —
// never invented), select one Color, then Cutting opens the Cutting Entry screen
// (./entry/page.tsx) scoped to that exact Work Order + Color. Also still reachable the existing
// way too — the "Cutting" button on Work Order → C/S Details (work-orders/page.tsx's own
// ManufacturingQuantitiesGrid) still deep-links straight into ./entry for its own row's Color,
// which is a different, already-in-context entry point into the same Entry screen; nothing here
// changes that.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { cn } from "@/lib/utils";

interface ColorMatrixRow {
  color: string;
  bySize: Record<string, { orderQty: number; willBeCutQty: number }>;
  total: { orderQty: number; willBeCutQty: number };
}

interface ColorMatrix {
  workOrderId: number;
  sizes: string[];
  extraCuttingPercent: number;
  colors: ColorMatrixRow[];
}

export default function CuttingCardPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const initialId = searchParams.get("id");

  const [workOrderId, setWorkOrderId] = useState<number | null>(initialId ? Number(initialId) : null);
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [customerLabel, setCustomerLabel] = useState<string>("");
  const [styleCard, setStyleCard] = useState<any>(null);
  const [matrix, setMatrix] = useState<ColorMatrix | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [colorCutBySize, setColorCutBySize] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadingCutTotals, setLoadingCutTotals] = useState(false);

  const loadWorkOrder = async (id: number) => {
    setLoading(true);
    setSelectedColor(null);
    setColorCutBySize({});
    try {
      const [wo, m]: any[] = await Promise.all([
        legacyErpApi.workOrders.get(id),
        legacyErpApi.workOrders.cuttingCard.getMatrix(id),
      ]);
      setWorkOrder(wo);
      setWorkOrderId(id);
      setMatrix(m as ColorMatrix);
      setCustomerLabel("");
      if (wo?.styleCardId) {
        plmApi.styleCards.get(wo.styleCardId).then(setStyleCard).catch(() => setStyleCard(null));
      } else {
        setStyleCard(null);
      }
      if (wo?.currentAccountId) {
        legacyErpApi.accounts.get(wo.currentAccountId)
          .then((acc: any) => setCustomerLabel(acc ? `${acc.code} — ${acc.name}` : ""))
          .catch(() => setCustomerLabel(""));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load Work Order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialId) loadWorkOrder(Number(initialId)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (!workOrderId || !selectedColor) { setColorCutBySize({}); return; }
    let cancelled = false;
    setLoadingCutTotals(true);
    legacyErpApi.workOrders.cuttingCard.getColorTotals(workOrderId, selectedColor)
      .then((r: any) => { if (!cancelled) setColorCutBySize(r || {}); })
      .catch(() => { if (!cancelled) setColorCutBySize({}); })
      .finally(() => { if (!cancelled) setLoadingCutTotals(false); });
    return () => { cancelled = true; };
  }, [workOrderId, selectedColor]);

  const selectedRow = useMemo(() => matrix?.colors.find((c) => c.color === selectedColor) || null, [matrix, selectedColor]);

  const selectedSummary = useMemo(() => {
    if (!matrix || !selectedRow) return null;
    const rows = matrix.sizes.map((sizeCode) => {
      const { orderQty, willBeCutQty } = selectedRow.bySize[sizeCode] || { orderQty: 0, willBeCutQty: 0 };
      const cutQty = colorCutBySize[sizeCode] || 0;
      return { sizeCode, orderQty, willBeCutQty, cutQty, less: Math.max(willBeCutQty - cutQty, 0), over: Math.max(cutQty - willBeCutQty, 0) };
    });
    const totals = rows.reduce(
      (acc, r) => ({
        orderQty: acc.orderQty + r.orderQty, willBeCutQty: acc.willBeCutQty + r.willBeCutQty,
        cutQty: acc.cutQty + r.cutQty, less: acc.less + r.less, over: acc.over + r.over,
      }),
      { orderQty: 0, willBeCutQty: 0, cutQty: 0, less: 0, over: 0 },
    );
    return { rows, totals };
  }, [matrix, selectedRow, colorCutBySize]);

  const openCutting = () => {
    if (!workOrderId) return;
    if (!selectedColor) { toast.error("Select a Production Color first."); return; }
    navigateOrOpenTab(router, `/dashboard/legacy-erp/cutting-card/entry?id=${workOrderId}&color=${encodeURIComponent(selectedColor)}`, { title: `Cutting — ${selectedColor}` });
  };

  const close = () => closeTab(tabCtx?.tabKey ?? "/dashboard/legacy-erp/cutting-card");

  const th = "border-r border-border/70 bg-muted/50 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-7 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const labelTd = "border-r border-b border-border/50 px-2 text-[11.5px] font-medium";

  return (
    <div className="space-y-4 p-4">
      <LegacyErpBreadcrumb trail={[{ label: "Legacy ERP" }, { label: "Cutting Card" }]} />

      <div className="grid grid-cols-12 gap-3 rounded-md border p-3">
        <div className="col-span-3 space-y-1">
          <label className="text-xs text-muted-foreground">Order No</label>
          <MasterAutocompleteField
            label="" compact masterKey="manufacturing-order"
            // "manufacturing-order" is search-only (no activeColumn/label/codeColumn configured —
            // see legacy-master-lookup.service.ts's manageable() guard); Work Orders already have
            // their own real management screen (Work Orders List), so the F2/search-icon button
            // is pointed there instead of the generic Master Lookup screen it would otherwise 400
            // on. Same fix/reasoning as fabric-yarn-requirements/page.tsx's own Order No field.
            lookupPath="/dashboard/legacy-erp/work-orders-list"
            displayValue={workOrder?.workOrderNo || ""}
            fetchOptions={(t) => legacyErpApi.lookupTable("manufacturing-order", t) as Promise<MasterOption[]>}
            onSelect={(o) => loadWorkOrder(Number(o.id))}
            onClear={() => { setWorkOrder(null); setWorkOrderId(null); setMatrix(null); setSelectedColor(null); setStyleCard(null); setCustomerLabel(""); }}
          />
        </div>
        <div className="col-span-5 space-y-1">
          <label className="text-xs text-muted-foreground">Style No</label>
          <p className="flex h-8 items-center rounded-md border border-input px-2 text-sm">
            {styleCard ? `${styleCard.styleNumber} — ${styleCard.title}` : <span className="text-muted-foreground">—</span>}
          </p>
        </div>
        <div className="col-span-4 space-y-1">
          <label className="text-xs text-muted-foreground">Customer</label>
          <p className="flex h-8 items-center rounded-md border border-input px-2 text-sm truncate">
            {customerLabel || <span className="text-muted-foreground">—</span>}
          </p>
        </div>
      </div>

      {!workOrderId ? (
        <p className="text-sm text-muted-foreground">Search an Order No above to load its Production Colors.</p>
      ) : loading && !matrix ? (
        <Skeleton className="h-48 w-full" />
      ) : !matrix?.colors.length ? (
        <p className="text-sm text-muted-foreground">
          {matrix?.sizes.length ? "No Production Colors saved yet — enter Manufacturing Quantities on this Work Order's C/S Details tab first." : "This Work Order has no Manufacturing Quantities/sizes yet — enter them on its C/S Details tab first."}
        </p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Production Colors{!!matrix.extraCuttingPercent && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(Will Be Cut — Extra Cutting {matrix.extraCuttingPercent}% applied, rounded up per size)</span>}
            </p>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[700px] table-fixed border-collapse text-[11.5px]">
                <thead><tr>
                  <th className={th} style={{ width: 160 }}>Color</th>
                  {matrix.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 80 }}>{s}</th>)}
                  <th className={`${th} text-right`} style={{ width: 110 }}>Grand Total</th>
                </tr></thead>
                <tbody>
                  {matrix.colors.map((c) => {
                    const isSelected = c.color === selectedColor;
                    return (
                      <Fragment key={c.color}>
                        <tr
                          key={`${c.color}-order`}
                          className={cn("cursor-pointer", isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent/50")}
                          onClick={() => setSelectedColor(c.color)}
                        >
                          <td className={labelTd} rowSpan={2}><span className="flex h-full items-center font-semibold">{c.color}</span></td>
                          {matrix.sizes.map((s) => <td key={s} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(c.bySize[s]?.orderQty || 0, "quantity").toLocaleString()}</span></td>)}
                          <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(c.total.orderQty, "quantity").toLocaleString()}</span></td>
                        </tr>
                        <tr
                          key={`${c.color}-wbc`}
                          className={cn("cursor-pointer", isSelected ? "bg-primary/70 text-primary-foreground" : "bg-muted/20 hover:bg-accent/50")}
                          onClick={() => setSelectedColor(c.color)}
                        >
                          {matrix.sizes.map((s) => <td key={s} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(c.bySize[s]?.willBeCutQty || 0, "quantity").toLocaleString()}</span></td>)}
                          <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(c.total.willBeCutQty, "quantity").toLocaleString()}</span></td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">Each color's dark row is Order Qty, the lighter row directly under it is Will Be Cut Qty. Click either row to select that Production Color.</p>
          </div>

          {selectedRow && selectedSummary && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {selectedRow.color} — Cutting Summary{loadingCutTotals && <span className="ml-1.5 font-normal normal-case">(loading Cut totals...)</span>}
              </p>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[700px] table-fixed border-collapse text-[11.5px]">
                  <thead><tr>
                    <th className={th} style={{ width: 140 }} />
                    {matrix.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 80 }}>{s}</th>)}
                    <th className={`${th} text-right`} style={{ width: 110 }}>Grand Total</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Order</span></td>
                      {selectedSummary.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.orderQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(selectedSummary.totals.orderQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className={labelTd}><span className="flex h-7 items-center">Will Be Cut</span></td>
                      {selectedSummary.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.willBeCutQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(selectedSummary.totals.willBeCutQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Cut</span></td>
                      {selectedSummary.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.cutQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(selectedSummary.totals.cutQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className={labelTd}><span className="flex h-7 items-center">Less</span></td>
                      {selectedSummary.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono text-amber-700 dark:text-amber-400">{r.less ? round(r.less, "quantity").toLocaleString() : "—"}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium text-amber-700 dark:text-amber-400">{selectedSummary.totals.less ? round(selectedSummary.totals.less, "quantity").toLocaleString() : "—"}</span></td>
                    </tr>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Over</span></td>
                      {selectedSummary.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono text-blue-700 dark:text-blue-400">{r.over ? round(r.over, "quantity").toLocaleString() : "—"}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium text-blue-700 dark:text-blue-400">{selectedSummary.totals.over ? round(selectedSummary.totals.over, "quantity").toLocaleString() : "—"}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" onClick={openCutting} disabled={!workOrderId || !matrix?.colors.length}>Cutting</Button>
        <Button variant="outline" size="sm" onClick={close} className="ml-auto">Close</Button>
      </div>
    </div>
  );
}
