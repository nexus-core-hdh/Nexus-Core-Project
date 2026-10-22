"use client";

// Cutting Entry screen — ONE layout for both Cutting Modes (lib/legacy-erp/cutting-modes.ts):
//  - mode "color" (Colour-wise, ../app/.../cutting-card/entry): one (Work Order, Production Color,
//    Fabric) context. Reached from the Cutting Card MAIN screen (search Work Order -> pick Color ->
//    Cutting) or from Work Order -> C/S Details' own per-row "Cutting" button.
//  - mode "order" (Complete Order, ../app/.../cutting-card/order): the same screen for every
//    Production Color the selected Fabric applies to. The Cutting Summary is ONE size-wise block
//    (each figure summed across the colors by the server — getOrderCutting), the Cutting Entries grid lists
//    every color's entries with a Color column, and nothing is stored per order: a new entry is
//    added for an explicitly chosen color, and every edit/delete goes through the entry's OWN color
//    (the per-color endpoints), so no quantity can land on another color. The Cutting Analysis
//    Detail is stored per (Color, Fabric), so in this mode the panel asks which color it is for.
//
// Fabric list: the exact same BOM-priority-resolved Fabric list Requirements already trusts (see
// cutting-card.service.ts's listApplicableFabrics / listOrderFabrics, which reuse
// fabric-yarn-requirements.service.ts's resolveBomLines as-is — zero new BOM-resolution logic).
//
// Order Qty and Will Be Cut Qty are NEVER computed here — both come straight from
// cutting-card.service.ts (getCuttingCard / getOrderCutting), derived on every read from the Work
// Order's existing authoritative sources (Manufacturing Quantities + Extra Cutting %). Cut Qty is
// always the SUM of the real Cutting Entries logged in the top grid (one row per actual cutting
// batch: Date/Factory/Party No/Document/Explanation + its own per-size quantities), matching the
// reference legacy screen. The right-side Cutting Analysis Detail panel is real, persisted,
// DB-backed data too (CuttingCard's own columns).

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceTabTitle } from "@/hooks/use-workspace-tab-title";
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
import { normalizeNonNegative } from "@/lib/numeric-guards";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { DatePicker } from "@/components/ui/date-picker";
import { useRouter } from "@/lib/app-navigation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { cuttingHref, orderSummaryRows, type CuttingMode, type CuttingSizeRow, type CuttingTotals } from "@/lib/legacy-erp/cutting-modes";
import { cn } from "@/lib/utils";

interface ApplicableFabric {
  materialKey: string; materialLabel: string;
  inventoryId: number | null; inventoryCode: string | null; inventoryName: string | null;
  variant1: string | null; variant2: string | null;
  colorCardId: string | null; colorCode: string | null; colorName: string | null;
  wastage: number; markerWidth: number | null; markerLength: number | null; m2Weight: number | null;
  /** Complete Order only: the Production Colors this Fabric applies to. */
  colors?: string[];
}

interface CuttingEntry {
  id: string; date: string | null; factoryId: number | null; factoryCode: string | null; factoryName: string | null;
  partyNo: string | null; document: string | null; explanation: string | null;
  sizes: Record<string, number>; total: number;
  /** Complete Order only: the Production Color this entry belongs to. */
  color?: string;
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
  extraCuttingPercent: number; sizes: string[]; rows: CuttingSizeRow[];
  totals: CuttingTotals;
  detail: CuttingCardDetail;
  entries: CuttingEntry[];
  updatedAt: string;
}

/** What the grid + summary render — one color's card, or the consolidated Complete Order view. */
interface EntriesView {
  materialLabel: string; extraCuttingPercent: number; sizes: string[];
  rows: CuttingSizeRow[]; totals: CuttingTotals; entries: CuttingEntry[]; colors: string[];
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

export function CuttingEntryScreen({ mode }: { mode: CuttingMode }) {
  const isOrder = mode === "order";
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const workOrderId = Number(searchParams.get("id")) || null;
  const productionColor = isOrder ? "" : searchParams.get("color") || "";

  const [workOrder, setWorkOrder] = useState<any>(null);
  useWorkspaceTabTitle(workOrder?.workOrderNo ? `Cutting Entry [${[workOrder.workOrderNo, isOrder ? "Complete Order" : productionColor].filter(Boolean).join(" · ")}]` : undefined);
  const [styleCard, setStyleCard] = useState<any>(null);
  const [fabrics, setFabrics] = useState<ApplicableFabric[]>([]);
  const [loadingFabrics, setLoadingFabrics] = useState(false);
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string>("");

  // Colour-wise: the one color's card. Complete Order: the consolidated view (view) plus, for the
  // Cutting Analysis Detail panel, the card + BOM line of the color chosen in that panel.
  const [card, setCard] = useState<CuttingCardData | null>(null);
  const [orderView, setOrderView] = useState<EntriesView | null>(null);
  const [analysisColor, setAnalysisColor] = useState<string>("");
  const [analysisFabric, setAnalysisFabric] = useState<ApplicableFabric | null>(null);
  const [newEntryColor, setNewEntryColor] = useState<string>("");
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
  // The Fabric line the analysis panel describes: Colour-wise = the selected Fabric for this color;
  // Complete Order = the same Fabric's own line for the panel's chosen color.
  const panelFabric = isOrder ? analysisFabric : selectedFabric;

  const view: EntriesView | null = isOrder ? orderView : card && {
    materialLabel: card.materialLabel, extraCuttingPercent: card.extraCuttingPercent, sizes: card.sizes,
    rows: card.rows, totals: card.totals, entries: card.entries, colors: [card.productionColor],
  };

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
    if (!workOrderId || (!isOrder && !productionColor)) return;
    setLoadingFabrics(true);
    try {
      const list: any = isOrder
        ? await legacyErpApi.workOrders.cuttingCard.listOrderFabrics(workOrderId)
        : await legacyErpApi.workOrders.cuttingCard.listFabrics(workOrderId, productionColor);
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
    setOrderView(null);
    setDetailEdits(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, productionColor, mode]);

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

  // Complete Order: every applicable color's entries + the one consolidated size-wise summary.
  // Read-only on the server (no Cutting Card is created by loading it).
  const loadOrder = async (materialKey: string) => {
    if (!workOrderId || !materialKey) return;
    setLoadingCard(true);
    try {
      const o: any = await legacyErpApi.workOrders.cuttingCard.getOrder(workOrderId, materialKey);
      setOrderView({
        materialLabel: o.materialLabel, extraCuttingPercent: o.extraCuttingPercent, sizes: o.sizes,
        rows: orderSummaryRows(o.sizes, o.totals.bySize), totals: o.totals.grand,
        entries: o.entries, colors: o.colors.map((c: any) => c.color),
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to load Complete Order Cutting");
    } finally {
      setLoadingCard(false);
    }
  };

  // Complete Order's analysis panel: the chosen color's own card (its saved detail) and that
  // color's own BOM line for this Fabric (Variant-2, Material Color, Marker Width/Length...).
  const loadAnalysis = async (color: string) => {
    if (!workOrderId || !selectedFabric || !color) { setAnalysisFabric(null); setDetailEdits(null); return; }
    try {
      const [cc, lines]: any[] = await Promise.all([
        legacyErpApi.workOrders.cuttingCard.get(workOrderId, color, selectedFabric.materialKey, selectedFabric.materialLabel),
        legacyErpApi.workOrders.cuttingCard.listFabrics(workOrderId, color),
      ]);
      setAnalysisFabric((Array.isArray(lines) ? lines : []).find((l: ApplicableFabric) => l.materialKey === selectedFabric.materialKey) ?? null);
      setDetailEdits((cc as CuttingCardData).detail);
    } catch (e: any) {
      toast.error(e.message || "Failed to load the Cutting Analysis Detail");
    }
  };

  useEffect(() => {
    if (!selectedMaterialKey) return;
    if (isOrder) {
      setAnalysisColor(""); setAnalysisFabric(null); setDetailEdits(null); setNewEntryColor("");
      loadOrder(selectedMaterialKey);
    } else {
      loadCard(selectedMaterialKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterialKey]);

  useEffect(() => {
    if (isOrder) loadAnalysis(analysisColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisColor]);

  // A Fabric that applies to only one color needs no choice — preselect it for the panel and new entries.
  useEffect(() => {
    if (isOrder && orderView?.colors.length === 1) {
      if (!analysisColor) setAnalysisColor(orderView.colors[0]);
      if (!newEntryColor) setNewEntryColor(orderView.colors[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderView]);

  // Every mutation below (detail save, entry add/edit/delete, size edit) returns the FULL,
  // freshly-recomputed card — applied straight back to state so Cut/Less/Over/Grand Total and
  // every entry's own Factory label are always exactly what the DB now holds, never a locally
  // guessed delta. Complete Order reloads its consolidated view instead.
  const applyUpdatedCard = async (updated: any) => {
    if (isOrder) {
      if (selectedFabric) await loadOrder(selectedFabric.materialKey);
      return;
    }
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

  // The color an entry is saved under: always the entry's own (Complete Order lists every color).
  const colorOf = (entry: CuttingEntry) => (isOrder ? entry.color ?? "" : productionColor);

  const saveDetail = () => enqueueMutation(async () => {
    const color = isOrder ? analysisColor : productionColor;
    if (!workOrderId || !color || !selectedFabric || !detailEdits) return;
    setSavingDetail(true);
    try {
      const { cuttingLossPercent, ...toSend } = detailEdits; // never sent — always server-computed
      const updated: any = await legacyErpApi.workOrders.cuttingCard.saveDetail(workOrderId, color, selectedFabric.materialKey, selectedFabric.materialLabel, toSend);
      if (isOrder) setDetailEdits((updated as CuttingCardData).detail);
      else await applyUpdatedCard(updated);
      toast.success(isOrder ? `Cutting Analysis Detail saved for ${color}` : "Cutting Analysis Detail saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save Cutting Analysis Detail");
    } finally {
      setSavingDetail(false);
    }
  });

  const addEntry = () => enqueueMutation(async () => {
    const color = isOrder ? newEntryColor : productionColor;
    if (!workOrderId || !selectedFabric) return;
    if (!color) { toast.error("Select the Production Color this Cutting Entry is for."); return; }
    setAddingEntry(true);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.addEntry(workOrderId, color, selectedFabric.materialKey, selectedFabric.materialLabel);
      await applyUpdatedCard(updated);
    } catch (e: any) {
      toast.error(e.message || "Failed to add Cutting Entry");
    } finally {
      setAddingEntry(false);
    }
  });

  const patchEntry = (entry: CuttingEntry, patch: { date?: string | null; factoryId?: number | null; partyNo?: string | null; document?: string | null; explanation?: string | null }) => enqueueMutation(async () => {
    if (!workOrderId || !colorOf(entry) || !selectedFabric) return;
    setBusyEntryId(entry.id);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.updateEntry(workOrderId, colorOf(entry), selectedFabric.materialKey, selectedFabric.materialLabel, entry.id, patch);
      await applyUpdatedCard(updated);
    } catch (e: any) {
      toast.error(e.message || "Failed to update Cutting Entry");
    } finally {
      setBusyEntryId(null);
    }
  });

  const setEntrySize = (entry: CuttingEntry, sizeCode: string, quantity: number) => enqueueMutation(async () => {
    if (!workOrderId || !colorOf(entry) || !selectedFabric) return;
    setBusyEntryId(entry.id);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.setEntrySize(workOrderId, colorOf(entry), selectedFabric.materialKey, selectedFabric.materialLabel, entry.id, sizeCode, quantity);
      await applyUpdatedCard(updated);
    } catch (e: any) {
      toast.error(e.message || "Failed to save Cut quantity");
    } finally {
      setBusyEntryId(null);
    }
  });

  const deleteEntry = (entry: CuttingEntry) => enqueueMutation(async () => {
    if (!workOrderId || !colorOf(entry) || !selectedFabric) return;
    if (!window.confirm(isOrder
      ? `Delete this ${colorOf(entry)} Cutting Entry? Its own logged Cut quantities will be removed from the totals below.`
      : "Delete this Cutting Entry? Its own logged Cut quantities will be removed from the totals below.")) return;
    setBusyEntryId(entry.id);
    try {
      const updated = await legacyErpApi.workOrders.cuttingCard.deleteEntry(workOrderId, colorOf(entry), selectedFabric.materialKey, selectedFabric.materialLabel, entry.id);
      await applyUpdatedCard(updated);
      toast.success("Cutting Entry deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete Cutting Entry");
    } finally {
      setBusyEntryId(null);
    }
  });

  const close = () => closeTab(tabCtx?.tabKey ?? (isOrder ? "/legacy-erp/cutting-card/order" : "/legacy-erp/cutting-card/entry"));

  const th = "border-r border-border/70 bg-slate-700 dark:bg-slate-800 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-white h-7 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const labelTd = "border-r border-b border-border/50 px-2 text-[11.5px] font-medium";
  const sideLabel = "text-[11px] text-muted-foreground";
  const sideValue = "flex h-7 items-center rounded border bg-muted/30 px-2 text-[11.5px] truncate";
  const sideInput = "h-7 w-full rounded border bg-background px-2 text-[11.5px] outline-none focus:ring-1 focus:ring-primary/40";
  const cellInput = "h-7 w-full bg-transparent px-1.5 text-[11px] outline-none focus:bg-accent/50";

  if (!workOrderId || (!isOrder && !productionColor)) {
    return (
      <div className="p-4">
        <p className="mt-3 text-sm text-muted-foreground">
          {isOrder
            ? "Open this from the Cutting Card screen — search a Work Order, choose Cutting Mode \"Complete Order\", then click Cutting."
            : "Open this from the Cutting Card screen — search a Work Order, select a Production Color, then click Cutting."}
        </p>
      </div>
    );
  }

  const fabricColors = selectedFabric?.colors ?? [];
  const colorChoice = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-[11.5px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{(orderView?.colors ?? fabricColors).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="grid grid-cols-12 gap-4 p-4">
      <div className="col-span-12 xl:col-span-9 space-y-3">
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
            <p className="text-sm font-medium truncate" title={isOrder ? (orderView?.colors ?? fabricColors).join(", ") : undefined}>
              {isOrder ? `Complete Order${(orderView?.colors ?? fabricColors).length ? ` (${(orderView?.colors ?? fabricColors).length} colors)` : ""}` : productionColor}
            </p>
          </div>
          <div className="col-span-12 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {isOrder ? (
              <>
                <span>Cutting Mode: <span className="font-medium text-foreground">Complete Order</span> — quantities of all colors are added up by size; every entry stays with its own color.</span>
                {(orderView?.colors ?? []).map((c) => (
                  <Button key={c} variant="link" size="sm" className="h-auto p-0 text-[11px]"
                    onClick={() => navigateOrOpenTab(router, cuttingHref("color", workOrderId, c), { title: `Cutting — ${c}` })}>
                    {c} (Colour-wise)
                  </Button>
                ))}
              </>
            ) : (
              <>
                <span>Cutting Mode: <span className="font-medium text-foreground">Colour-wise</span> — only {productionColor} is loaded and saved here.</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-[11px]"
                  onClick={() => navigateOrOpenTab(router, cuttingHref("order", workOrderId), { title: `Cutting — ${workOrder?.workOrderNo ?? "Complete Order"}` })}>
                  Switch to Complete Order
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fabric</label>
          {loadingFabrics ? (
            <Skeleton className="h-9 w-full" />
          ) : !fabrics.length ? (
            <p className="text-xs text-muted-foreground">
              {isOrder
                ? "No applicable Fabric requirements resolved for this Work Order's Production Colors — check its BOM (own or linked Style Card's) has a Fabric item mapped to its colors, or that applies to every color."
                : `No applicable Fabric requirements resolved for ${productionColor} on this Work Order — check its BOM (own or linked Style Card's) has a Fabric item mapped to this color, or that applies to every color.`}
            </p>
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
                    {isOrder
                      ? ` (${f.colors?.join(", ")})`
                      : (f.colorCode || f.colorName) ? ` [${f.colorCode || f.colorName}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!selectedMaterialKey ? (
          <p className="text-sm text-muted-foreground">
            {isOrder
              ? "Select a Fabric above to load its Cutting Entries for every color and the Order / Will Be Cut / Cut sizes of the complete order."
              : "Select a Fabric above to load its Cutting Entries and Order / Will Be Cut / Cut sizes."}
          </p>
        ) : loadingCard && !view ? (
          <Skeleton className="h-56 w-full" />
        ) : !view?.sizes.length ? (
          <p className="text-xs text-muted-foreground">No sizes configured for this Work Order/Style Card yet.</p>
        ) : (
          <>
            {/* Cutting Entries — one real, persisted row per actual cutting batch. The Cutting
                Summary's own "Cut" row below is always the live SUM of these, never a second
                editable number. */}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Cutting Entries</p>
                <div className="flex items-center gap-2">
                  {isOrder && (
                    <div className="w-48" title="The Production Color the new Cutting Entry's quantities belong to">
                      {colorChoice(newEntryColor, setNewEntryColor, "Color for new entry...")}
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={addEntry} disabled={addingEntry || (isOrder && !newEntryColor)}>
                    <Plus className="h-3 w-3 mr-1" />{addingEntry ? "Adding..." : "Add Cutting Entry"}
                  </Button>
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className={cn("w-full table-fixed border-collapse text-[11.5px]", isOrder ? "min-w-[1020px]" : "min-w-[900px]")}>
                  <thead><tr className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white">
                    {isOrder && <th className={th} style={{ width: 120 }}>Color</th>}
                    <th className={th} style={{ width: 110 }}>Date</th>
                    <th className={th} style={{ width: 130 }}>Factory</th>
                    <th className={th} style={{ width: 140 }}>Factory Name</th>
                    <th className={th} style={{ width: 100 }}>Party No</th>
                    <th className={th} style={{ width: 110 }}>Document</th>
                    <th className={th} style={{ width: 150 }}>Explanation</th>
                    {view.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 70 }}>{s}</th>)}
                    <th className={`${th} text-right`} style={{ width: 90 }}>Total</th>
                    <th className={th} style={{ width: 32 }} />
                  </tr></thead>
                  <tbody>
                    {!view.entries.length ? (
                      <tr><td className={labelTd} colSpan={(isOrder ? 8 : 7) + view.sizes.length}><span className="flex h-7 items-center text-muted-foreground">
                        {isOrder ? "No Cutting Entries logged for this Fabric yet — choose a color and click \"Add Cutting Entry\" to log the first cutting batch." : "No Cutting Entries logged yet — click \"Add Cutting Entry\" to log the first cutting batch."}
                      </span></td></tr>
                    ) : view.entries.map((entry) => {
                      const busy = busyEntryId === entry.id;
                      return (
                        <tr key={entry.id} className={cn(busy && "opacity-60", isOrder && entry.color === analysisColor && "bg-primary/5")}>
                          {isOrder && (
                            <td className={labelTd}>
                              <button type="button" className="flex h-7 w-full items-center truncate font-semibold hover:underline" title="Show this color's Cutting Analysis Detail" onClick={() => setAnalysisColor(entry.color ?? "")}>
                                {entry.color}
                              </button>
                            </td>
                          )}
                          <td className={td}>
                            <DatePicker className={cellInput} disabled={busy}
                              defaultValue={entry.date ? entry.date.slice(0, 10) : ""}
                              onChange={(e) => patchEntry(entry, { date: e.target.value || null })}
                            />
                          </td>
                          <td className={td}>
                            <MasterAutocompleteField
                              label="Factory" compact masterKey="currentAccount"
                              displayValue={entry.factoryCode || ""}
                              fetchOptions={(t) => legacyErpApi.accounts.list(t) as Promise<any[]>}
                              onSelect={(o: MasterOption) => patchEntry(entry, { factoryId: Number(o.id) })}
                              onClear={() => patchEntry(entry, { factoryId: null })}
                            />
                          </td>
                          <td className={td}><span className="flex h-7 items-center px-1.5 truncate text-muted-foreground">{entry.factoryName || "—"}</span></td>
                          <td className={td}><input className={cellInput} disabled={busy} defaultValue={entry.partyNo || ""} onBlur={(e) => e.target.value !== (entry.partyNo || "") && patchEntry(entry, { partyNo: e.target.value })} /></td>
                          <td className={td}><input className={cellInput} disabled={busy} defaultValue={entry.document || ""} onBlur={(e) => e.target.value !== (entry.document || "") && patchEntry(entry, { document: e.target.value })} /></td>
                          <td className={td}><input className={cellInput} disabled={busy} defaultValue={entry.explanation || ""} onBlur={(e) => e.target.value !== (entry.explanation || "") && patchEntry(entry, { explanation: e.target.value })} /></td>
                          {view.sizes.map((s) => (
                            <td key={s} className={td}>
                              <EditableGridInput
                                type="number" align="right" className={`${cellInput} text-right font-mono`} value={entry.sizes[s] ?? ""} disabled={busy} nonNegative
                                onChange={(v) => setEntrySize(entry, s, normalizeNonNegative(v))}
                              />
                            </td>
                          ))}
                          <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(entry.total, "quantity").toLocaleString()}</span></td>
                          <td className={`${td} text-center`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={busy} onClick={() => deleteEntry(entry)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
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
                Cutting Summary{isOrder && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— Complete Order, all {view.colors.length} colors added up by size</span>}
                <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(Extra Cutting {view.extraCuttingPercent}% applied, rounded up per size — Cut is the sum of the Cutting Entries above)</span>
              </p>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[700px] table-fixed border-collapse text-[11.5px]">
                  <thead><tr className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white">
                    <th className={th} style={{ width: 140 }} />
                    {view.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 85 }}>{s}</th>)}
                    <th className={`${th} text-right`} style={{ width: 110 }}>Total Quantity</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Order</span></td>
                      {view.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.orderQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(view.totals.orderQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className={labelTd}><span className="flex h-7 items-center">Will Be Cut</span></td>
                      {view.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.willBeCutQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(view.totals.willBeCutQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Cut</span></td>
                      {view.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono">{round(r.cutQty, "quantity").toLocaleString()}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium">{round(view.totals.cutQty, "quantity").toLocaleString()}</span></td>
                    </tr>
                    <tr className="bg-muted/20">
                      <td className={labelTd}><span className="flex h-7 items-center">Less</span></td>
                      {view.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono text-amber-700 dark:text-amber-400">{r.less ? round(r.less, "quantity").toLocaleString() : "—"}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium text-amber-700 dark:text-amber-400">{view.totals.less ? round(view.totals.less, "quantity").toLocaleString() : "—"}</span></td>
                    </tr>
                    <tr>
                      <td className={labelTd}><span className="flex h-7 items-center">Over</span></td>
                      {view.rows.map((r) => <td key={r.sizeCode} className={td}><span className="flex h-7 items-center justify-end px-2 font-mono text-blue-700 dark:text-blue-400">{r.over ? round(r.over, "quantity").toLocaleString() : "—"}</span></td>)}
                      <td className={td}><span className="flex h-7 items-center justify-end px-2 font-mono font-medium text-blue-700 dark:text-blue-400">{view.totals.over ? round(view.totals.over, "quantity").toLocaleString() : "—"}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" onClick={saveDetail} disabled={(isOrder ? !analysisColor || !detailEdits : !card) || savingDetail}>{savingDetail ? "Saving..." : "Save"}</Button>
          <Button variant="outline" size="sm" onClick={close} className="ml-auto">Close</Button>
        </div>
      </div>

      {/* Cutting Analysis Detail — top block is read-only reference from the SELECTED Fabric's own
          resolved BOM line (Variant-1/2, Material Color, Marker Width/Length, M2 Weight, Wastage —
          the exact same fields the Work Order's own BOM tab already manages for this line); never
          fabricated, "—" when this line genuinely has no such value. Everything below that is
          real, editable, DB-backed CuttingCard data (saved via the page's own Save button above) —
          Cutting Loss % is the one exception, always computed live from Marker/Actual Grams,
          never itself stored (see cutting-card.service.ts's own comment on why). Stored per
          (Color, Fabric): in Complete Order the panel's own Color choice says which one. */}
      <div className="col-span-12 xl:col-span-3 space-y-3 rounded-md border p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Cutting Analysis Detail</p>
        {isOrder && selectedFabric && (
          <div>
            <label className={sideLabel}>Production Color</label>
            {colorChoice(analysisColor, setAnalysisColor, "Select a color...")}
            <p className="mt-1 text-[10.5px] text-muted-foreground">Analysis is kept per color — or click a color in the Cutting Entries grid.</p>
          </div>
        )}
        {!selectedFabric || (isOrder && !analysisColor) || !detailEdits ? (
          <p className="text-xs text-muted-foreground">{!selectedFabric ? "Select a Fabric to see its details." : isOrder && !analysisColor ? "Select a color to see its Cutting Analysis Detail." : "Loading..."}</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div><label className={sideLabel}>Fabric</label><p className={sideValue}>{[panelFabric?.inventoryCode ?? selectedFabric.inventoryCode, panelFabric?.inventoryName ?? selectedFabric.inventoryName].filter(Boolean).join(" — ") || "—"}</p></div>
              <div><label className={sideLabel}>Recipe Description</label><p className={sideValue}>{(isOrder ? view?.materialLabel : card?.materialLabel) || "—"}</p></div>
              <div><label className={sideLabel}>Variant-1</label><p className={sideValue}>{panelFabric?.variant1 || "—"}</p></div>
              <div><label className={sideLabel}>Variant-2</label><p className={sideValue}>{panelFabric?.variant2 || "—"}</p></div>
              <div><label className={sideLabel}>Material Color</label><p className={sideValue}>{panelFabric?.colorCode || panelFabric?.colorName || "—"}</p></div>
              <div><label className={sideLabel}>Marker Width (Meter)</label><p className={sideValue}>{panelFabric?.markerWidth ?? "—"}</p></div>
              <div><label className={sideLabel}>Marker Length (Meter)</label><p className={sideValue}>{panelFabric?.markerLength ?? "—"}</p></div>
              <div><label className={sideLabel}>Weight/m2 (Gr)</label><p className={sideValue}>{panelFabric?.m2Weight ?? "—"}</p></div>
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
