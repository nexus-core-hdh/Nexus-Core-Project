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
import { ImageOff, ExternalLink, Lock, LockOpen, Trash2, ListX } from "lucide-react";
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
import { RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  // Multi-Color BOM — Material Color (the BOM line's real "Choose Color" -> ColorCard selection),
  // deliberately separate from `matchedColor`/`variant1` above (the GARMENT color a line applies
  // to). A "BLUE" garment can need "ROYAL BLUE" fleece — these are never the same identity.
  colorCardId?: string | null;
  colorCode?: string | null;
  colorName?: string | null;
}

interface TotalRow {
  id: string | number; inventoryId: any; inventoryCode: string | null; inventoryName: string | null; quantity: number;
  colorCardId?: string | null; colorCode?: string | null; colorName?: string | null;
}

interface ManufacturingQtySummary { hasAny: boolean; total: number; byColor: { color: string; quantity: number }[]; extraCuttingPercent?: number }

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
  // Multi-Color BOM mapping validation — non-fatal warnings only (see the backend's own comment
  // on why this never blocks Calculate/Save). Scoped by (workOrderId, type) exactly like every
  // other piece of state on this screen.
  const [mappingWarnings, setMappingWarnings] = useState<string[]>([]);
  const [loadingGrids, setLoadingGrids] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lock status — plain component state is the correct scope here, not anything global: this
  // component itself is already one mounted instance PER Work Order tab AND per Requirement type
  // (Fabric/Yarn/Trim are independently-keyed workspace tabs via MULTI_KEY_ROUTES' own ?type=
  // param — see registry.tsx), so a lock-status useState here can never leak between types or
  // between two different Work Orders' own tabs; each gets its own instance and its own state.
  const [lockStatus, setLockStatus] = useState<{ isLocked: boolean; lockedAt: string | null; lockedBy: { id: string; name: string } | null; canUnlock: boolean; canLock: boolean } | null>(null);
  const [lockActionBusy, setLockActionBusy] = useState(false);
  // True whenever locked — drives the disabled state on Calculate/Save/Delete/Delete All and the
  // context menu's own item states. Matches the backend's own assertMutationAllowed() exactly:
  // locking now blocks EVERY mutation unconditionally, even for a caller who holds
  // requirements:unlock — the only way past a lock is to explicitly Unlock first (see the
  // backend's own comment on why the previous canUnlock-bypass was a real bug, not a feature).
  const mutationBlocked = !!lockStatus?.isLocked;

  // Row selection — the "Requirements" grid only (the "Total Requirements Table" always reflects
  // a LIVE recomputation, never a stable MA_Requirement id, so it never gets row-level actions).
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | number | null>(null);
  // True only when `requirementRows` is currently showing the last SAVED requirement (its `id` is
  // then a real MA_Requirement.RecId) rather than a freshly-recomputed live preview (whose `id` is
  // just a BOM line id, nothing persisted to delete) — see loadGrids' own comment. Gates whether
  // "Delete" can even be offered on a row.
  const [requirementRowsAreSaved, setRequirementRowsAreSaved] = useState(false);
  // Delete-one confirmation — holds the exact row pending confirmation (not just a boolean), so
  // the dialog can show which record it's about to delete and the actual delete call has an
  // unambiguous target no matter what else changes on screen while the dialog is open.
  const [pendingDeleteRow, setPendingDeleteRow] = useState<RequirementRow | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      const [saved, total, transactions, mfgQtySummary, warnings] = await Promise.all([
        legacyErpApi.workOrders.requirements.getSaved(id, type).catch(() => []),
        legacyErpApi.workOrders.requirements.getTotal(id, type).catch(() => []),
        legacyErpApi.workOrders.requirements.getTransactions(id).catch(() => []),
        legacyErpApi.workOrders.requirements.getManufacturingQuantity(id).catch(() => null),
        legacyErpApi.workOrders.requirements.getMappingWarnings(id, type).catch(() => []),
      ]);
      setMappingWarnings(Array.isArray(warnings) ? warnings : []);
      // Reload shows the last SAVED requirement (from MA_Requirement) if one exists; otherwise
      // falls back to the live BOM/Yarn-Recipe-derived rows so a never-yet-saved Work Order still
      // shows something meaningful in the Requirements grid. MA_Requirement only ever persists
      // inventoryId+quantity (see save()'s own INSERT column list) — Consumption/Applicable
      // Quantity/matched Color aren't stored there, only the resulting figure is, so a reloaded
      // saved row can't show that breakdown; a fresh Calculate always can.
      const savedList = Array.isArray(saved) ? saved : [];
      // A row's own `id` is only ever a real, deletable MA_Requirement.RecId in this branch — the
      // live-preview branch below reuses a BOM line's own id instead, which "Delete" must never
      // be offered against (see requirementRowsAreSaved's own comment).
      setRequirementRowsAreSaved(savedList.length > 0);
      if (savedList.length) {
        setRequirementRows(savedList.map((r: any) => ({
          id: r.id, inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName,
          process: null, variant1: null, variant1Explanation: null, variant2: null, variant2Explanation: null,
          consumption: 0, applicableQuantity: 0, matchedColor: null,
          quantity: Number(r.quantity) || 0,
          colorCardId: r.colorCardId ?? null, colorCode: r.colorCode ?? null, colorName: r.colorName ?? null,
        })));
      } else {
        const grid: any = await legacyErpApi.workOrders.requirements.getGrid(id, type).catch(() => []);
        setRequirementRows(Array.isArray(grid) ? grid : []);
      }
      setTotalRows(Array.isArray(total) ? total : []);
      setTransactionRows(Array.isArray(transactions) ? transactions : []);
      setMfgQty(mfgQtySummary as ManufacturingQtySummary | null);
      // A reload can legitimately drop the row the user had selected (it may no longer be saved,
      // or the list may have changed shape) — never leave a stale selection pointing at nothing.
      setSelectedRequirementId(null);
    } finally {
      setLoadingGrids(false);
    }
  };

  // Real DB round trip, scoped by (workOrderId, type) exactly like every other fetch on this
  // screen — never trusts stale state from a previous Order or the other two Requirement tabs.
  const loadLockStatus = async (id: number) => {
    try {
      const status: any = await legacyErpApi.workOrders.requirements.getLockStatus(id, type);
      setLockStatus(status ?? null);
    } catch {
      setLockStatus(null);
    }
  };

  useEffect(() => {
    if (workOrderId) { loadGrids(workOrderId); loadLockStatus(workOrderId); }
    else setLockStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, type]);

  const lockRequirement = async () => {
    if (!workOrderId) return;
    setLockActionBusy(true);
    try {
      await legacyErpApi.workOrders.requirements.lock(workOrderId, type);
      toast.success(`${title} locked`);
      await loadLockStatus(workOrderId);
    } catch (e: any) {
      toast.error(e.message || "Failed to lock");
    } finally {
      setLockActionBusy(false);
    }
  };

  const unlockRequirement = async () => {
    if (!workOrderId) return;
    setLockActionBusy(true);
    try {
      await legacyErpApi.workOrders.requirements.unlock(workOrderId, type);
      toast.success(`${title} unlocked`);
      await loadLockStatus(workOrderId);
    } catch (e: any) {
      toast.error(e.message || "Failed to unlock — you may not have permission to unlock this Requirement.");
    } finally {
      setLockActionBusy(false);
    }
  };

  // Opens the confirmation dialog for exactly the row that was right-clicked — never "whatever is
  // selected" (selection and the delete target are always the same row by construction: the
  // context menu is bound per-row, and clicking a row also selects it — see the "Requirements"
  // ReportGrid's own onRowClick/getRowActions wiring below).
  const requestDeleteRow = (row: RequirementRow) => {
    if (!requirementRowsAreSaved) {
      toast.error("This is a live preview, not a saved record — Save first, or use Calculate to refresh it.");
      return;
    }
    setSelectedRequirementId(row.id);
    setPendingDeleteRow(row);
  };

  const confirmDeleteRow = async () => {
    if (!workOrderId || !pendingDeleteRow) return;
    setDeleteBusy(true);
    try {
      await legacyErpApi.workOrders.requirements.deleteRecord(workOrderId, type, pendingDeleteRow.id);
      toast.success("Requirement record deleted");
      setPendingDeleteRow(null);
      await Promise.all([loadGrids(workOrderId), loadLockStatus(workOrderId)]);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmDeleteAll = async () => {
    if (!workOrderId) return;
    setDeleteBusy(true);
    try {
      await legacyErpApi.workOrders.requirements.deleteAll(workOrderId);
      toast.success("All Requirement records deleted");
      setDeleteAllDialogOpen(false);
      await Promise.all([loadGrids(workOrderId), loadLockStatus(workOrderId)]);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete all records");
    } finally {
      setDeleteBusy(false);
    }
  };

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

  // save() is self-contained — it independently recomputes getTotalRequirements() server-side
  // (fabric-yarn-requirements.service.ts's own save(), not merely persisting whatever calculate()
  // last returned to the client) before its delete-then-insert into MA_Requirement, so calling it
  // after calculate() can never persist a stale/partial figure — it always saves a fresh,
  // independently-correct calculation. That delete-then-insert is also idempotent by construction
  // (matches this codebase's established BOM-line upsert idiom), so calling it exactly once per
  // successful Calculate can never produce a duplicate row either way.
  const calculate = async () => {
    if (!workOrderId) return;
    setCalculating(true);
    try {
      const total: any = await legacyErpApi.workOrders.requirements.calculate(workOrderId, type);
      setTotalRows(Array.isArray(total) ? total : []);
      toast.success("Requirements calculated");
      // Auto-save only after Calculate has genuinely succeeded — a thrown error above skips
      // straight to the catch block below, so a failed calculation is never persisted.
      await save();
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

  // Quick Actions menu ("⋮", top of the page) — WHOLE-REQUIREMENT-TYPE actions only (Lock/Unlock/
  // Delete All are not tied to any one row). Visibility/disabled state mirrors the backend exactly
  // (lockStatus fields come straight from the same DB round trip assertMutationAllowed() itself
  // checks), so this never shows an action the server would refuse — and never hides one it would
  // actually allow. "Delete" (one record) is intentionally NOT here — see rowActionsFor below; it
  // used to be, wired to a bulk "delete every saved record of this type" call behind a confirmation
  // that misleadingly implied it only affected one row. That bulk behavior is gone — this menu no
  // longer has anything that touches an individual record.
  const requirementActions: RowAction[] = [
    {
      key: "lock", label: "Lock Requirement", icon: Lock, onSelect: lockRequirement,
      disabled: !workOrderId || lockActionBusy || !!lockStatus?.isLocked || (lockStatus != null && !lockStatus.canLock),
      hidden: !!lockStatus?.isLocked,
    },
    {
      key: "unlock", label: "Unlock Requirement", icon: LockOpen, onSelect: unlockRequirement,
      disabled: !workOrderId || lockActionBusy || !lockStatus?.canUnlock,
      hidden: !lockStatus?.isLocked,
    },
    {
      key: "delete-all", label: "Delete All Records", icon: ListX, onSelect: () => setDeleteAllDialogOpen(true),
      disabled: !workOrderId || deleteBusy || mutationBlocked, destructive: true, separatorBefore: true,
    },
  ];

  // Per-row "Delete" — the "Requirements" grid's own right-click menu (see its ReportGrid
  // instance's getRowActions prop below). Bound to the EXACT row it was invoked on; there is no
  // separate "currently selected row" the action could drift from (see requestDeleteRow's own
  // comment). Hidden entirely when the grid isn't showing saved records at all — there's nothing
  // real to delete yet in that state, so offering a "Delete" that would just 404 serves no one.
  const rowActionsFor = (row: RequirementRow): RowAction[] => [
    {
      key: "delete-row", label: "Delete", icon: Trash2, onSelect: () => requestDeleteRow(row),
      disabled: !workOrderId || deleteBusy || mutationBlocked, destructive: true,
      hidden: !requirementRowsAreSaved,
    },
  ];

  // Three deliberately separate identities, per BOM line:
  // - Variant-1 — the BOM item's own Material Variant/Type (e.g. "Fleece", "Rib", "Twill Tape").
  //   Unchanged meaning/label; never touched by the requirement engine's own matching logic.
  // - Variant-2 — the Production Color this line applies to (matched, case-insensitively, against
  //   this Work Order's own Manufacturing Quantities by fabric-yarn-requirements.service.ts's own
  //   resolveApplicableQuantity — see Applicable Qty's own tooltip just below for which color
  //   actually matched). Relabeled here (unlike Variant-1) because it has no other established
  //   meaning anywhere in this codebase to protect — see bom-tab.tsx's own columnDefsForTab
  //   comment for the same relabel on the BOM edit grid itself.
  // - Material Color — the real ColorCard selection ("Choose Color" on the BOM grid), e.g. "NAVY".
  // The previous Variant-1/2 Explanation columns are removed here, not just hidden — the backend
  // has never populated them (always null/"—"), so they were pure clutter, not a technical detail
  // worth keeping reachable.
  const requirementColumns: ReportColumn<RequirementRow>[] = [
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 150, render: (r) => r.inventoryCode || "—" },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 240, render: (r) => r.inventoryName || "—" },
    { key: "process", label: "Process", defaultWidth: 130, render: (r) => r.process || "—" },
    { key: "variant1", label: "Variant-1", defaultWidth: 110, render: (r) => r.variant1 || "—" },
    {
      key: "colorCardId", label: "Material Color", defaultWidth: 140,
      render: (r) => (r.colorCode || r.colorName ? <span>{r.colorCode || r.colorName}{r.colorCode && r.colorName && r.colorCode !== r.colorName ? ` — ${r.colorName}` : ""}</span> : <span className="text-muted-foreground">—</span>),
    },
    { key: "variant2", label: "Production Color", defaultWidth: 130, render: (r) => r.variant2 || <span className="text-muted-foreground">All Colors</span> },
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
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 260, render: (r) => r.inventoryName || "—" },
    {
      key: "colorCardId", label: "Material Color", defaultWidth: 140,
      render: (r) => (r.colorCode || r.colorName ? <span>{r.colorCode || r.colorName}{r.colorCode && r.colorName && r.colorCode !== r.colorName ? ` — ${r.colorName}` : ""}</span> : <span className="text-muted-foreground">—</span>),
    },
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
      <div className="flex items-center justify-between gap-3">
        <LegacyErpBreadcrumb trail={[{ label: "Legacy ERP" }, { label: title }]} />
        <RowActionsMenu actions={requirementActions} />
      </div>

      {/* Lock status — a real, persisted, database-enforced fact (MA_WorkOrder's own per-type
          lock columns), never frontend-only state. Scoped to exactly this Work Order + this
          Requirement type, so it can never show stale data from another Order or leak between
          the independently-tabbed Fabric/Yarn/Trim screens (each is its own mounted instance). */}
      {lockStatus?.isLocked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Locked</span>
            {lockStatus.lockedAt && <>, {fmtDate(lockStatus.lockedAt)}</>}
            {lockStatus.lockedBy && <>, {lockStatus.lockedBy.name}</>}
          </span>
          {lockStatus.canUnlock && (
            <Button size="sm" variant="outline" className="ml-auto h-6 text-[11px]" disabled={lockActionBusy} onClick={unlockRequirement}>
              <LockOpen className="h-3 w-3 mr-1" />Unlock
            </Button>
          )}
        </div>
      )}

      {/* Multi-Color BOM mapping warnings — non-fatal (see the backend's own comment): a BOM
          line's Garment Color doesn't match any of this Work Order's own Manufacturing Quantity
          colors, so it fell back to the Work Order's TOTAL quantity instead of one color's own
          share. Shown so this never happens silently, but never blocks Calculate/Save. */}
      {mappingWarnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Color mapping warning{mappingWarnings.length > 1 ? "s" : ""} — verify before relying on these totals:</p>
          {mappingWarnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      <div className="grid grid-cols-12 gap-3 rounded-md border p-3">
        <div className="col-span-3 space-y-1">
          <label className="text-xs text-muted-foreground">Order No</label>
          <MasterAutocompleteField
            label="" compact masterKey="manufacturing-order"
            displayValue={workOrder?.workOrderNo || ""}
            fetchOptions={(t) => legacyErpApi.lookupTable("manufacturing-order", t) as Promise<MasterOption[]>}
            onSelect={(o) => loadWorkOrder(Number(o.id))}
            onClear={() => { setWorkOrder(null); setWorkOrderId(null); setRequirementRows([]); setTotalRows([]); setTransactionRows([]); setMfgQty(null); setMappingWarnings([]); }}
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
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            Production Quantities
            {!!mfgQty?.extraCuttingPercent && (
              <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(Will Be Cut — Extra Cutting {mfgQty.extraCuttingPercent}% applied, rounded up per size)</span>
            )}
          </p>
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
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Requirements{requirementRowsAreSaved && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(saved — right-click a row to delete it)</span>}
        </p>
        <ReportGrid
          storageKey={`requirementsGrid-${type}`}
          columns={requirementColumns}
          rows={requirementRows}
          loading={loadingGrids}
          emptyLabel={workOrderId ? "No requirements yet — add BOM lines on this Work Order's own BOM tab first." : "Select an Order No above to load its requirements."}
          getRowActions={rowActionsFor}
          selectedId={selectedRequirementId}
          onRowClick={(r) => setSelectedRequirementId(r.id)}
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
        {/* mutationBlocked mirrors the backend's own assertMutationAllowed() exactly (locked =
            blocked, unconditionally, no unlock-permission bypass) — frontend UX blocking here is
            a convenience on top of the real backend enforcement, never a substitute for it (see
            the service's own comment). */}
        <Button size="sm" onClick={calculate} disabled={!workOrderId || calculating || mutationBlocked} title={mutationBlocked ? "Locked — Unlock first to Calculate" : undefined}>{calculating ? "Calculating..." : "Calculate"}</Button>
        <Button size="sm" onClick={save} disabled={!workOrderId || saving || mutationBlocked} title={mutationBlocked ? "Locked — Unlock first to Save" : undefined}>{saving ? "Saving..." : "Save"}</Button>
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

      {/* Delete ONE selected record — the confirmation text names the actual record, never the
          misleading "delete everything of this type" wording the old bulk-wired action used. */}
      <AlertDialog open={!!pendingDeleteRow} onOpenChange={(open) => !open && setPendingDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this selected requirement record
              {pendingDeleteRow?.inventoryCode ? <> ({pendingDeleteRow.inventoryCode}{pendingDeleteRow.inventoryName ? ` — ${pendingDeleteRow.inventoryName}` : ""})</> : null}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={deleteBusy} onClick={confirmDeleteRow}>
              {deleteBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllDialogOpen} onOpenChange={(open) => !open && setDeleteAllDialogOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Records?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all saved Fabric, Trim, and Yarn Requirements for this Work Order?
              <br /><span className="font-medium text-destructive">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={deleteBusy} onClick={confirmDeleteAll}>
              {deleteBusy ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
