"use client";

// Fabric/Trim/Yarn Requirements — legacy-ERP reference screen. Reuses existing infrastructure
// only: Work Order (legacyErpApi.workOrders, MA_WorkOrder/MA_Recipe/MA_RecipeItem), Style Card
// (plmApi.styleCards, browse/preview only — MA_WorkOrder has no column that durably links a
// StyleCard, confirmed via a live schema search), the Work Order's own BOM (listBom) as the
// Fabric/Trim Requirements source (MA_RecipeItem already natively distinguishes them via
// RecipeType), and each Fabric row's own Yarn Recipe (legacyErpApi.fabricCards.getYarnRecipe)
// exploded server-side for the Yarn Requirements source (see
// nexuscore-backend/src/modules/legacy-erp/fabric-yarn-requirements.service.ts). No new masters,
// no new Order/Style/Inventory/Transaction tables.
//
// `?type=fabric|trim|yarn` drives which tab this screen is; opened via navigateOrOpenTab with an
// explicit title so "Fabric Requirements"/"Trim Requirements"/"Yarn Requirements" can each be
// independently open workspace tabs at once (see lib/workspace/registry.tsx's
// MULTI_KEY_ROUTES/resolveTabKey). Identical layout/workflow for all three — only the title and
// which material the grids load differ.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportGrid, type ReportColumn } from "./_components/report-grid";

interface StyleCardLookupRow extends CardLookupRow { raw: any }

type RequirementTab = "fabric" | "trim" | "yarn";

interface RequirementRow {
  id: string | number;
  inventoryId: number | null;
  inventoryCode: string | null;
  inventoryName: string | null;
  process: string | null;
  variant1: string | null;
  variant1Explanation: string | null;
  variant2: string | null;
  variant2Explanation: string | null;
  // Consumption (this BOM item's own existing per-unit Quantity/formula, unchanged) x Applicable
  // Quantity (the production quantity resolved for this item's own Variant-1/Color, or the Work
  // Order's total when no color matches — see fabric-yarn-requirements.service.ts's
  // resolveApplicableQuantity) = quantity, the final calculated requirement. Kept as three
  // separate fields (not just the one final number) so the grid can show input vs. calculated
  // clearly, per this screen's own "distinguish configuration from calculated requirement" goal.
  consumption: number;
  applicableQuantity: number;
  matchedColor: string | null;
  quantity: number;
}

interface TotalRow { id: string | number; inventoryId: any; inventoryCode: string | null; inventoryName: string | null; quantity: number }

interface ManufacturingQtySummary { hasAny: boolean; total: number; byColor: { color: string; quantity: number }[] }

interface TransactionRow {
  id: string | number;
  receiptDate: string | null;
  receiptType: number | null;
  subcontractor: string | null;
  receiptNo: string | null;
  documentNo: string | null;
  warehouse: string | null;
  partyNo: string | null;
  specialCode: string | null;
  explanation: string | null;
  currentAccountCode: string | null;
  currentAccountName: string | null;
  grossQuantity: number | null;
  quantity: number | null;
  receiptQuantity: number | null;
}

const attachmentUrl = (a: any) => (String(a?.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a?.url || "").replace(/^\//, "")}`);
const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");

export default function FabricYarnRequirementsPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const typeParam = searchParams.get("type");
  const type: RequirementTab = typeParam === "yarn" || typeParam === "trim" ? typeParam : "fabric";
  const title = type === "yarn" ? "Yarn Requirements" : type === "trim" ? "Trim Requirements" : "Fabric Requirements";
  const initialId = searchParams.get("id");

  const [workOrderId, setWorkOrderId] = useState<number | null>(initialId ? Number(initialId) : null);
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [loadingHeader, setLoadingHeader] = useState(false);
  const [styleCard, setStyleCard] = useState<any>(null);
  const [styleLookupOpen, setStyleLookupOpen] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  const [requirementRows, setRequirementRows] = useState<RequirementRow[]>([]);
  const [totalRows, setTotalRows] = useState<TotalRow[]>([]);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [mfgQty, setMfgQty] = useState<ManufacturingQtySummary | null>(null);
  const [loadingGrids, setLoadingGrids] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadWorkOrder = async (id: number) => {
    setLoadingHeader(true);
    try {
      const wo: any = await legacyErpApi.workOrders.get(id);
      setWorkOrder(wo);
      setWorkOrderId(id);
    } catch (e: any) {
      toast.error(e.message || "Failed to load work order");
    } finally {
      setLoadingHeader(false);
    }
  };

  useEffect(() => {
    if (initialId) loadWorkOrder(Number(initialId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGrids = async (id: number) => {
    setLoadingGrids(true);
    try {
      const [saved, total, transactions, mfgQtySummary] = await Promise.all([
        legacyErpApi.workOrders.requirements.getSaved(id, type).catch(() => []),
        legacyErpApi.workOrders.requirements.getTotal(id, type).catch(() => []),
        legacyErpApi.workOrders.requirements.getTransactions(id).catch(() => []),
        legacyErpApi.workOrders.requirements.getManufacturingQuantity(id).catch(() => null),
      ]);
      // Reload shows the last SAVED requirement (from MA_Requirement) if one exists; otherwise
      // falls back to the live BOM/Yarn-Recipe-derived rows so a never-yet-saved Work Order still
      // shows something meaningful in the Requirements grid. MA_Requirement only ever persists
      // inventoryId+quantity (see save()'s own INSERT column list) — Consumption/Applicable
      // Quantity/matched Color aren't stored there, only the resulting figure is, so a reloaded
      // saved row can't show that breakdown; a fresh Calculate always can.
      const savedList = Array.isArray(saved) ? saved : [];
      if (savedList.length) {
        setRequirementRows(savedList.map((r: any) => ({
          id: r.id, inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName,
          process: null, variant1: null, variant1Explanation: null, variant2: null, variant2Explanation: null,
          consumption: 0, applicableQuantity: 0, matchedColor: null,
          quantity: Number(r.quantity) || 0,
        })));
      } else {
        const grid: any = await legacyErpApi.workOrders.requirements.getGrid(id, type).catch(() => []);
        setRequirementRows(Array.isArray(grid) ? grid : []);
      }
      setTotalRows(Array.isArray(total) ? total : []);
      setTransactionRows(Array.isArray(transactions) ? transactions : []);
      setMfgQty(mfgQtySummary as ManufacturingQtySummary | null);
    } finally {
      setLoadingGrids(false);
    }
  };

  useEffect(() => {
    if (workOrderId) loadGrids(workOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, type]);

  const onStyleSelected = async (row: StyleCardLookupRow) => {
    setStyleLookupOpen(false);
    try {
      const full: any = await plmApi.styleCards.get(String(row.raw.id));
      setStyleCard(full);
    } catch (e: any) {
      toast.error(e.message || "Failed to load style card");
    }
  };

  const styleImage = (Array.isArray(styleCard?.attachments) ? styleCard.attachments : []).find((a: any) => String(a?.type || "").startsWith("image/"));

  const calculate = async () => {
    if (!workOrderId) return;
    setCalculating(true);
    try {
      const total: any = await legacyErpApi.workOrders.requirements.calculate(workOrderId, type);
      setTotalRows(Array.isArray(total) ? total : []);
      toast.success("Requirements calculated");
    } catch (e: any) {
      toast.error(e.message || "Failed to calculate");
    } finally {
      setCalculating(false);
    }
  };

  const save = async () => {
    if (!workOrderId) return;
    setSaving(true);
    try {
      const total: any = await legacyErpApi.workOrders.requirements.save(workOrderId, type);
      setTotalRows(Array.isArray(total) ? total : []);
      toast.success("Requirements saved");
      await loadGrids(workOrderId);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const openTransactionDetail = () => {
    // Opens the existing generic Inventory Receipts screen — no separate Transaction Detail
    // screen exists anywhere in this codebase; reusing this one rather than building a new one,
    // per the task's own "reuse the existing workflow if one already exists" instruction.
    navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?receiptType=11`, { title: "Inventory Receipt" });
  };

  const close = () => {
    closeTab(tabCtx?.tabKey ?? "/dashboard/legacy-erp/fabric-yarn-requirements");
  };

  // Variant-1/Variant-2 stay as the BOM item's own identity/mapping (unchanged) — Applicable Qty
  // makes visible WHICH production quantity that mapping resolved to (a specific matched Color's
  // own total, or "All Colors" when the item is fixed-variant/unmatched and falls back to the
  // whole order), and Requirement is the calculated result. The previous Variant-1/2 Explanation
  // columns are removed here, not just hidden — the backend has never populated them (always
  // null/"—"), so they were pure clutter, not a technical detail worth keeping reachable.
  const requirementColumns: ReportColumn<RequirementRow>[] = [
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 150, render: (r) => r.inventoryCode || "—" },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 240, render: (r) => r.inventoryName || "—" },
    { key: "process", label: "Process", defaultWidth: 130, render: (r) => r.process || "—" },
    { key: "variant1", label: "Variant-1", defaultWidth: 110, render: (r) => r.variant1 || "—" },
    { key: "variant2", label: "Variant-2", defaultWidth: 110, render: (r) => r.variant2 || "—" },
    { key: "consumption", label: "Consumption", defaultWidth: 110, align: "right", render: (r) => round(r.consumption, "quantity").toLocaleString() },
    {
      key: "applicableQuantity", label: "Applicable Qty", defaultWidth: 150, align: "right",
      render: (r) => (
        <span title={r.matchedColor ? `Matched Manufacturing Quantity Color "${r.matchedColor}"` : "No matching Color — using the Work Order's total production quantity across every Color/Size"}>
          {round(r.applicableQuantity, "quantity").toLocaleString()}
          <span className="ml-1 text-[10px] text-muted-foreground">{r.matchedColor || "All Colors"}</span>
        </span>
      ),
    },
    { key: "quantity", label: "Requirement", defaultWidth: 120, align: "right", render: (r) => <span className="font-medium">{round(r.quantity, "quantity").toLocaleString()}</span> },
  ];

  const totalColumns: ReportColumn<TotalRow>[] = [
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 160, render: (r) => r.inventoryCode || "—" },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 320, render: (r) => r.inventoryName || "—" },
    { key: "quantity", label: "Quantity", defaultWidth: 130, align: "right", render: (r) => round(r.quantity, "quantity").toLocaleString() },
  ];

  const transactionColumns: ReportColumn<TransactionRow>[] = [
    { key: "receiptDate", label: "Receipt Date", defaultWidth: 110, render: (r) => fmtDate(r.receiptDate) },
    { key: "receiptType", label: "Receipt Type", defaultWidth: 150, render: (r) => (r.receiptType != null ? String(r.receiptType) : "—") },
    { key: "subcontractor", label: "Subcontractor", defaultWidth: 160, render: (r) => r.subcontractor || "—" },
    { key: "receiptNo", label: "Receipt No", defaultWidth: 110, render: (r) => r.receiptNo || "—" },
    { key: "documentNo", label: "Document No", defaultWidth: 110, render: (r) => r.documentNo || "—" },
    { key: "warehouse", label: "Warehouse", defaultWidth: 130, render: (r) => r.warehouse || "—" },
    { key: "partyNo", label: "Party No", defaultWidth: 100, render: (r) => r.partyNo || "—" },
    { key: "specialCode", label: "Special Code", defaultWidth: 110, render: (r) => r.specialCode || "—" },
    { key: "explanation", label: "Explanation", defaultWidth: 200, render: (r) => r.explanation || "—" },
    { key: "currentAccount", label: "Current Account", defaultWidth: 200, render: (r) => (r.currentAccountName ? `${r.currentAccountCode ? r.currentAccountCode + " — " : ""}${r.currentAccountName}` : "—") },
    { key: "grossQuantity", label: "Gross Quantity", defaultWidth: 120, align: "right", render: (r) => round(r.grossQuantity ?? 0, "quantity").toLocaleString() },
    { key: "quantity", label: "Quantity", defaultWidth: 100, align: "right", render: (r) => round(r.quantity ?? 0, "quantity").toLocaleString() },
    { key: "receiptQuantity", label: "Receipt Quantity", defaultWidth: 130, align: "right", render: (r) => round(r.receiptQuantity ?? 0, "quantity").toLocaleString() },
  ];

  return (
    <div className="space-y-4 p-4">
      <LegacyErpBreadcrumb trail={[{ label: "Legacy ERP" }, { label: title }]} />

      <div className="grid grid-cols-12 gap-3 rounded-md border p-3">
        <div className="col-span-3 space-y-1">
          <label className="text-xs text-muted-foreground">Order No</label>
          <MasterAutocompleteField
            label="" compact masterKey="manufacturing-order"
            displayValue={workOrder?.workOrderNo || ""}
            fetchOptions={(t) => legacyErpApi.lookupTable("manufacturing-order", t) as Promise<MasterOption[]>}
            onSelect={(o) => loadWorkOrder(Number(o.id))}
            onClear={() => { setWorkOrder(null); setWorkOrderId(null); setRequirementRows([]); setTotalRows([]); setTransactionRows([]); setMfgQty(null); }}
          />
        </div>
        <div className="col-span-4 space-y-1">
          <label className="text-xs text-muted-foreground">Style No</label>
          <button
            type="button"
            onClick={() => setStyleLookupOpen(true)}
            className="flex h-8 w-full items-center rounded-md border border-input bg-transparent px-2 text-left text-sm hover:bg-accent/50"
          >
            {styleCard ? `${styleCard.styleNumber} - ${styleCard.title}` : <span className="text-muted-foreground">Select a style...</span>}
          </button>
        </div>
        <div className="col-span-2 flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={showTransactions} onCheckedChange={(v) => setShowTransactions(!!v)} />
            Transactions
          </label>
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">Delivery Date</label>
          <p className="text-sm">{fmtDate(workOrder?.deliveryDate)}</p>
        </div>
        <div className="col-span-1 space-y-1">
          <label className="text-xs text-muted-foreground">Shipment Date</label>
          <p className="text-sm">{fmtDate(workOrder?.shipmentDate)}</p>
        </div>

        <div className="col-span-10">
          {loadingHeader && <Skeleton className="h-4 w-48" />}
        </div>
        <div className="col-span-2 flex justify-end">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border">
            {styleImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachmentUrl(styleImage)} alt={styleCard?.title || "Style"} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageOff className="h-5 w-5" /></div>
            )}
          </div>
        </div>
      </div>

      {/* Production Quantities — the Order/Manufacturing side of the calculation below, read
          straight from this Work Order's own existing Manufacturing Quantities grid (C/S Details
          tab). Shown as a compact inline strip (not a KPI-card layout) purely so a user can see
          WHAT quantity each BOM item's own Applicable Qty column resolved against, without having
          to leave this screen or re-derive it themselves. */}
      {workOrderId && (
        <div className="rounded-md border p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Production Quantities</p>
          {!mfgQty || !mfgQty.hasAny ? (
            <p className="text-xs text-muted-foreground">
              No Manufacturing Quantities entered yet — enter them on this Work Order's own "C/S Details" tab, then Calculate here to size each BOM item's requirement to the actual production run.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {mfgQty.byColor.map((c) => (
                <span key={c.color} className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                  <span className="text-muted-foreground">{c.color}:</span> {round(c.quantity, "quantity").toLocaleString()}
                </span>
              ))}
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium">
                Total: {round(mfgQty.total, "quantity").toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* The three sections below always render — the selected Order controls what DATA they
          show (rows may legitimately be empty), never whether the grid structure itself exists.
          Each ReportGrid already renders its full header/columns even with zero rows, showing
          `emptyLabel` as a single centered row inside the table body, not a page-level swap. */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Requirements</p>
        <ReportGrid
          storageKey={`requirementsGrid-${type}`}
          columns={requirementColumns}
          rows={requirementRows}
          loading={loadingGrids}
          emptyLabel={workOrderId ? "No requirements yet — add BOM lines on this Work Order's own BOM tab first." : "Select an Order No above to load its requirements."}
        />
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Total Requirements Table</p>
        <ReportGrid
          storageKey="totalRequirementsGrid"
          columns={totalColumns}
          rows={totalRows}
          loading={loadingGrids}
          emptyLabel={workOrderId ? "No totals yet — click Calculate." : "Select an Order No above to load its totals."}
        />
      </div>

      {/* Transactions checkbox above now actually controls this section, instead of being inert. */}
      {showTransactions && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Transaction Details</p>
          <ReportGrid
            storageKey="transactionDetailsGrid"
            columns={transactionColumns}
            rows={transactionRows}
            loading={loadingGrids}
            emptyLabel={workOrderId ? "No outside-process receipts linked to this Work Order yet." : "Select an Order No above to load its transactions."}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" onClick={calculate} disabled={!workOrderId || calculating}>{calculating ? "Calculating..." : "Calculate"}</Button>
        <Button size="sm" onClick={save} disabled={!workOrderId || saving}>{saving ? "Saving..." : "Save"}</Button>
        <Button variant="outline" size="sm" onClick={openTransactionDetail}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" />Transaction Detail
        </Button>
        <Button variant="outline" size="sm" onClick={close} className="ml-auto">Close</Button>
      </div>

      <CardLookupDialog<StyleCardLookupRow>
        open={styleLookupOpen}
        onOpenChange={setStyleLookupOpen}
        title="Select Style"
        fetchOptions={async (search) => {
          const res: any = await plmApi.styleCards.list({ limit: 50, ...(search ? { search } : {}) });
          const rows = Array.isArray(res) ? res : res?.data || [];
          return rows.map((c: any): StyleCardLookupRow => ({ id: c.id, inventoryCode: c.styleNumber, inventoryName: c.title, inUse: c.status !== "archived", raw: c }));
        }}
        onSelect={onStyleSelected}
      />
    </div>
  );
}
