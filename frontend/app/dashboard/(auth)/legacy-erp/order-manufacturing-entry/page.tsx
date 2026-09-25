"use client";

// Order Manufacturing Entry — MAIN screen. A read model over real data: the Production Color rows,
// BOM material columns, sizes, Order / Will Be Cut / Cutting / Sent / Received / Return / Balance all
// come from GET /legacy-erp/order-manufacturing/context (order-manufacturing.service.ts), never from
// UI state. The bottom buttons open the shared Manufacturing IN / OUT / Sent (Repair) / Received
// (Repair) child screen (./entry/page.tsx) scoped to the selected Order + Process + Color, and the
// Price Contract dialog. Child screens dispatch OM_CHANGED_EVENT after Save so this (still mounted)
// screen re-reads the DB.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { API_BASE_URL } from "@/lib/api";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { cn } from "@/lib/utils";
import {
  SizeSummary, textOn, OM_CHANGED_EVENT, OM_ROUTE,
  type GrandTotal, type MaterialColumn, type QualityType, type ReadRow,
} from "./_components/size-summary";
import { PriceContractDialog } from "./_components/price-contract-dialog";

interface Context {
  workOrder: { id: number; workOrderNo: string; customerCode: string | null; customerName: string | null };
  style: { id: string; styleNumber: string; title: string; imageUrl: string | null } | null;
  process: { id: number; code: string | null; name: string | null } | null;
  lockReason: string | null;
  sizes: string[];
  extraCuttingPercent: number;
  materialColumns: MaterialColumn[];
  qualityColumns: QualityType[];
  rows: ReadRow[];
  grandTotal: GrandTotal;
}

const processLabel = (p: { code: string | null; name: string | null } | null) => (p ? [p.code, p.name].filter(Boolean).join(" ") : "");

export default function OrderManufacturingEntryPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  const fmt = (n: number) => round(n, "quantity").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const idParam = searchParams.get("id");
  const processParam = searchParams.get("processId");
  const [workOrderId, setWorkOrderId] = useState<number | null>(idParam ? Number(idParam) : null);
  const [processId, setProcessId] = useState<number | null>(processParam ? Number(processParam) : null);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(searchParams.get("color"));
  const [loading, setLoading] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const load = useCallback(async (woId: number | null, procId: number | null) => {
    if (!woId) { setCtx(null); return; }
    setLoading(true);
    try {
      const c = (await legacyErpApi.orderManufacturing.context(woId, procId)) as Context;
      setCtx(c);
      // The Work Order's own default Process (MA_WorkOrder.ProcessId) applies only when none is chosen.
      if (procId == null && c.process) setProcessId(c.process.id);
      setSelectedColor((prev) => (prev && c.rows.some((r) => r.color === prev) ? prev : c.rows[0]?.color ?? null));
    } catch (e: any) {
      toast.error(e.message || "Failed to load Order Manufacturing Entry");
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = idParam ? Number(idParam) : null;
    const pid = processParam ? Number(processParam) : null;
    setWorkOrderId(id);
    setProcessId(pid);
    load(id, pid);
  }, [idParam, processParam, load]);

  // Re-read the DB whenever a child screen saved something for THIS order.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { workOrderId?: number } | undefined;
      if (!d?.workOrderId || d.workOrderId === workOrderId) load(workOrderId, processId);
    };
    window.addEventListener(OM_CHANGED_EVENT, h);
    return () => window.removeEventListener(OM_CHANGED_EVENT, h);
  }, [workOrderId, processId, load]);

  const selectedRow = useMemo(() => ctx?.rows.find((r) => r.color === selectedColor) ?? null, [ctx, selectedColor]);
  const styleImage = ctx?.style?.imageUrl
    ? (ctx.style.imageUrl.startsWith("http") ? ctx.style.imageUrl : `${API_BASE_URL}/${ctx.style.imageUrl.replace(/^\//, "")}`)
    : null;

  const pickOrder = (o: MasterOption) => { setWorkOrderId(Number(o.id)); load(Number(o.id), processId); };
  const pickProcess = (o: MasterOption) => { setProcessId(Number(o.id)); load(workOrderId, Number(o.id)); };

  const openChild = (mode: "in" | "out" | "repair-sent" | "repair-received", title: string) => {
    if (!workOrderId || !ctx?.process || !selectedColor) return;
    const q = `id=${workOrderId}&processId=${ctx.process.id}&color=${encodeURIComponent(selectedColor)}&mode=${mode}`;
    // `k` is the workspace tab key (see MULTI_KEY_ROUTES in lib/workspace/registry.tsx): one open tab
    // per (Order, Process, mode, Color) so two contexts never overwrite each other's unsaved edits.
    const k = encodeURIComponent(`${workOrderId}:${ctx.process.id}:${mode}:${selectedColor}`);
    navigateOrOpenTab(router, `${OM_ROUTE}/entry?${q}&k=${k}`, { title: `${title} — ${selectedColor}` });
  };

  const close = () => closeTab(tabCtx?.tabKey ?? OM_ROUTE);

  const canChild = !!workOrderId && !!ctx?.process && !!selectedColor;
  const childHint = !workOrderId ? "Select an Order No first." : !ctx?.process ? "Select a Process first." : !selectedColor ? "Select a row first." : undefined;

  const th = "sticky top-0 z-10 border border-border/70 bg-muted px-1.5 h-8 text-[10.5px] font-semibold text-muted-foreground whitespace-nowrap text-left align-bottom";
  const tdNum = "border border-border/50 px-1.5 h-[22px] text-right font-mono text-[11px] whitespace-nowrap";
  const fieldLabel = "w-14 shrink-0 text-right text-[11.5px] text-muted-foreground";
  const roBox = "flex h-6 items-center truncate rounded-sm border border-input bg-muted/30 px-2 text-[11.5px]";

  return (
    <div className="flex min-h-[calc(100vh-7.5rem)] flex-col gap-2 p-2 text-[11.5px]">
      {/* Context header — Order No / Style No / Process (+ style picture) */}
      <div className="flex items-start gap-3">
        <div className="grid max-w-3xl flex-1 gap-1">
          <div className="flex items-center gap-2">
            <span className={fieldLabel}>Order No</span>
            <div className="w-44">
              <MasterAutocompleteField
                label="" compact masterKey="manufacturing-order"
                // "manufacturing-order" is search-only — Work Orders have their own management screen,
                // so F2/the search icon points there (same as Cutting Card / Requirements Order No).
                lookupPath="/dashboard/legacy-erp/work-orders-list"
                displayValue={ctx?.workOrder.workOrderNo || ""}
                fetchOptions={(t) => legacyErpApi.lookupTable("manufacturing-order", t) as Promise<MasterOption[]>}
                onSelect={pickOrder}
                onClear={() => { setWorkOrderId(null); setCtx(null); setSelectedColor(null); }}
              />
            </div>
            <span className="truncate text-[11.5px]">{ctx?.workOrder.customerName || ""}</span>
            <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" title="Reload from database" disabled={!workOrderId || loading} onClick={() => load(workOrderId, processId)}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className={fieldLabel}>Style No</span>
            <div className={cn(roBox, "flex-1")}>{ctx?.style ? `${ctx.style.styleNumber} - ${ctx.style.title}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={fieldLabel}>Process</span>
            <div className="flex-1">
              <MasterAutocompleteField
                label="" compact masterKey="process"
                displayValue={processLabel(ctx?.process ?? null)}
                // Existing 'process' master (MA_Process). The field shows "Code Name", e.g. "12 Sewing".
                fetchOptions={async (t) => {
                  const rows = (await legacyErpApi.lookupTable("process", t)) as any[];
                  return (Array.isArray(rows) ? rows : []).map((r) => ({ id: r.id, code: r.code, name: [r.code, r.name].filter(Boolean).join(" ") }));
                }}
                onSelect={pickProcess}
                onClear={() => { setProcessId(null); load(workOrderId, null); }}
              />
            </div>
          </div>
        </div>
        {styleImage && <img src={styleImage} alt="" className="h-[68px] w-[68px] rounded-sm border object-cover" />}
      </div>

      {ctx?.lockReason && <p className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">{ctx.lockReason} Manufacturing entries are read-only.</p>}

      {/* Order matrix */}
      <div className="min-h-[180px] flex-1 overflow-auto rounded-sm border border-border/70">
        {!workOrderId ? (
          <p className="p-3 text-muted-foreground">Search an Order No above to load its Production Colors, BOM materials and sizes.</p>
        ) : loading && !ctx ? (
          <Skeleton className="h-40 w-full" />
        ) : !ctx?.rows.length ? (
          <p className="p-3 text-muted-foreground">This Work Order has no Production Colors yet — enter Manufacturing Quantities on its C/S Details tab first.</p>
        ) : (
          <table className="min-w-max border-collapse">
            <thead>
              <tr>
                <th className={cn(th, "left-0 z-20 w-3 min-w-3 px-0")} />
                {ctx.materialColumns.map((m, i) => (
                  <th key={m.key} className={cn(th, "min-w-[112px] max-w-[132px] whitespace-normal leading-tight", i === 0 && "sticky left-3 z-20")} title={`${m.lineType} — ${m.label}`}>{m.label}</th>
                ))}
                <th className={cn(th, "min-w-[84px] text-right")}>Order</th>
                <th className={cn(th, "min-w-[84px] text-right")}>Will be Cut</th>
                <th className={cn(th, "min-w-[84px] text-right")}>Cutting</th>
                <th className={cn(th, "min-w-[84px] text-right")}>Sent</th>
                {ctx.qualityColumns.map((q) => <th key={q.id} className={cn(th, "min-w-[84px] text-right")} title={q.code || undefined}>{q.name || q.code}</th>)}
                <th className={cn(th, "min-w-[84px] text-right")}>Received</th>
                <th className={cn(th, "min-w-[84px] text-right")}>Return</th>
                <th className={cn(th, "min-w-[84px] text-right")}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ctx.rows.map((r) => {
                const sel = r.color === selectedColor;
                const blank = (v: number) => (v ? fmt(v) : "");
                return (
                  <tr key={r.color} className={cn("cursor-pointer", sel ? "bg-primary text-primary-foreground" : "odd:bg-background even:bg-muted/30 hover:bg-accent/50")} onClick={() => setSelectedColor(r.color)}>
                    <td className={cn("sticky left-0 z-10 w-3 border border-border/50 p-0", sel ? "bg-primary" : "bg-muted")} title={r.color} />
                    {ctx.materialColumns.map((m, i) => {
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
                    <td className={tdNum}>{blank(r.totals.sent)}</td>
                    {ctx.qualityColumns.map((q) => <td key={q.id} className={tdNum}>{blank(r.byQuality[String(q.id)] || 0)}</td>)}
                    <td className={tdNum}>{blank(r.totals.received)}</td>
                    <td className={tdNum}>{blank(r.totals.returned)}</td>
                    <td className={cn(tdNum, "font-semibold")}>{blank(r.totals.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Size matrix — selected row + Grand Total */}
      {ctx && ctx.rows.length > 0 && (
        <div className="max-h-[36vh] overflow-auto">
          <p className="mb-0.5 text-[10.5px] text-muted-foreground">
            {selectedRow ? selectedRow.color : ""}
            {ctx.extraCuttingPercent ? ` — Will be Cut includes Extra Cutting ${ctx.extraCuttingPercent}%, rounded up per size` : ""}
            {!ctx.process ? " — select a Process to see Sent / Received / Return / Balance" : ""}
          </p>
          <SizeSummary sizes={ctx.sizes} row={selectedRow} grand={ctx.grandTotal} fmt={fmt} />
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
        <Button size="sm" variant="outline" className="h-7 min-w-28 text-[11.5px]" disabled={!canChild} title={childHint} onClick={() => openChild("in", "Manufacturing IN")}>Manufacturing IN</Button>
        <Button size="sm" variant="outline" className="h-7 min-w-28 text-[11.5px]" disabled={!canChild} title={childHint} onClick={() => openChild("out", "Manufacturing OUT")}>Manufacturing OUT</Button>
        <Button size="sm" variant="outline" className="h-7 min-w-28 text-[11.5px]" disabled={!workOrderId || !ctx} title={!workOrderId ? "Select an Order No first." : undefined} onClick={() => setPriceOpen(true)}>Price Contract</Button>
        <Button size="sm" variant="outline" className="h-7 min-w-28 text-[11.5px]" disabled={!canChild} title={childHint} onClick={() => openChild("repair-sent", "Sent (Repair)")}>Sent (Repair)</Button>
        <Button size="sm" variant="outline" className="h-7 min-w-28 text-[11.5px]" disabled={!canChild} title={childHint} onClick={() => openChild("repair-received", "Received (Repair)")}>Received (Repair)</Button>
        <Button size="sm" variant="outline" className="ml-auto h-7 min-w-24 text-[11.5px]" onClick={close}>Close</Button>
      </div>

      {priceOpen && workOrderId && (
        <PriceContractDialog workOrderId={workOrderId} workOrderNo={ctx?.workOrder.workOrderNo || ""} onClose={() => setPriceOpen(false)} />
      )}
    </div>
  );
}
