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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff, ExternalLink, Lock, LockOpen, Trash2, ListX, Search } from "lucide-react";
import { toast } from "sonner";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { normalizeNonNegative } from "@/lib/numeric-guards";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceTabTitle } from "@/hooks/use-workspace-tab-title";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { RowActionsMenu, PageContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";
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
  // Yarn tab ONLY — the real, resolved FabricYarnRecipeLine.percentage this row's Requirement was
  // computed from (Common or Color-Specific, whichever getYarnRequirements' own
  // resolveEffectiveRecipe call actually used — see that method's own comment). Display-only: never
  // recomputed client-side, never fed back into `quantity`. Undefined for Fabric/Trim rows, which
  // have no recipe % of their own (Consumption there is a real editable BOM Quantity instead).
  recipePercentage?: number;
  // Multi-Color BOM — Material Color (the BOM line's real "Choose Color" -> ColorCard selection),
  // deliberately separate from `matchedColor`/`variant1` above (the GARMENT color a line applies
  // to). A "BLUE" garment can need "ROYAL BLUE" fleece — these are never the same identity.
  colorCardId?: string | null;
  colorCode?: string | null;
  colorName?: string | null;
  // Requirement Calculation Unit — resolved server-side from this material's own Unit tab (the
  // Unit flagged "Requirement Calculation" there — see fabric-yarn-requirements.service.ts's own
  // resolveRequirementUnits). `null` when that item's Unit tab has no Unit flagged yet — never
  // guessed/defaulted client-side; see the mapping-warnings banner for which items need attention.
  requirementUnit?: { id: number; code: string; name: string } | null;
  // Whether THIS specific row currently has a real, persisted MA_Requirement record behind it
  // (see fabric-yarn-requirements.service.ts's own getSavedRequirements) — per-row, not a single
  // page-level flag, since a live-recomputed row with no matching saved group (e.g. a BOM line
  // added since the last Save) is still shown, just not yet deletable. `id` is the real saved
  // RecId when true; otherwise a live/BOM-line id with nothing persisted to delete.
  isSaved?: boolean;
  // The real, always-editable BOM line reference (MA_RecipeItem.id / StyleBomLine UUID / a
  // `::`-suffixed composite for a color-expanded common line) — stays the same regardless of
  // `isSaved`. Material Color/Consumption edits must target THIS, never `id` directly: `id`
  // becomes the matched MA_Requirement.RecId once a row is saved (needed for Delete), which has no
  // relationship to any BOM line and would silently fail if sent to setConsumption/setMaterialColor.
  // Falls back to `id` when absent (the never-saved getGrid() fallback path, where `id` already IS
  // the real BOM line id — see loadGrids' own comment).
  lineId?: string | number;
}

// Matches the legacy reference screen's own "Total Requirements Table" exactly: GROUP BY
// Inventory Code, SUM(Required), one row per material — no Material Color/Production Color
// breakdown here (that detail lives in the separate Requirements grid above, which is
// color-wise already). See fabric-yarn-requirements.service.ts's own getTotalRequirements
// comment for the full before/after.
interface TotalRow {
  id: string | number; inventoryId: any; inventoryCode: string | null; inventoryName: string | null; quantity: number;
  requirementUnit?: { id: number; code: string; name: string } | null;
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

// Total Requirements, computed from an already-filtered (isSaved-only) row set — mirrors
// fabric-yarn-requirements.service.ts's own getTotalRequirements grouping EXACTLY (GROUP BY
// inventoryId, SUM(quantity), one row per distinct material), just over the rows this reload
// actually shows rather than a second, always-live backend call. This is what keeps Total
// Requirements from showing a material that was just Deleted but whose OTHER color/scope rows are
// still saved — the backend's own getTotal() has no concept of isSaved at all (by design, so
// Calculate's own live preview stays a pure recalculation), so calling it here would silently
// re-include whatever was just deleted.
function aggregateSavedTotals(rows: RequirementRow[]): TotalRow[] {
  const byItem = new Map<string, TotalRow>();
  for (const r of rows) {
    const key = r.inventoryId != null ? String(r.inventoryId) : `unresolved:${r.id}`;
    const existing = byItem.get(key);
    if (existing) existing.quantity += Number(r.quantity) || 0;
    else byItem.set(key, { id: key, inventoryId: r.inventoryId, inventoryCode: r.inventoryCode, inventoryName: r.inventoryName, quantity: Number(r.quantity) || 0, requirementUnit: r.requirementUnit ?? null });
  }
  return Array.from(byItem.values());
}

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
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  // Which item's own receipts Transaction Details is currently scoped to — set by clicking a row
  // on either the Requirements or the Total Requirements grid below. `null` means unfiltered
  // (every receipt for this Work Order, the original/default behavior).
  const [transactionFilter, setTransactionFilter] = useState<{ inventoryId: number | null; colorCardId: string | null; label: string } | null>(null);
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

  // Row selection — highlight only (no row-level actions on Total Requirements: it always
  // reflects a LIVE recomputation, never a stable MA_Requirement id). Clicking either grid's row
  // ALSO scopes Transaction Details to that item — see transactionFilter/loadTransactions above.
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | number | null>(null);
  const [selectedTotalRowId, setSelectedTotalRowId] = useState<string | number | null>(null);
  // True once this Work Order/type has been saved at least once (drives the "(saved...)" label
  // only) — per-row deletability/editability now uses each row's own `isSaved` flag instead (see
  // loadGrids' own comment), since a saved grid can still contain a genuinely new, not-yet-saved
  // row (e.g. a BOM line added after the last Save).
  const [requirementRowsAreSaved, setRequirementRowsAreSaved] = useState(false);
  // Delete-one confirmation — holds the exact row pending confirmation (not just a boolean), so
  // the dialog can show which record it's about to delete and the actual delete call has an
  // unambiguous target no matter what else changes on screen while the dialog is open.
  const [pendingDeleteRow, setPendingDeleteRow] = useState<RequirementRow | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Manual Material Color selection directly on this screen (Fabric/Trim only — Yarn's color is
  // inherited from the Fabric line it was exploded from, nothing of its own to edit here). Only
  // offered on a live-preview row (requirementRowsAreSaved === false), whose `id` is always a real,
  // resolvable BOM line — see setMaterialColorForLine's own comment on what a saved MA_Requirement
  // row's id would mean instead (nothing editable).
  const [colorLookupRowId, setColorLookupRowId] = useState<string | number | null>(null);
  const [settingColorRowId, setSettingColorRowId] = useState<string | number | null>(null);
  const [settingConsumptionRowId, setSettingConsumptionRowId] = useState<string | number | null>(null);

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

  // This screen is opened with an explicit, static workspace-tab title ("Fabric/Yarn/Trim
  // Requirements" — see work-orders/page.tsx's own openRequirements, the only real caller), which
  // takes priority over automatic {Screen} [{Record}] composition (resolveWorkspaceTabTitle's own
  // priority 1 vs 3a) — useWorkspaceRecordLabel alone would silently never take effect here.
  // useWorkspaceTabTitle is the documented escape hatch for exactly this: a screen whose title
  // needs a shape the automatic composer doesn't produce anyway. "{Screen} - {Work Order No}"
  // (plain hyphen) matches this app's own established contextual-tab convention elsewhere (e.g.
  // "Order - W/O-4293", "Style Cards - CA-00028"), not the bracket form resolveWorkspaceTabTitle's
  // own automatic composition would use. Real workOrder.workOrderNo only, never a hardcoded WO —
  // falls back to the plain, unchanged title while no Work Order is loaded (matches this screen's
  // own pre-existing behavior with `onClear` above), and updates automatically whenever workOrder
  // changes (switching Order No, loading a different id, a fresh mount after reload/reopen).
  useWorkspaceTabTitle(workOrder?.workOrderNo ? `${title} - ${workOrder.workOrderNo}` : title);

  const loadGrids = async (id: number) => {
    setLoadingGrids(true);
    try {
      const [saved, hasHistory, transactions, mfgQtySummary, warnings] = await Promise.all([
        legacyErpApi.workOrders.requirements.getSaved(id, type).catch(() => []),
        legacyErpApi.workOrders.requirements.hasHistory(id, type).catch(() => false),
        legacyErpApi.workOrders.requirements.getTransactions(id).catch(() => []),
        legacyErpApi.workOrders.requirements.getManufacturingQuantity(id).catch(() => null),
        legacyErpApi.workOrders.requirements.getMappingWarnings(id, type).catch(() => []),
      ]);
      setMappingWarnings(Array.isArray(warnings) ? warnings : []);
      // Reload shows the last SAVED requirement (from MA_Requirement) if this Work Order/type has
      // ever been saved; otherwise falls back to the live BOM/Yarn-Recipe-derived rows so a
      // never-yet-saved Work Order still shows something meaningful. getSaved() now returns the
      // SAME full-shaped rows Calculate itself shows (Consumption/Applicable Qty/Variant-1/2 are
      // always live-recomputed from the real BOM + current Manufacturing Quantities — MA_Requirement
      // itself only ever persisted the final combined Quantity, see save()'s own INSERT column
      // list), each annotated with `isSaved` — true only for a row that genuinely has a matching
      // persisted MA_Requirement record (and whose `id` is then that record's real RecId, the only
      // thing Delete can target); false for a live row with no saved counterpart yet (e.g. a BOM
      // line added since the last Save). This is what fixes Consumption/Applicable Qty showing
      // 0/blank after reload — they were never actually lost, just never looked up here before.
      const savedList = Array.isArray(saved) ? (saved as RequirementRow[]) : [];
      const persistedOnly = savedList.filter((r) => r.isSaved);
      setRequirementRowsAreSaved(persistedOnly.length > 0);
      if (persistedOnly.length) {
        // Only rows with a REAL, currently-active MA_Requirement record — never a live-but-not-saved
        // one (e.g. a BOM line added, or one just Deleted, since the last Save) on a plain reload.
        // Showing those too was the actual reported bug: after Delete All emptied every saved row,
        // getSaved() still merged in the full live BOM/Recipe recalculation (with isSaved:false), so
        // a "deleted" material kept reappearing looking exactly as before — a real, confirmed DB
        // deletion made invisible by this reload path. Total Requirements is computed HERE, from
        // this same filtered set (not a second live getTotal() call), so it can never show a
        // material that isn't currently visible above it either. An explicit Calculate (which also
        // re-Saves — see calculate()) is the only action allowed to repopulate either grid again.
        setRequirementRows(persistedOnly);
        setTotalRows(aggregateSavedTotals(persistedOnly));
      } else if (hasHistory) {
        // Was saved before, now explicitly emptied (the last row Deleted, or Delete All) — show
        // genuinely empty rather than silently regenerating the live calculation the user just
        // removed. See hasSavedHistory's own backend comment for why this needs its own signal,
        // distinct from "never saved at all" below (both otherwise collapse to the same `[]`).
        setRequirementRows([]);
        setTotalRows([]);
      } else {
        // Genuinely never saved for this Work Order/type — existing live-preview fallback,
        // unchanged, so a Work Order that has never had Calculate/Save run still shows something
        // meaningful to work from.
        const [grid, total]: [any, any] = await Promise.all([
          legacyErpApi.workOrders.requirements.getGrid(id, type).catch(() => []),
          legacyErpApi.workOrders.requirements.getTotal(id, type).catch(() => []),
        ]);
        setRequirementRows(Array.isArray(grid) ? grid.map((r: any) => ({ ...r, isSaved: false })) : []);
        setTotalRows(Array.isArray(total) ? total : []);
      }
      setTransactionRows(Array.isArray(transactions) ? transactions : []);
      setMfgQty(mfgQtySummary as ManufacturingQtySummary | null);
      // A reload can legitimately drop the row the user had selected (it may no longer be saved,
      // or the list may have changed shape) — never leave a stale selection pointing at nothing.
      setSelectedRequirementId(null);
      setSelectedTotalRowId(null);
      // A new/reloaded Work Order's own items are a completely different set — any item-scoped
      // Transaction filter from a previous Order (or a previous Calculate) no longer applies.
      setTransactionFilter(null);
    } finally {
      setLoadingGrids(false);
    }
  };

  // Re-fetches Transaction Details scoped to whichever item was clicked (or unfiltered, the
  // default) — deliberately its OWN fetch, not folded into loadGrids/Calculate, so clicking a row
  // to inspect its receipts never triggers a full BOM/requirement recalculation.
  const loadTransactions = async (id: number, filter: typeof transactionFilter) => {
    setLoadingTransactions(true);
    try {
      const rows: any = await legacyErpApi.workOrders.requirements.getTransactions(id, filter ? { inventoryId: filter.inventoryId, colorCardId: filter.colorCardId } : undefined);
      setTransactionRows(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Transaction Details");
    } finally {
      setLoadingTransactions(false);
    }
  };
  useEffect(() => {
    if (workOrderId) loadTransactions(workOrderId, transactionFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, transactionFilter]);

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
    if (!row.isSaved) {
      toast.error("This row is a live preview, not yet a saved record — Save first, or use Calculate to refresh it.");
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
      await legacyErpApi.workOrders.requirements.deleteAll(workOrderId, type);
      toast.success(`All ${title} deleted`);
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

  // Applies a manually-chosen Material Color to one Requirements row. `type` here is always
  // "fabric" or "trim" (the Material Color column is only rendered for those two tabs — see
  // requirementColumns below), matching setMaterialColorForLine's own DirectBomTab restriction.
  const setMaterialColorForRow = async (row: RequirementRow, colorCardId: string | null) => {
    if (!workOrderId || type === "yarn") return;
    setSettingColorRowId(row.id);
    try {
      await legacyErpApi.workOrders.requirements.setMaterialColor(workOrderId, type, row.id, colorCardId);
      toast.success("Material Color saved");
      await loadGrids(workOrderId);
    } catch (e: any) {
      toast.error(e.message || "Failed to save Material Color");
    } finally {
      setSettingColorRowId(null);
    }
  };

  // Live, client-side recalculation — fires on every keystroke in the Consumption cell (see
  // requirementColumns below), BEFORE any network round trip. Mirrors the exact same formula the
  // backend already uses (Requirement = Consumption x Applicable Quantity — see
  // fabric-yarn-requirements.service.ts's own getMaterialRequirements), never a different one, so
  // this is a client-side PREVIEW of the same calculation, not a second calculation engine. Updates
  // Total Requirements too, by the exact delta this edit contributes to that Item's own grouped
  // total (Total Requirements = SUM of its own detail rows — adjusting one addend by its own delta
  // is mathematically identical to re-summing the whole group). Matches every OTHER row sharing the
  // same underlying BOM line too (`lineId`) — a common material's color-expansion all shares ONE
  // real Consumption value, so editing any one of its color rows must visibly move all of them
  // together, exactly like the real backend consequence (see setConsumptionForRow's own comment on
  // why `lineId`, not `id`, identifies "the same line"). This is a PREVIEW ONLY: the eventual
  // authoritative values always come from the server, via setConsumptionForRow's own onBlur-
  // triggered persist + loadGrids() refresh below — never drifts, just shows the right number sooner.
  const applyLocalConsumptionEdit = (row: RequirementRow, newConsumption: number) => {
    const targetLineId = row.lineId ?? row.id;
    // Computed up front from `requirementRows` as already captured by this closure — deliberately
    // NOT inside a setState(prev => ...) updater callback: React does not guarantee an updater
    // function runs synchronously before the next line of surrounding code, so populating
    // `deltaByItem` inside one and reading it immediately after (the first version of this fix)
    // silently read it back empty — confirmed live (RED's own Requirement cell updated correctly,
    // Total Requirements did not move at all). Plain synchronous array methods have no such
    // ordering hazard.
    const deltaByItem = new Map<string, number>();
    const nextRequirementRows = requirementRows.map((r) => {
      if ((r.lineId ?? r.id) !== targetLineId) return r;
      const newQuantity = round(newConsumption * r.applicableQuantity, "quantity");
      if (r.inventoryId != null) {
        const key = String(r.inventoryId);
        deltaByItem.set(key, (deltaByItem.get(key) || 0) + (newQuantity - r.quantity));
      }
      return { ...r, consumption: newConsumption, quantity: newQuantity };
    });
    setRequirementRows(nextRequirementRows);
    if (deltaByItem.size) {
      setTotalRows((prev) => prev.map((t) => {
        const key = t.inventoryId != null ? String(t.inventoryId) : null;
        const delta = key ? deltaByItem.get(key) : undefined;
        return delta ? { ...t, quantity: round(t.quantity + delta, "quantity") } : t;
      }));
    }
  };

  // Applies a manually-typed Consumption (this BOM line's own per-unit Quantity) to one
  // Requirements row — same Fabric/Trim-only restriction and implicit fallback-promotion as
  // Material Color above. Targets `row.lineId` (the real BOM line reference), NOT `row.id` — once a
  // row is saved, `id` becomes the matched MA_Requirement.RecId (needed for Delete), which has no
  // relationship to any BOM line; sending THAT to setConsumption would fail to resolve against
  // ownLines and throw. `lineId` always stays the real, editable BOM line id regardless of
  // `isSaved`, which is exactly what makes editing Consumption on an already-saved row work at all.
  const setConsumptionForRow = async (row: RequirementRow, quantity: number) => {
    if (!workOrderId || type === "yarn") return;
    setSettingConsumptionRowId(row.id);
    try {
      await legacyErpApi.workOrders.requirements.setConsumption(workOrderId, type, row.lineId ?? row.id, quantity);
      toast.success("Consumption saved");
      await loadGrids(workOrderId);
    } catch (e: any) {
      toast.error(e.message || "Failed to save Consumption");
    } finally {
      setSettingConsumptionRowId(null);
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

  // Quick Actions menu ("⋮", top of the page) — WHOLE-REQUIREMENT-TYPE actions (Lock/Unlock/
  // Delete All are not tied to any one row; they always act on this screen's own Requirement
  // type). Visibility/disabled state mirrors the backend exactly (lockStatus fields come straight
  // from the same DB round trip assertMutationAllowed() itself checks), so this never shows an
  // action the server would refuse — and never hides one it would actually allow. These same
  // action objects are reused verbatim (not redefined) by rowActionsFor below for the
  // "Requirements" grid's own right-click menu, per the ERP reference behavior: right-clicking any
  // row shows Lock/Unlock/Delete(this row)/Delete All together, not just a row-scoped Delete.
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

  // The "Requirements" grid's own right-click menu (ReportGrid's own getRowActions prop below,
  // which wraps each row in the shared RowContextMenu — see row-actions.tsx; no second menu system
  // introduced). Lock/Unlock/Delete All are the exact same requirementActions objects the page-level
  // Quick Actions ("⋮") menu already uses — reused, not duplicated, so both surfaces can never
  // disagree about what's currently allowed. Delete is bound to the EXACT row that was
  // right-clicked; there is no separate "currently selected row" the action could drift from (see
  // requestDeleteRow's own comment). Hidden per-ROW (not the whole grid) when THAT row has no
  // matching saved record — a live row added since the last Save has nothing real to delete yet,
  // even while its sibling rows in the same grid already do.
  const rowActionsFor = (row: RequirementRow): RowAction[] => {
    const [lockAction, unlockAction, deleteAllAction] = requirementActions;
    return [
      lockAction,
      unlockAction,
      {
        key: "delete-row", label: "Delete", icon: Trash2, onSelect: () => requestDeleteRow(row),
        disabled: !workOrderId || deleteBusy || mutationBlocked, destructive: true,
        hidden: !row.isSaved,
      },
      deleteAllAction,
    ];
  };

  // Page-level right-click (PageContextMenu below) — resolves whichever Requirements-grid row (if
  // any) the browser's native contextmenu event actually landed on, via plain DOM lookup, so the
  // menu opens correctly ANYWHERE in the workspace (header, Production Quantities, blank space,
  // Total Requirements, Transaction Details) without depending on ReportGrid's own row click/
  // selection machinery. Scoped to `[data-requirements-grid]` — the marker div wrapped around ONLY
  // the "Requirements" grid section below — so a `data-row-id` that happens to appear in a
  // DIFFERENT ReportGrid instance (Total Requirements/Transaction Details use their own, unrelated
  // id schemes) can never be misread as a requirement row.
  const resolveRowFromTarget = (target: HTMLElement | null): RequirementRow | null => {
    if (!target) return null;
    const rowEl = target.closest('[data-requirements-grid] [data-row-id]');
    if (!rowEl) return null;
    const id = rowEl.getAttribute("data-row-id");
    return requirementRows.find((r) => String(r.id) === id) ?? null;
  };

  // Whatever the right-click landed on: a real Requirements row -> that row's own full action set
  // (Lock/Unlock/Delete/Delete All, same as rowActionsFor); anywhere else (header, blank space,
  // Production Quantities, Total Requirements, Transaction Details) -> the whole-type actions only
  // (Lock/Unlock/Delete All — Delete All Records must still be available per the task's own rule;
  // there is simply no single row to target a per-record Delete at).
  const getActionsForTarget = (target: HTMLElement | null): RowAction[] => {
    const row = resolveRowFromTarget(target);
    return row ? rowActionsFor(row) : requirementActions;
  };

  // Three deliberately separate identities, per BOM line — never mixed with each other:
  // - Variant-1 — the BOM item's own Material Variant/Type (e.g. "Fleece", "Rib", "Twill Tape").
  //   Unchanged meaning/label; never touched by the requirement engine's own matching logic.
  // - Variant-2 — its own existing matching role only: the color text this line applies to
  //   (matched, case-insensitively, against this Work Order's own Manufacturing Quantities by
  //   fabric-yarn-requirements.service.ts's own resolveApplicableQuantity — see Applicable Qty's
  //   own tooltip just below for which color actually matched). Shown under its real name here,
  //   not relabeled "Production Color" — that label belongs only to the Manufacturing Quantities
  //   row/color itself (C/S Details), a different concept, kept separate per product decision.
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
      render: (r) => {
        const label = r.colorCode || r.colorName
          ? <span>{r.colorCode || r.colorName}{r.colorCode && r.colorName && r.colorCode !== r.colorName ? ` — ${r.colorName}` : ""}</span>
          : <span className="text-muted-foreground">—</span>;
        // Editable only for a Fabric/Trim row that is NOT yet saved (its `id` is a real,
        // resolvable BOM line — see setMaterialColorForLine's own comment). A row that IS saved
        // has `id` = its MA_Requirement RecId instead, which the BOM-line edit endpoint can't
        // target — per-row, not gated on the whole grid, so a genuinely new row can still be
        // edited even while its already-saved siblings can't.
        if (type === "yarn" || r.isSaved) return label;
        return (
          <button
            type="button"
            className="flex w-full items-center gap-1 text-left hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={mutationBlocked || settingColorRowId === r.id}
            onClick={(e) => { e.stopPropagation(); setColorLookupRowId(r.id); }}
            title="Set Material Color"
          >
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            {settingColorRowId === r.id ? <span className="text-muted-foreground">Saving...</span> : label}
          </button>
        );
      },
    },
    { key: "variant2", label: "Variant-2", defaultWidth: 130, render: (r) => r.variant2 || <span className="text-muted-foreground">All Colors</span> },
    {
      key: "consumption", label: "Consumption", defaultWidth: 110, align: "right",
      render: (r) => {
        // Yarn has no Consumption BOM field of its own — a Yarn row's real Requirement is Fabric
        // Requirement x its resolved Yarn Recipe %, not a per-unit Quantity anyone types (see
        // getYarnRequirements' own comment). This column shows that real, resolved recipe %
        // (r.recipePercentage — the actual FabricYarnRecipeLine.percentage used for THIS row's own
        // calculation, Common or Color-Specific per resolveEffectiveRecipe) instead of the
        // meaningless "0" `r.consumption` always was for Yarn (that field is simply absent from
        // getYarnRequirements' own response shape). Display-only — Requirement (`quantity`) below is
        // still computed and persisted exactly as before; this never recalculates it.
        if (type === "yarn") {
          // "recipe-percent" — the same Decimal Parameters key the Yarn Recipe dialog itself
          // already rounds this exact field with (see yarn-recipe-dialog.tsx's own comment), not
          // the unrelated "quantity" key.
          return r.recipePercentage != null
            ? `${round(r.recipePercentage, "recipe-percent").toLocaleString()}%`
            : <span className="text-muted-foreground">—</span>;
        }
        // Fabric/Trim Consumption is now editable regardless of `isSaved` (previously blocked once
        // saved — the actual reported bug: `id` becomes a MA_Requirement.RecId once saved, which
        // isn't a BOM line reference at all, so editing had to be disabled entirely rather than
        // send the wrong id; fixed by targeting `lineId` instead — see setConsumptionForRow's own
        // comment).
        return (
          <input
            type="number"
            min={0}
            defaultValue={r.consumption}
            disabled={mutationBlocked || settingConsumptionRowId === r.id}
            className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-right font-mono hover:border-input focus:border-input focus:outline-none disabled:opacity-50"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
            // Immediate, no-round-trip recalculation as the user types — Requirement/Total
            // Requirements update live (see applyLocalConsumptionEdit's own comment). The input
            // itself stays uncontrolled (defaultValue, not value) so typing is never fought/reset
            // mid-keystroke by the resulting re-render of the surrounding cells.
            onChange={(e) => applyLocalConsumptionEdit(r, normalizeNonNegative(e.target.value))}
            // Always persists on blur, unconditionally — NOT `next !== r.consumption`. Once
            // onChange above has already applied the local preview, `r` (captured by this closure
            // at the render that followed that preview) already reflects the typed value, so that
            // comparison would compare the typed value against itself and silently skip the actual
            // persist call on every real edit. Unconditional blur-persist is cheap/idempotent
            // (setConsumptionForLine just writes the same BOM line Quantity either way) and is what
            // actually guarantees Consumption survives Save/reload, which is the whole point.
            onBlur={(e) => setConsumptionForRow(r, normalizeNonNegative(e.target.value))}
          />
        );
      },
    },
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
    {
      key: "requirementUnit", label: "Unit", defaultWidth: 90,
      render: (r) => r.requirementUnit
        ? <span title={r.requirementUnit.name}>{r.requirementUnit.code}</span>
        : <span className="text-muted-foreground" title={'No Unit is flagged "Requirement Calculation" for this material yet — set it on the item\'s own Unit tab.'}>—</span>,
    },
    {
      // Per-row Saved/Not Saved status — real `r.isSaved` (already resolved by loadGrids' own
      // getSaved() call, see that method's own comment), not a page-level flag. Added because a
      // genuinely deleted row (its MA_Requirement record soft-deleted — see confirmDeleteRow) is
      // NEVER removed from this grid — it must keep showing (this grid always reflects the real,
      // live material need from the current BOM + Yarn Recipe, same as before Delete existed;
      // deleting a saved snapshot must never make an actual, still-needed material silently vanish
      // from the Requirements grid or Total Requirements, which is why Total Requirements is
      // deliberately unaffected by this — see its own comment). Without this column, Delete's real,
      // successful effect (soft-deleting the persisted MA_Requirement record) was completely
      // invisible: the exact same row kept rendering with identical values, giving no indication
      // anything happened, which is the actual "toast says deleted but rows still present" report
      // this fix addresses — the row was always genuinely deleted at the DB layer (confirmed via a
      // live re-fetch), just with zero visible change. "Not Saved" also correctly, honestly covers
      // a genuinely new row that has never been saved yet — the same real state either way.
      key: "isSaved", label: "Status", defaultWidth: 100,
      render: (r) => r.isSaved
        ? <Badge variant="secondary" className="text-[11px] font-normal">Saved</Badge>
        : <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground" title="No current saved record for this row — Save to persist it.">Not Saved</Badge>,
    },
  ];

  // Shared by both grids' own onRowClick below — scopes Transaction Details to the clicked
  // item's real InventoryId (+ Material Color, when the row has one), and reveals the section if
  // it was collapsed, since clicking an item to inspect its receipts implies wanting to see them.
  const selectTransactionItem = (r: { inventoryId: number | null; inventoryCode: string | null; inventoryName: string | null; colorCardId?: string | null; colorCode?: string | null; colorName?: string | null }) => {
    setTransactionFilter({
      inventoryId: r.inventoryId,
      colorCardId: r.colorCardId ?? null,
      label: [r.inventoryCode || r.inventoryName || "this item", (r.colorCode || r.colorName) ? `[${r.colorCode || r.colorName}]` : ""].filter(Boolean).join(" "),
    });
    setShowTransactions(true);
  };

  const totalColumns: ReportColumn<TotalRow>[] = [
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 160, render: (r) => r.inventoryCode || "—" },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 260, render: (r) => r.inventoryName || "—" },
    { key: "quantity", label: "Quantity", defaultWidth: 130, align: "right", render: (r) => round(r.quantity, "quantity").toLocaleString() },
    {
      key: "requirementUnit", label: "Unit", defaultWidth: 90,
      render: (r) => r.requirementUnit ? <span title={r.requirementUnit.name}>{r.requirementUnit.code}</span> : <span className="text-muted-foreground">—</span>,
    },
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
    // Right-click ANYWHERE in this workspace (header, Production Quantities, blank space,
    // Requirements grid, Total Requirements, Transaction Details) opens the SAME context menu —
    // see getActionsForTarget's own comment. This replaces per-row RowContextMenu as the sole
    // right-click mechanism on this page (the Requirements ReportGrid below no longer passes
    // getRowActions) so there is exactly one menu system, never two competing ones fighting over
    // the same contextmenu event.
    <PageContextMenu getActions={getActionsForTarget}>
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <LegacyErpBreadcrumb trail={[
          { label: "Legacy ERP" },
          { label: title },
          // Same "append the loaded record as a final breadcrumb segment" convention
          // purchase-orders/page.tsx's own breadcrumb already uses (`...(poId ? [{ label:
          // form.receiptNo }] : [])`) — real workOrder.workOrderNo only, omitted entirely until a
          // Work Order is actually loaded (matches the Order No field right below, which shows the
          // same blank state via onClear).
          ...(workOrder?.workOrderNo ? [{ label: workOrder.workOrderNo }] : []),
        ]} />
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

      {/* Non-fatal Requirements warnings (see the backend's own getMappingWarnings comment) — two
          kinds share this one banner: (1) a BOM line's Garment Color doesn't match any of this
          Work Order's own Manufacturing Quantity colors, so it fell back to the Work Order's
          TOTAL quantity instead of one color's own share; (2) a material's Unit tab has no Unit
          flagged "Requirement Calculation" (or has more than one), so its Unit column above reads
          "—" / used a deterministic-but-ambiguous pick. Neither ever blocks Calculate/Save. */}
      {mappingWarnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Requirement warning{mappingWarnings.length > 1 ? "s" : ""} — verify before relying on these totals:</p>
          {mappingWarnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      <div className="grid grid-cols-12 gap-3 rounded-md border p-3">
        <div className="col-span-3 space-y-1">
          <label className="text-xs text-muted-foreground">Order No</label>
          <MasterAutocompleteField
            label="" compact masterKey="manufacturing-order"
            // "manufacturing-order" is a search-only lookup (no activeColumn/label/codeColumn —
            // see legacy-master-lookup.service.ts's own manageable() guard), not a generic
            // "Manageable Master" with its own CRUD screen — Work Orders already have their own
            // real management screen (Work Orders List). Without this override, the field's F2/
            // search-icon button would try to open the generic Master Lookup screen and hit that
            // guard's own 400 error. lookupPath is exactly the escape hatch this component already
            // supports for this case (see work-orders/page.tsx's own Customer field, which points
            // at CURRENT_ACCOUNTS_LIST_PATH the same way).
            lookupPath="/dashboard/legacy-erp/work-orders-list"
            displayValue={workOrder?.workOrderNo || ""}
            fetchOptions={(t) => legacyErpApi.lookupTable("manufacturing-order", t) as Promise<MasterOption[]>}
            onSelect={(o) => loadWorkOrder(Number(o.id))}
            onClear={() => { setWorkOrder(null); setWorkOrderId(null); setRequirementRows([]); setTotalRows([]); setTransactionRows([]); setMfgQty(null); setMappingWarnings([]); setTransactionFilter(null); setSelectedRequirementId(null); setSelectedTotalRowId(null); }}
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
      {/* data-requirements-grid marks this section (and ONLY this one) for getActionsForTarget's
          own DOM lookup above — Total Requirements/Transaction Details below intentionally carry
          no such marker, so a right-click landing on one of THEIR rows always falls back to the
          whole-type action set instead of being misread as a requirement row. */}
      <div data-requirements-grid="true">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Requirements{requirementRowsAreSaved && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(saved — right-click a row to delete it)</span>}
          <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— click a row to see its Transaction Details below</span>
        </p>
        <ReportGrid
          storageKey={`requirementsGrid-${type}`}
          columns={requirementColumns}
          rows={requirementRows}
          loading={loadingGrids}
          emptyLabel={workOrderId ? "No requirements yet — add BOM lines on this Work Order's own BOM tab first." : "Select an Order No above to load its requirements."}
          selectedId={selectedRequirementId}
          onRowClick={(r) => { setSelectedRequirementId(r.id); setSelectedTotalRowId(null); selectTransactionItem(r); }}
        />
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Total Requirements Table
          <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— click a row to see its Transaction Details below</span>
        </p>
        <ReportGrid
          storageKey="totalRequirementsGrid"
          columns={totalColumns}
          rows={totalRows}
          selectedId={selectedTotalRowId}
          onRowClick={(r) => { setSelectedTotalRowId(r.id); setSelectedRequirementId(null); selectTransactionItem(r); }}
          loading={loadingGrids}
          emptyLabel={workOrderId ? "No totals yet — click Calculate." : "Select an Order No above to load its totals."}
        />
      </div>

      {/* Transactions checkbox above now actually controls this section, instead of being inert.
          Also auto-shown by clicking a Requirements/Total Requirements row (selectTransactionItem
          above), since that click's whole point is to see that item's own receipts. */}
      {showTransactions && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Transaction Details</p>
            {transactionFilter ? (
              <span className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">
                Showing receipts for <span className="font-medium">{transactionFilter.label}</span>
                <button type="button" className="text-muted-foreground hover:text-foreground underline" onClick={() => setTransactionFilter(null)}>Clear</button>
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/70">(showing every receipt for this Work Order — click a Requirements/Total Requirements row to narrow down)</span>
            )}
          </div>
          <ReportGrid
            storageKey="transactionDetailsGrid"
            columns={transactionColumns}
            rows={transactionRows}
            loading={loadingGrids || loadingTransactions}
            emptyLabel={
              !workOrderId ? "Select an Order No above to load its transactions."
                : transactionFilter ? `No receipts found for ${transactionFilter.label}.`
                : "No outside-process receipts linked to this Work Order yet."
            }
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

      {/* Material Color lookup for the Requirements grid's own editable column — same reusable
          CardLookupDialog + ColorCard master every other "Choose Color" search icon in this app
          already uses (work-orders/page.tsx's own C/S Details material columns, bom-tab.tsx),
          not a second implementation. */}
      <CardLookupDialog<CardLookupRow>
        open={colorLookupRowId != null}
        onOpenChange={(open) => { if (!open) setColorLookupRowId(null); }}
        title="Select Material Color"
        fetchOptions={async (search) => {
          const all: any = await plmApi.colors.list().catch(() => []);
          const list = Array.isArray(all) ? all : [];
          const term = (search || "").trim().toLowerCase();
          const filtered = term ? list.filter((c: any) => (c.code || "").toLowerCase().includes(term) || (c.name || "").toLowerCase().includes(term)) : list;
          return filtered.map((c: any): CardLookupRow => ({ id: c.id, inventoryCode: c.code, inventoryName: c.name, inUse: c.inUse !== false }));
        }}
        onSelect={(row) => {
          const targetId = colorLookupRowId;
          setColorLookupRowId(null);
          const targetRow = requirementRows.find((r) => r.id === targetId);
          if (targetRow) setMaterialColorForRow(targetRow, String(row.id));
        }}
      />

      {/* Delete ONE selected record — the confirmation text names the actual record, never the
          misleading "delete everything of this type" wording the old bulk-wired action used. */}
      <AlertDialog open={!!pendingDeleteRow} onOpenChange={(open) => !open && setPendingDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this requirement
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
              Are you sure you want to delete all saved {title} for this Work Order?
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
    </PageContextMenu>
  );
}
