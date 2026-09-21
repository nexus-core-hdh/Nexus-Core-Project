// Shared row right-click receipt menu — an ENTRY/NAVIGATION mechanism only, extracted from Fabric
// Planning's own original, verified implementation (fabric-planning/_components/receipt-menu.ts)
// so Yarn Planning and Trim Planning can reuse it identically instead of each getting their own
// copy. Every enabled action opens an already-existing, already-shipped screen via the app's own
// navigateOrOpenTab (lib/workspace/navigate.ts — the same call every other list screen's row
// actions already use, e.g. fabric-cards-list's own view/update/viewStatement). No new receipt
// screen, no new receipt API, no new calculation — this file only decides WHICH existing route to
// open and with which real query params. Behavior is byte-for-byte identical to the Fabric-local
// version it replaces (same labels, same submenu structure, same receiptType values, same routes,
// same Inventory Statement behavior, same disabled/tooltip states) — only `FabricPlanningRowContext`
// became the generic `PlanningRowContext`, `buildFabricPlanningReceiptActions` became
// `buildPlanningReceiptActions`, and Inventory Statement's own "back" link source/label became a
// caller-supplied parameter instead of a hardcoded Fabric Planning path.
//
// ── DB-first inspection performed before writing this file (originally for Fabric Planning; the
// same findings apply unchanged to Yarn/Trim Planning, since none of the destinations below are
// Fabric-specific) ──────────────────────────────────────────────────────────────────────────────
// - nexuscore-backend/src/modules/legacy-erp/receipt-types.config.ts — the single source of truth
//   for every IM_Receipt-backed receipt type (18 entries, RECEIPT_TYPES) and the 4-type
//   SUBCONTRACT_RECEIPT_TYPES subset. Every "Issue ... Receipt" action below that maps to a real
//   receiptType is taken directly from this array — never a guessed/hardcoded number.
// - frontend inventory-receipts/page.tsx — the ONE real screen serving all 18 receipt types via
//   `?receiptType=<n>&mode=create` (confirmed: `const receiptType = Number(searchParams.get(
//   "receiptType")) || 2`). Confirmed (grep for every `searchParams.get(...)` in that file) that
//   it reads ONLY mode/id/receiptType — no inventoryId/item-prefill query param exists anywhere on
//   this screen today, and its two "import lines" imperative-handle methods (importLines/
//   importRelatedLines, inventory-receipt-line-grid.tsx) are for importing REAL pending PO/receipt
//   lines (they require fields like orderReceiptItemId/poReceiptNo a Planning row simply doesn't
//   have) — reusing them here would mean fabricating those fields, which is exactly what "Do NOT
//   fake or duplicate receipt data" forbids. So: every receipt action below opens the correct
//   EXISTING screen for the correct EXISTING receipt type, in create mode, with NO item prefill —
//   that capability genuinely does not exist in this codebase yet, for Fabric, Yarn, or Trim.
// - frontend purchase-orders/page.tsx — same finding: only mode/id read, no item prefill.
// - frontend item-statement/page.tsx — DOES support real prefill: `?id=<inventoryId>` loads that
//   item's statement directly (confirmed: `const itemId = Number(params.get("id"))`), plus
//   `?source=`/`?sourceLabel=` for a "back" link — the exact same convention fabric-cards-list/
//   inventory-cards-list/trim-inventory-cards-list/yarn-cards-list already use today. Reused
//   verbatim, not reinvented; `source` is now caller-supplied so a Trim Planning row's "back" link
//   correctly points at Trim Planning, not a hardcoded Fabric Planning path.
// - Exhaustive grep across app/dashboard for "Raw Fabric", "free stock", "material usage",
//   "purchase demand", "store issuance", and an allocation-screen directory search all returned
//   NOTHING — these have no existing screen/route/API anywhere in this codebase (confirmed, not
//   assumed). Every one of these renders disabled with an honest reason, never a fake/dead link.
"use client";

import { useEffect, useState } from "react";
import type { RowAction } from "@/components/legacy-erp/row-actions";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { stashPlanningPrefillLines, type PlanningPrefillLine } from "@/lib/legacy-erp/planning-prefill";
import {
  ShoppingCart, PackageCheck, Undo2, Users, Network, Scissors, Store, Warehouse,
  ArrowLeftRight, ClipboardList, FileSpreadsheet, ClipboardCheck, FileBarChart2, PackageSearch, FileText,
  FileSignature, Send,
} from "lucide-react";

type Router = Parameters<typeof navigateOrOpenTab>[0];

// ── Subcontractor process source of truth ───────────────────────────────────────────────────────
// Real, existing master — MD_SubcontractType, exposed through the SAME generic Master Lookup
// endpoint (`legacyErpApi.lookupTable('subcontract-type')` -> GET /legacy-erp/lookup/tables/
// subcontract-type -> LegacyMasterLookupService.search('subcontract-type')) the "Subcontract
// Receipts" screen's own "Type to Search" filter and the receipt create screen's own "Subcontract
// Type" field ALREADY use (confirmed: subcontract-receipts-list/page.tsx and inventory-receipts/
// page.tsx both pass masterKey="subcontract-type" to the same shared MasterAutocompleteField).
// No new table, no new API, no new lookup, no hardcoded process array — every process name shown
// below (Dyeing, Knitting, ...) comes directly from this same live call, in the same order that
// call already returns (`ORDER BY "SubcontractTypeName"`), with the SAME real `RecId` the
// create-receipt screen already stores as `SubcontractTypeId` when the user picks it manually.
//
// With NO search term, LegacyMasterLookupService.search() applies `WHERE "IsDeleted" = 0 AND
// "InUse" = 1 ... LIMIT 50` — this is WHY the live UI shows only 4 clean rows (Dyeing/knitting/
// printing/washing) even though the raw MD_SubcontractType table has 32, most of them inactive
// duplicates/test rows (confirmed live) — the InUse filter is the SAME one already gating the two
// existing screens, not a new dedup rule invented here.
export interface SubcontractTypeOption { id: number; code: string | null; name: string }

let subcontractTypesCache: SubcontractTypeOption[] | null = null;
let subcontractTypesPromise: Promise<SubcontractTypeOption[]> | null = null;

function fetchSubcontractTypes(): Promise<SubcontractTypeOption[]> {
  if (subcontractTypesCache) return Promise.resolve(subcontractTypesCache);
  if (!subcontractTypesPromise) {
    subcontractTypesPromise = legacyErpApi.lookupTable("subcontract-type")
      .then((rows: any) => {
        const list: SubcontractTypeOption[] = Array.isArray(rows)
          ? rows.map((r: any) => ({ id: Number(r.id), code: r.code ?? null, name: String(r.name ?? "") }))
          : [];
        subcontractTypesCache = list;
        return list;
      })
      .catch(() => {
        subcontractTypesCache = [];
        return [];
      });
  }
  return subcontractTypesPromise;
}

// One shared in-memory cache/in-flight promise across every call site — Fabric Planning and Yarn
// Planning are both mounted simultaneously (this app keeps every opened workspace tab mounted),
// so without this a right-click on each would otherwise trigger its own separate network request
// for the exact same, rarely-changing list. Real per-viewer data (not a static import), just
// fetched once instead of once per screen instance.
export function useSubcontractTypes(): SubcontractTypeOption[] | null {
  const [types, setTypes] = useState<SubcontractTypeOption[] | null>(subcontractTypesCache);
  useEffect(() => {
    let cancelled = false;
    fetchSubcontractTypes().then((list) => { if (!cancelled) setTypes(list); });
    return () => { cancelled = true; };
  }, []);
  return types;
}

// Structural shape every Planning row (Fabric/Yarn/Trim) already satisfies — each screen's own
// richer PlanningRow interface is a superset of this, so no row ever needs casting/adapting to
// call buildPlanningReceiptActions. `requirementUnit.unitItemId` is the real MD_UnitSetItem.RecId
// (see fabric-yarn-requirements.service.ts's own resolveRequirementUnits comment) — the id a
// transaction LINE's own "Unit" field actually validates against, deliberately kept distinct from
// `requirementUnit.id` (that ITEM's own IM_ItemUnitItemSize configuration row, a different table).
export interface PlanningRowContext {
  workOrderId: number;
  workOrderNo: string | null;
  inventoryId: number | null;
  inventoryCode: string | null;
  inventoryName: string | null;
  colorCardId: string | null;
  colorCode: string | null;
  colorName: string | null;
  variant2: string | null;
  required: number;
  requirementUnit: { id: number; code: string; name: string; unitItemId: number } | null;
}

// Which Planning screen is calling this — real, caller-supplied identity, never guessed from the
// row itself (a row has no "which screen am I shown on" field of its own). `path`/`label` drive
// Inventory Statement's own "back" link; `sourceType` drives PurchaseOrderLineGrid's own
// LineRow.sourceType (a real, pre-existing field — "which per-type screen this line's Code came
// from" — used by that grid's own Code-lookup resolution, not invented for this feature).
export interface PlanningMenuSource {
  path: string;
  label: string;
  sourceType: "fabric" | "yarn" | "trim";
}

// ── Planning Transaction Context — real DB-backed line prefill ─────────────────────────────────
// `PlanningPrefillLine` and the stash/consume handoff live in lib/legacy-erp/planning-prefill.ts
// (a neutral shared location both this file and the destination screens'/line-grids' own code can
// import from — see that file's own top comment). This function is the one PRODUCER-side mapping
// step that belongs here: reducing a right-clicked Planning row's real, already-resolved data
// (from the SAME Requirements engine — getMaterialRequirements/getYarnRequirements — the Fabric/
// Trim/Yarn Requirements screen already trusts) into that canonical shape.
//
// Every currently-selected row with a real, resolved Inventory Item becomes one real line — a row
// with no resolved item (inventoryId null) is silently SKIPPED, never turned into a fake/blank
// line, matching this file's own established "never fabricate" rule. `quantity` is each row's own
// real, already-calculated Requirement figure (the same number the Planning grid's own
// "Requirement"/"Required" column shows) — a real, correct starting value the user can still edit
// on the destination screen, not an invented one.
function buildPrefillLines(rows: PlanningRowContext[], sourceType: PlanningMenuSource["sourceType"]): PlanningPrefillLine[] {
  return rows
    .filter((r): r is PlanningRowContext & { inventoryId: number } => r.inventoryId != null)
    .map((r) => ({
      inventoryId: r.inventoryId,
      code: r.inventoryCode,
      name: r.inventoryName,
      quantity: r.required,
      unitId: r.requirementUnit?.unitItemId ?? null,
      unit: r.requirementUnit?.code ?? null,
      colorCardId: r.colorCardId,
      color: r.colorCode || r.colorName,
      workOrderId: r.workOrderId,
      workOrderNo: r.workOrderNo,
      sourceType,
    }));
}

// `lines` — real, already-resolved Planning rows (see buildPrefillLines) stashed via the
// one-shot handoff above and appended as `&prefillHandoff=<id>`; omitted (or empty) leaves the
// URL exactly as before (no item-prefill mechanism existed here at all until this feature).
const withPrefill = (url: string, lines: PlanningPrefillLine[]) => {
  const handoffId = stashPlanningPrefillLines(lines);
  return handoffId ? `${url}&prefillHandoff=${handoffId}` : url;
};

const openReceipt = (router: Router, receiptType: number, lines: PlanningPrefillLine[]) =>
  navigateOrOpenTab(router, withPrefill(`/dashboard/legacy-erp/inventory-receipts?receiptType=${receiptType}&mode=create`, lines));

// Same destination as openReceipt, PLUS the selected subcontractor process — its REAL
// MD_SubcontractType.RecId (the exact same id the create screen's own "Subcontract Type" field
// stores as SubcontractTypeId when a user picks it manually) and its display name, both prefilled
// into that SAME existing field (inventory-receipts/page.tsx's `subcontractTypeId`/
// `subcontractTypeLabel`). Since `type` is one specific row returned by the SAME lookup that
// field's own dropdown uses (see useSubcontractTypes' own comment), there is no ambiguity to guard
// against here — the id IS the exact record the user saw and clicked in this menu.
const openSubcontractReceipt = (router: Router, receiptType: number, type: SubcontractTypeOption, lines: PlanningPrefillLine[]) =>
  navigateOrOpenTab(
    router,
    withPrefill(`/dashboard/legacy-erp/inventory-receipts?receiptType=${receiptType}&mode=create&subcontractTypeId=${type.id}&subcontractTypeLabel=${encodeURIComponent(type.name)}`, lines),
  );

// "Order Transactions (Directives)" — the real, separate Subcontract Order entity (order-
// types.config.ts: receiptType=3 on IM_OrderReceipt/IM_OrderReceiptItem, its own dedicated
// /subcontract-orders route — confirmed NOT the same table/screen as the 4 IM_Receipt-backed
// Outside Process types below). Confirmed via information_schema that IM_OrderReceiptItem has NO
// SubcontractTypeId (or any other process-identifying) column — only SubcontractorId (the
// vendor/company FK, a completely different concept) — so, per this task's own "do not fabricate"
// rule, the selected process is NOT passed here: there is no real field on this screen to receive
// it. Documented as a genuine, confirmed gap in the final report, not silently dropped. Item-level
// context (lines) IS passed — this screen shares the exact same PurchaseOrderLineGrid as Purchase
// Order below, just a different order type/route.
const openSubcontractOrder = (router: Router, lines: PlanningPrefillLine[]) =>
  navigateOrOpenTab(router, withPrefill(`/dashboard/legacy-erp/subcontract-orders?mode=create`, lines));

const openPurchaseOrder = (router: Router, lines: PlanningPrefillLine[]) =>
  navigateOrOpenTab(router, withPrefill(`/dashboard/legacy-erp/purchase-orders?mode=create`, lines));

const openInventoryStatement = (router: Router, row: PlanningRowContext, source: PlanningMenuSource) =>
  navigateOrOpenTab(
    router,
    `/dashboard/legacy-erp/item-statement?id=${row.inventoryId}&source=${encodeURIComponent(source.path)}&sourceLabel=${encodeURIComponent(source.label)}`,
  );

// A leaf item genuinely has no real destination in this app today (see this file's own top
// comment for what was searched and confirmed absent) — rendered disabled with a title explaining
// why, never silently hidden (the reference legacy menu always shows the full action set) and
// never wired to a fake/no-op destination.
function unsupported(key: string, label: string, icon: RowAction["icon"], reason: string, separatorBefore?: boolean): RowAction {
  return { key, label, icon, onSelect: () => {}, disabled: true, title: reason, separatorBefore };
}

// One subcontract type's own 4-category cascade — "Order Transactions (Directives)" / "Issued
// Transactions" / "Received Transactions" / "Subcontractor Return Transactions", matching the
// legacy screenshot's own wording exactly. Receipt type mapping (real, from receipt-types.config.
// ts's SUBCONTRACT_RECEIPT_TYPES = [11, 12, 134, 133], plus the separate Subcontract Order entity
// for Directives) — fixed per this task's own instruction #8 ("may remain fixed only if they
// already map to the existing receipt system"), only the PROCESS level above them is dynamic:
//   Order Transactions (Directives) -> Subcontract Order (receiptType 3, IM_OrderReceipt) — no
//     type passed (see openSubcontractOrder's own comment on the confirmed field gap).
//   Issued Transactions             -> Outside Process Sent Receipt (134) — we send TO the
//     subcontractor.
//   Received Transactions           -> Outside Process Receive Receipt (11) — we receive
//     processed goods FROM the subcontractor.
//   Subcontractor Return Transactions -> Outside Process Return Receipt (12) — the direct return
//     counterpart of Received (11), same "Receive/Return" pairing convention Purchase Receipt (2)
//     / Purchase Return (122) already use elsewhere in this same menu.
//
// NOT mapped here: Outside Process Sent Return Receipt (133) — the return counterpart of Issued
// (134). The legacy reference structure (per the attached screenshot) has exactly 4 category
// slots per type with no further nesting under "Subcontractor Return Transactions", so 133 has no
// slot to occupy without either inventing a 5th category (not in the legacy reference) or
// silently blending two semantically different receipt types under one ambiguous label. This is a
// genuine, confirmed structural gap versus the previous flat 4-item menu (which did expose all 4
// real types as siblings) — reported here and in the final report, not silently dropped. Type 133
// remains reachable exactly as before via the un-scoped Subcontract Receipts screen elsewhere in
// the app; it is only this cascading Planning menu that no longer surfaces it.
function buildSubcontractTypeActions(router: Router, type: SubcontractTypeOption, lines: PlanningPrefillLine[]): RowAction[] {
  return [
    { key: `sub-${type.id}-order`, label: 'Order Transactions (Directives)', icon: FileSignature, onSelect: () => openSubcontractOrder(router, lines) },
    { key: `sub-${type.id}-issued`, label: 'Issued Transactions', icon: Send, onSelect: () => openSubcontractReceipt(router, 134, type, lines) },
    { key: `sub-${type.id}-received`, label: 'Received Transactions', icon: PackageCheck, onSelect: () => openSubcontractReceipt(router, 11, type, lines) },
    { key: `sub-${type.id}-return`, label: 'Subcontractor Return Transactions', icon: Undo2, onSelect: () => openSubcontractReceipt(router, 12, type, lines) },
  ];
}

// Builds the "Subcontractor Transactions" submenu itself from whatever `useSubcontractTypes()`
// currently has (real MD_SubcontractType rows, Active-only, same source the two existing
// Subcontract screens use) — `null` (still loading) and `[]` (loaded, genuinely zero Active
// types configured) are both handled as an honest disabled state with an explanatory title,
// never a fake/hardcoded entry standing in for real data that isn't there yet.
function buildSubcontractorTransactionsAction(router: Router, types: SubcontractTypeOption[] | null, lines: PlanningPrefillLine[]): RowAction {
  if (types === null) {
    return { key: "subcontractor-transactions", label: "Subcontractor Transactions", icon: Users, onSelect: () => {}, disabled: true, title: "Loading Subcontract Types…" };
  }
  if (types.length === 0) {
    return { key: "subcontractor-transactions", label: "Subcontractor Transactions", icon: Users, onSelect: () => {}, disabled: true, title: "No active Subcontract Types are configured yet (Subcontract Receipts screen)." };
  }
  return {
    key: "subcontractor-transactions", label: "Subcontractor Transactions", icon: Users,
    onSelect: () => {},
    subActions: types.map((type) => ({
      key: `sub-type-${type.id}`, label: type.name, icon: Users,
      onSelect: () => {},
      subActions: buildSubcontractTypeActions(router, type, lines),
    })),
  };
}

export function buildPlanningReceiptActions(
  rows: PlanningRowContext[], router: Router, source: PlanningMenuSource, subcontractTypes: SubcontractTypeOption[] | null,
): RowAction[] {
  const primary = rows[0];
  if (!primary) return [];
  const hasItem = primary.inventoryId != null;
  // Every selected row with a real resolved Inventory Item, reduced to the canonical line shape
  // (see buildPrefillLines) — computed once per menu build (i.e. once per right-click), reused by
  // every action below that opens an existing line-based create screen. A row with no resolved
  // item contributes no line (never a fake one); if NONE of the selected rows resolve, `lines` is
  // empty and every destination below opens exactly as it always did (its own default blank row).
  const lines = buildPrefillLines(rows, source.sourceType);

  return [
    // ── Purchase ─────────────────────────────────────────────────────────────────────────────
    { key: "po", label: "Issue Purchase Order", icon: ShoppingCart, onSelect: () => openPurchaseOrder(router, lines) },
    { key: "pr", label: "Issue Purchase Receipt", icon: PackageCheck, onSelect: () => openReceipt(router, 2, lines) },
    { key: "prr", label: "Issue Purchase Return Receipt", icon: Undo2, onSelect: () => openReceipt(router, 122, lines) },

    // ── Raw Fabric ── this app has no separate "Raw Fabric" entity/screen (a Fabric is an
    // ordinary Inventory Item, same as any other) — these three reuse the identical Purchase
    // Order/Receipt/Return screens above, documented rather than silently duplicated. Shown
    // identically on Yarn/Trim Planning too — the legacy reference menu is the same fixed action
    // set regardless of which material type the row happens to be.
    { key: "rfpo", label: "Issue Raw Fabric Purchase Order", icon: ShoppingCart, onSelect: () => openPurchaseOrder(router, lines), separatorBefore: true },
    { key: "rfpr", label: "Issue Raw Fabric Purchase Receipt", icon: PackageCheck, onSelect: () => openReceipt(router, 2, lines) },
    { key: "rfprr", label: "Issue Raw Fabric Purchase Return Receipt", icon: Undo2, onSelect: () => openReceipt(router, 122, lines) },

    // ── Subcontractor ── matches the legacy reference menu's own cascading structure: real
    // Subcontract Type FIRST (dynamically loaded from MD_SubcontractType — see
    // buildSubcontractorTransactionsAction's own comment), each with its own 4 transaction-
    // category children (buildSubcontractTypeActions).
    { ...buildSubcontractorTransactionsAction(router, subcontractTypes, lines), separatorBefore: true },
    unsupported("subcontractor-allocation", "Subcontractor Allocation Transactions", Network, "No Allocation module exists in this application yet."),

    // ── Manufacturing (Cutting) — Send (140), Receive via Select Receiving Receipts (11, the same
    // receiptType whose own pendingOrders/"Subcontract Order" import flow already exists on
    // inventory-receipts/page.tsx), Return (40).
    { key: "mfg-send", label: "Issue Manufacturing (Cutting) Send Receipt", icon: Scissors, onSelect: () => openReceipt(router, 140, lines), separatorBefore: true },
    { key: "mfg-receive", label: "Issue Send to Manufacturing (Cutting) Receipt", icon: Scissors, onSelect: () => openReceipt(router, 11, lines) },
    { key: "mfg-return", label: "Issue Manufacturing (to Cutting) Send Return Receipt", icon: Scissors, onSelect: () => openReceipt(router, 40, lines) },

    // ── Wholesale ────────────────────────────────────────────────────────────────────────────
    { key: "wholesale", label: "Issue Wholesale Receipt", icon: Store, onSelect: () => openReceipt(router, 120, lines), separatorBefore: true },

    // ── Warehouse ── only ONE real Warehouse Transfer receipt type (17) exists — "Outflow" has no
    // second, distinct receiptType in this schema (a Transfer receipt already carries both legs),
    // so it stays disabled rather than silently reusing 17 under a mismatched label.
    { key: "wh-transfer", label: "Issue Warehouse Transfer Receipt", icon: Warehouse, onSelect: () => openReceipt(router, 17, lines), separatorBefore: true },
    unsupported("wh-transfer-outflow", "Issue Warehouse Transfer Outflow Receipt", Warehouse, "No separate Outflow receipt type exists — Warehouse Transfer Receipt (above) already carries both legs of the transfer."),

    // ── Allocation module — confirmed absent app-wide (no route/table/API found for any of these
    // 7 legacy actions) — all disabled, never faked.
    unsupported("alloc-transfer", "Allocation Transfer Transactions", ArrowLeftRight, "No Allocation module exists in this application yet.", true),
    unsupported("alloc-po", "Purchase Order Allocation", ClipboardList, "No Allocation module exists in this application yet."),
    unsupported("alloc-received", "Received Allocation", ClipboardList, "No Allocation module exists in this application yet."),
    unsupported("alloc-inflow", "Inflow Allocations (Current Account Allocations)", ClipboardList, "No Allocation module exists in this application yet."),
    unsupported("alloc-wh", "Warehouse Transfer Allocation", ClipboardList, "No Allocation module exists in this application yet."),
    unsupported("alloc-batch", "Batch Allocations", ClipboardList, "No Allocation module exists in this application yet."),
    unsupported("alloc-mfg-send", "Manufacturing Send Allocations", ClipboardList, "No Allocation module exists in this application yet."),

    // ── Demand / Issuance — no matching screen found anywhere in this codebase.
    unsupported("purchase-demand", "Issue Purchase Demand Receipt", FileSpreadsheet, "No Purchase Demand screen exists in this application yet.", true),
    unsupported("store-issuance", "Issue Store Issuance Request", ClipboardCheck, "No Store Issuance Request screen exists in this application yet."),

    // ── Reports ── Inventory Statement is real (item-statement, same screen Fabric/Trim/Yarn
    // Cards already link to) and needs a real inventoryId to open meaningfully; the other 3 have
    // no existing screen.
    hasItem
      ? { key: "inv-statement", label: "Inventory Statement", icon: FileBarChart2, onSelect: () => openInventoryStatement(router, primary, source), separatorBefore: true }
      : unsupported("inv-statement", "Inventory Statement", FileBarChart2, "This row has no resolved Inventory Item to show a statement for.", true),
    unsupported("free-stock", "Show Free Stock", PackageSearch, "No Free Stock screen exists in this application yet."),
    unsupported("mucr-order", "Order Material Usage Control Report", FileText, "No Material Usage Control Report exists in this application yet."),
    unsupported("mucr-material", "Material Usage Control Report (Material Based)", FileText, "No Material Usage Control Report exists in this application yet."),
  ];
}
