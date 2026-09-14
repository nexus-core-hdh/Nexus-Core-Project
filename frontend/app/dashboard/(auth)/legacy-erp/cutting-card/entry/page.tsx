"use client";

// Cutting Entry — one (Work Order, Production Color, Fabric) context. Reached either from the
// Cutting Card MAIN screen (../page.tsx: search Work Order -> pick Color -> Cutting) or directly
// from Work Order -> C/S Details' own per-row "Cutting" button (work-orders/page.tsx). Either way
// this screen itself owns picking WHICH Fabric to edit — its own dropdown, populated from the
// exact same BOM-priority-resolved Fabric list Requirements already trusts (see
// cutting-card.service.ts's listApplicableFabrics, which reuses fabric-yarn-requirements.service.ts's
// resolveBomLines as-is — zero new BOM-resolution logic).
//
// Order Qty and Will Be Cut Qty are NEVER computed here — both come straight from
// cutting-card.service.ts's own getCuttingCard(), derived on every read from the Work Order's
// existing authoritative sources (Manufacturing Quantities + Extra Cutting %). Cut Qty is ALSO
// never entered directly here anymore — it is always the SUM of the real Cutting Entries logged
// in the top grid (one row per actual cutting batch: Date/Factory/Party No/Document/Explanation +
// its own per-size quantities), matching the reference legacy screen exactly. The right-side
// Cutting Analysis Detail panel is real, persisted, DB-backed data too (CuttingCard's own columns)
// — nothing on this screen is a fake/static display field anymore.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { normalizeNonNegative } from "@/lib/numeric-guards";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { EditableGridInput } from "@/components/ui/editable-grid-input";

interface ApplicableFabric {
  materialKey: string; materialLabel: string;
  inventoryId: number | null; inventoryCode: string | null; inventoryName: string | null;
  variant1: string | null; variant2: string | null;
  colorCardId: string | null; colorCode: string | null; colorName: string | null;
  wastage: number; markerWidth: number | null; markerLength: number | null; m2Weight: number | null;
}

interface CuttingCardSizeRow {
  sizeCode: string; orderQty: number; willBeCutQty: number; cutQty: number; less: number; over: number;
}

interface CuttingEntry {
  id: string; date: string | null; factoryId: number | null; factoryCode: string | null; factoryName: string | null;
  partyNo: string | null; document: string | null; explanation: string | null;
  sizes: Record<string, number>; total: number;
}

interface CuttingCardDetail {
  markerNo: string | null; spreader: string | null; cadOperator: string | null; cutter: string | null;
  specialCode: string | null; explanation: string | null; fabricType: string | null;
  markerWeight: number | null; markerPlies: number | null; markerCount: number | null;
  sentForCutting: number | null; increase: number | null; returnQty: number | null;
  endOfRoll: number | null; clipping: number | null; markerGrams: number | null; actualGrams: number | null;
  cuttingLossPercent: number | null;
}

interface CuttingCardData {
  cardId: string; workOrderId: number; productionColor: string; materialKey: string; materialLabel: string;
  extraCuttingPercent: number; sizes: string[]; rows: CuttingCardSizeRow[];
  totals: { orderQty: number; willBeCutQty: number; cutQty: number; less: number; over: number };
  detail: CuttingCardDetail;
  entries: CuttingEntry[];
  updatedAt: string;
}

const DETAIL_TEXT_FIELDS: { key: keyof CuttingCardDetail; label: string }[] = [
  { key: "markerNo", label: "Marker No" },
  { key: "spreader", label: "Spreader" },
  { key: "cadOperator", label: "CAD Operator" },
  { key: "cutter", label: "Cutter" },
  { key: "specialCode", label: "Special Code" },
  { key: "explanation", label: "Explanation" },
  { key: "fabricType", label: "Fabric Type" },
];
const DETAIL_NUMBER_FIELDS: { key: keyof CuttingCardDetail; label: string; unit: string }[] = [
  { key: "markerWeight", label: "Marker Weight", unit: "Kg" },
  { key: "markerPlies", label: "Marker Plies", unit: "Piece" },
  { key: "markerCount", label: "Marker Count", unit: "Piece" },
  { key: "sentForCutting", label: "Sent for Cutting", unit: "Kg" },
  { key: "increase", label: "Increase", unit: "Kg" },
  { key: "returnQty", label: "Return", unit: "Kg" },
  { key: "endOfRoll", label: "End of Roll", unit: "Kg" },
  { key: "clipping", label: "Clipping", unit: "Kg" },
  { key: "markerGrams", label: "Marker (Grams)", unit: "Gr" },
  { key: "actualGrams", label: "Actual (Grams)", unit: "Gr" },
];

export default function CuttingEntryPage() {
  const searchParams = useWorkspaceSearchParams();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const workOrderId = Number(searchParams.get("id")) || null;
  const productionColor = searchParams.get("color") || "";

  const [workOrder, setWorkOrder] = useState<any>(null);
  const [styleCard, setStyleCard] = useState<any>(null);
  const [fabrics, setFabrics] = useState<ApplicableFabric[]>([]);
  const [loadingFabrics, setLoadingFabrics] = useState(false);
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string>("");

  const [card, setCard] = useState<CuttingCardData | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  // Local editable draft of the Cutting Analysis Detail panel — starts as a copy of the loaded
  // card's own saved detail every time a fresh load lands, and is what Save actually sends. The
  // Cutting Entries grid below is NOT part of this draft — each of its own cells/rows persists
  // immediately on its own action (same as Work Order's Explanation/Activities/Expenses rows).
  const [detailEdits, setDetailEdits] = useState<CuttingCardDetail | null>(null);

  const selectedFabric = useMemo(() => fabrics.find((f) => f.materialKey === selectedMaterialKey) || null, [fabrics, selectedMaterialKey]);

  const loadHeader = async () => {
    if (!workOrderId) return;
    try {
      const wo: any = await legacyErpApi.workOrders.get(workOrderId);
      setWorkOrder(wo);
      if (wo?.styleCardId) plmApi.styleCards.get(wo.styleCardId).then(setStyleCard).catch(() => setStyleCard(null));
    } catch (e: any) {
      toast.error(e.message || "Failed to load Work Order");
    }
  };

  const loadFabrics = async () => {
    if (!workOrderId || !productionColor) return;
    setLoadingFabrics(true);
    try {
      const list: any = await legacyErpApi.workOrders.cuttingCard.listFabrics(workOrderId, productionColor);
      setFabrics(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load applicable Fabrics");
    } finally {
      setLoadingFabrics(false);
    }
  };

  useEffect(() => {
    loadHeader();
    loadFabrics();
    setSelectedMaterialKey("");
    setCard(null);
    setDetailEdits(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, productionColor]);

  const loadCard = async (materialKey: string) => {
    if (!workOrderId || !productionColor || !materialKey) return;
    setLoadingCard(true);
    try {
      const fabric = fabrics.find((f) => f.materialKey === materialKey);
      const cc: any = await legacyErpApi.workOrders.cuttingCard.get(workOrderId, productionColor, materialKey, fabric?.materialLabel);
      setCard(cc as CuttingCardData);
      setDetailEdits((cc as CuttingCardData).detail);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Cutting Entry");
    } finally {
      setLoadingCard(false);
    }
  };

  useEffect(() => {
    if (selectedMaterialKey) loadCard(selectedMaterialKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterialKey]);

  // Every mutation below (detail save, entry add/edit/delete, size edit) returns the FULL,
  // freshly-recomputed card — applied straight back to state so Cut/Less/Over/Grand Total and
  // every entry's own Factory label are always exactly what the DB now holds, never a locally
  // guessed delta.
  const applyUpdatedCard = (updated: any) => {
    setCard(updated as CuttingCardData);
    setDetailEdits((updated as CuttingCardData).detail);
  };

  // Every mutation (detail save, entry add/edit/delete, size edit) is its own independent request
  // that returns and re-applies the ENTIRE card. Firing two of these concurrently (e.g. typing
  // into two different Cut Qty cells within a second of each other) would race: whichever response
  // lands LAST wins and can silently overwrite the other cell's own just-saved value with a
  // now-stale snapshot read before that other request's write had committed. This queue forces
  // every mutation to fully complete (request AND its own state-applying response) before the next
  // one starts, so edits can never clobber each other regardless of how fast they're made.
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueueMutation = (fn: () => Promise<void>) => {
    const run = mutationQueueRef.current.then(fn, fn);
    mutationQueueRef.current = run.catch(() => {});
    return run;
  };

  const saveDetail = () => enqueueMutation(async () => {
    if (!workOrderId || !productionColor || !selectedFabric || !detailEdits) return;
    setSavingDetail(true);
    try {
      const { cuttingLossPercent, ...toSend } = detailEdits; // never sent — always server-computed
      const updated = await legacyErpApi.workOrders.cuttingCard.saveDetail(workOrderId, productionColor, selectedFabric.materialKey, selectedFabric.materialLabel, toSend);
      applyUpdatedCard(updated);
      toast.success("Cutting Analysis Detail saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save Cutting Analysis Detail");
    } finally {
      setSavingDetail(false);
    }
  });

  const addEntry = () => enqueueMutation(async () => {
    if (!workOrderId || !productionColor || !selectedFabric) return;
    setAddingEntry(true);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.addEntry(workOrderId, productionColor, selectedFabric.materialKey, selectedFabric.materialLabel);
      applyUpdatedCard(updated);
    } catch (e: any) {
      toast.error(e.message || "Failed to add Cutting Entry");
    } finally {
      setAddingEntry(false);
    }
  });

  const patchEntry = (entryId: string, patch: { date?: string | null; factoryId?: number | null; partyNo?: string | null; document?: string | null; explanation?: string | null }) => enqueueMutation(async () => {
    if (!workOrderId || !productionColor || !selectedFabric) return;
    setBusyEntryId(entryId);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.updateEntry(workOrderId, productionColor, selectedFabric.materialKey, selectedFabric.materialLabel, entryId, patch);
      applyUpdatedCard(updated);
    } catch (e: any) {
      toast.error(e.message || "Failed to update Cutting Entry");
    } finally {
      setBusyEntryId(null);
    }
  });

  const setEntrySize = (entryId: string, sizeCode: string, quantity: number) => enqueueMutation(async () => {
    if (!workOrderId || !productionColor || !selectedFabric) return;
    setBusyEntryId(entryId);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.setEntrySize(workOrderId, productionColor, selectedFabric.materialKey, selectedFabric.materialLabel, entryId, sizeCode, quantity);
      applyUpdatedCard(updated);
    } catch (e: any) {
      toast.error(e.message || "Failed to save Cut quantity");
    } finally {
      setBusyEntryId(null);
    }
  });

  const deleteEntry = (entryId: string) => enqueueMutation(async () => {
    if (!workOrderId || !productionColor || !selectedFabric) return;
    if (!window.confirm("Delete this Cutting Entry? Its own logged Cut quantities will be removed from the totals below.")) return;
    setBusyEntryId(entryId);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.deleteEntry(workOrderId, productionColor, selectedFabric.materialKey, selectedFabric.materialLabel, entryId);
      applyUpdatedCard(updated);
      toast.success("Cutting Entry deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete Cutting Entry");
    } finally {
      setBusyEntryId(null);
    }
  });

  const close = () => closeTab(tabCtx?.tabKey ?? "/dashboard/legacy-erp/cutting-card/entry");

  const th = "border-r border-border/70 bg-muted/50 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-7 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const labelTd = "border-r border-b border-border/50 px-2 text-[11.5px] font-medium";
  const sideLabel = "text-[11px] text-muted-foreground";
  const sideValue = "flex h-7 items-center rounded border bg-muted/30 px-2 text-[11.5px] truncate";
  const sideInput = "h-7 w-full rounded border bg-background px-2 text-[11.5px] outline-none focus:ring-1 focus:ring-primary/40";
  const cellInput = "h-7 w-full bg-transparent px-1.5 text-[11px] outline-none focus:bg-accent/50";

  if (!workOrderId || !productionColor) {
    return (
      <div className="p-4">
        <LegacyErpBreadcrumb trail={[{ label: "Legacy ERP" }, { label: "Cutting Card" }, { label: "Cutting Entry" }]} />
        <p className="mt-3 text-sm text-muted-foreground">
          Open this from the Cutting Card screen — search a Work Order, select a Production Color, then click Cutting.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4 p-4">
      <div className="col-span-12 xl:col-span-9 space-y-3">
        <LegacyErpBreadcrumb trail={[{ label: "Legacy ERP" }, { label: "Cutting Card" }, { label: "Cutting Entry" }]} />

        <div className="grid grid-cols-12 gap-3 rounded-md border p-3">
          <div className="col-span-4 space-y-1">
            <label className="text-xs text-muted-foreground">Order No</label>
            <div className="text-sm font-medium">{!workOrder ? <Skeleton className="h-4 w-24" /> : workOrder?.workOrderNo || "—"}</div>
          </div>
          <div className="col-span-5 space-y-1">
            <label className="text-xs text-muted-foreground">Style No</label>
            <p className="text-sm font-medium">{styleCard ? `${styleCard.styleNumber} — ${styleCard.title}` : "—"}</p>
          </div>
          <div className="col-span-3 space-y-1">
            <label className="text-xs text-muted-foreground">Production Color</label>
            <p className="text-sm font-medium truncate">{productionColor}</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fabric</label>
          {loadingFabrics ? (
            <Skeleton className="h-9 w-full" />
          ) : !fabrics.length ? (
            <p className="text-xs text-muted-foreground">No applicable Fabric requirements resolved for {productionColor} on this Work Order — check its BOM (own or linked Style Card's) has a Fabric item mapped to this color, or that applies to every color.</p>
          ) : (
            <Select value={selectedMaterialKey} onValueChange={setSelectedMaterialKey}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a Fabric..." />
              </SelectTrigger>
              <SelectContent>
                {fabrics.map((f) => (
                  <SelectItem key={f.materialKey} value={f.materialKey}>
                    {[f.inventoryCode, f.inventoryName].filter(Boolean).join(" - ") || "Item"}
                    {" — "}{f.materialLabel}
                    {(f.colorCode || f.colorName) ? ` [${f.colorCode || f.colorName}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!selectedMaterialKey ? (
          <p className="text-sm text-muted-foreground">Select a Fabric above to load its Cutting Entries and Order / Will Be Cut / Cut sizes.</p>
        ) : loadingCard && !card ? (
          <Skeleton className="h-56 w-full" />
        ) : !card?.sizes.length ? (
          <p className="text-xs text-muted-foreground">No sizes configured for this Work Order/Style Card yet.</p>
        ) : (
          <>
            {/* Cutting Entries — one real, persisted row per actual cutting batch. The Cutting
                Summary's own "Cut" row below is always the live SUM of these, never a second
                editable number. */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Cutting Entries</p>
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={addEntry} disabled={addingEntry}>
                  <Plus className="h-3 w-3 mr-1" />{addingEntry ? "Adding..." : "Add Cutting Entry"}
                </Button>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[900px] table-fixed border-collapse text-[11.5px]">
                  <thead><tr>
                    <th className={th} style={{ width: 110 }}>Date</th>
                    <th className={th} style={{ width: 130 }}>Factory</th>
                    <th className={th} style={{ width: 140 }}>Factory Name</th>
                    <th className={th} style={{ width: 100 }}>Party No</th>
                    <th className={th} style={{ width: 110 }}>Document</th>
                    <th className={th} style={{ width: 150 }}>Explanation</th>
                    {card.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 70 }}>{s}</th>)}
                    <th className={`${th} text-right`} style={{ width: 90 }}>Total</th>
                    <th className={th} style={{ width: 32 }} />
                  </tr></thead>
                  <tbody>
                    {!card.entries.length ? (
                      <tr><td className={labelTd} colSpan={7 + card.sizes.length}><span className="flex h-7 items-center text-muted-foreground">No Cutting Entries logged yet — click "Add Cutting Entry" to log the first cutting batch.</span></td></tr>
                    ) : card.entries.map((entry) => {
                      const busy = busyEntryId === entry.id;
                      return (
                        <tr key={entry.id} className={busy ? "opacity-60" : undefined}>
                          <td className={td}>
                            <input
                              type="date" className={cellInput} disabled={busy}
                              defaultValue={entry.date ? entry.date.slice(0, 10) : ""}
                              onChange={(e) => patchEntry(entry.id, { date: e.target.value || null })}
                            />
                          </td>
                          <td className={td}>
                            <MasterAutocompleteField
                              label="Factory" compact masterKey="currentAccount"
                              displayValue={entry.factoryCode || ""}
                              fetchOptions={(t) => legacyErpApi.accounts.list(t) as Promise<any[]>}
                              onSelect={(o: MasterOption) => patchEntry(entry.id, { factoryId: Number(o.id) })}
                              onClear={() => patchEntry(entry.id, { factoryId: null })}
                            />
                          </td>
                          <td className={td}><span className="flex h-7 items-center px-1.5 truncate text-muted-foreground">{entry.factoryName || "—"}</span></td>
                          <td className={td}><input className={cellInput} disabled={busy} defaultValue={entry.partyNo || ""} onBlur={(e) => e.target.value !== (entry.partyNo || "") && patchEntry(entry.id, { partyNo: e.target.value })} /></td>
                          <td className={td}><input className={cellInput} disabled={busy} defaultValue={entry.document || ""} onBlur={(e) => e.target.value !== (entry.document || "") && patchEntry(entry.id, { document: e.target.value })} /></td>
                          <td className={td}><input className={cellInput} disabled={busy} defaultValue={entry.explanation || ""} onBlur={(e) => e.target.value !== (entry.explanation || "") && patchEntry(entry.id, { explanation: e.target.value })} /></td>
                          {card.sizes.map((s) => (
                            <td key={s} className={td}>
                              <EditableGridInput
                                type="number" align="right" className={`${cellInput} text-right font-mono`} value={entry.sizes[s] ?? ""} disabled={busy} nonNegative
                                onChange={(v) => setEntrySize(entry.id, s, normalizeNonNegative(v))}
                              />
                            </td>
                          ))}
                          <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(entry.total, "quantity").toLocaleString()}</span></td>
                          <td className={`${td} text-center`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={busy} onClick={() => deleteEntry(entry.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Cutting Summary{!!card && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(Extra Cutting {card.extraCuttingPercent}% applied, rounded up per size — Cut is the sum of the Cutting Entries above)</span>}
              </p>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[700px] table-fixed border-collapse text-[11.5px]">
                  <thead><tr>
                    <th className={th} style={{ width: 140 }} />
                    {card.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 85 }}>{s}</th>)}
                    <th className={`${th} text-right`} style={{ width: 110 }}>Total Quantity</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Order</span></td>
                      {card.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.orderQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(card.totals.orderQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className={labelTd}><span className="flex h-7 items-center">Will Be Cut</span></td>
                      {card.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.willBeCutQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(card.totals.willBeCutQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Cut</span></td>
                      {card.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.cutQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(card.totals.cutQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className={labelTd}><span className="flex h-7 items-center">Less</span></td>
                      {card.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono text-amber-700 dark:text-amber-400">{r.less ? round(r.less, "quantity").toLocaleString() : "—"}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium text-amber-700 dark:text-amber-400">{card.totals.less ? round(card.totals.less, "quantity").toLocaleString() : "—"}</span></td>
                    </tr>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Over</span></td>
                      {card.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono text-blue-700 dark:text-blue-400">{r.over ? round(r.over, "quantity").toLocaleString() : "—"}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium text-blue-700 dark:text-blue-400">{card.totals.over ? round(card.totals.over, "quantity").toLocaleString() : "—"}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" onClick={saveDetail} disabled={!card || savingDetail}>{savingDetail ? "Saving..." : "Save"}</Button>
          <Button variant="outline" size="sm" onClick={close} className="ml-auto">Close</Button>
        </div>
      </div>

      {/* Cutting Analysis Detail — top block is read-only reference from the SELECTED Fabric's own
          resolved BOM line (Variant-1/2, Material Color, Marker Width/Length, M2 Weight, Wastage —
          the exact same fields the Work Order's own BOM tab already manages for this line); never
          fabricated, "—" when this line genuinely has no such value. Everything below that is
          real, editable, DB-backed CuttingCard data (saved via the page's own Save button above) —
          Cutting Loss % is the one exception, always computed live from Marker/Actual Grams,
          never itself stored (see cutting-card.service.ts's own comment on why). */}
      <div className="col-span-12 xl:col-span-3 space-y-3 rounded-md border p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Cutting Analysis Detail</p>
        {!selectedFabric || !detailEdits ? (
          <p className="text-xs text-muted-foreground">Select a Fabric to see its details.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div><label className={sideLabel}>Fabric</label><p className={sideValue}>{[selectedFabric.inventoryCode, selectedFabric.inventoryName].filter(Boolean).join(" — ") || "—"}</p></div>
              <div><label className={sideLabel}>Recipe Description</label><p className={sideValue}>{card?.materialLabel || "—"}</p></div>
              <div><label className={sideLabel}>Variant-1</label><p className={sideValue}>{selectedFabric.variant1 || "—"}</p></div>
              <div><label className={sideLabel}>Variant-2</label><p className={sideValue}>{selectedFabric.variant2 || "—"}</p></div>
              <div><label className={sideLabel}>Material Color</label><p className={sideValue}>{selectedFabric.colorCode || selectedFabric.colorName || "—"}</p></div>
              <div><label className={sideLabel}>Marker Width (Meter)</label><p className={sideValue}>{selectedFabric.markerWidth ?? "—"}</p></div>
              <div><label className={sideLabel}>Marker Length (Meter)</label><p className={sideValue}>{selectedFabric.markerLength ?? "—"}</p></div>
              <div><label className={sideLabel}>Weight/m2 (Gr)</label><p className={sideValue}>{selectedFabric.m2Weight ?? "—"}</p></div>
            </div>

            <div className="space-y-2 border-t pt-2">
              {DETAIL_TEXT_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className={sideLabel}>{label}</label>
                  <input
                    className={sideInput}
                    value={(detailEdits[key] as string) ?? ""}
                    onChange={(e) => setDetailEdits((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))}
                  />
                </div>
              ))}
              {DETAIL_NUMBER_FIELDS.map(({ key, label, unit }) => (
                <div key={key}>
                  <label className={sideLabel}>{label} ({unit})</label>
                  <input
                    type="number" min={0} className={sideInput}
                    value={(detailEdits[key] as number) ?? ""}
                    onChange={(e) => setDetailEdits((prev) => (prev ? { ...prev, [key]: normalizeNonNegative(e.target.value) } : prev))}
                    onKeyDown={(ev) => { if (ev.key === "-") ev.preventDefault(); }}
                  />
                </div>
              ))}
              <div>
                <label className={sideLabel}>Cutting Loss %</label>
                <p className={sideValue} title="Always computed live from Marker (Grams) and Actual (Grams) — not itself editable/stored">
                  {detailEdits.cuttingLossPercent != null ? `${detailEdits.cuttingLossPercent}%` : "—"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
