"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { useMasterLookupField } from "@/hooks/use-master-lookup-field";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { LookupDialog } from "@/components/legacy-erp/lookup-dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Search, Plus, Trash2, ChevronDown, ListOrdered, GripVertical, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================================
// EXCEL-STYLE ERP GRID — interaction model
// ============================================================================================
// At rest every cell is plain typography (StaticCell below) — no border, no input chrome, no
// rounded box. Exactly one cell across the whole grid can be "active" at a time (`cursor`);
// clicking it / pressing Enter or F2 mounts its real editor (EditableGridInput, Select,
// ColorComboCell, or opens the existing LookupDialog for Manufacturing Order) in place of the
// text, auto-focused. Blur/Enter/Tab commits through the SAME persistRow/updateRow this grid
// already used before this pass and reverts to text; Escape cancels without saving. Arrow keys
// move the active cell like a spreadsheet when nothing is being edited.
//
// Foundation is unchanged from the Costing Sheet module this grid has always been built on: a
// plain <Table>, EditableGridInput for every text/numeric field, plain row-array React state,
// unconditional-append Add Row, the exact same API calls (purchase-order.service.ts's item
// CRUD). Only the rendering/interaction layer around that foundation changed in this pass.

type ColKey =
  | "type" | "code" | "name" | "variant" | "color" | "quantity" | "unit" | "rate" | "price"
  | "forex" | "forexPrice" | "vatType" | "vatPct" | "itemAmount" | "received" | "mfgOrder" | "workOrder";

interface ColumnDef {
  key: ColKey;
  label: string;
  align: "left" | "right";
  navigable: boolean; // participates in arrow-key/Tab cell navigation
  editable: boolean; // Enter/F2/click mounts an editor (or opens its lookup) — false only for Price/Item Amount (computed)
}

const COLUMNS: ColumnDef[] = [
  { key: "type", label: "Type", align: "left", navigable: true, editable: true },
  { key: "code", label: "Code", align: "left", navigable: true, editable: true },
  { key: "name", label: "Name", align: "left", navigable: true, editable: true },
  // Free text + autocomplete, same control and interaction model as Code/Color — no backend
  // field exists for this yet (see LineRow's own comment on `variant`), so it's UI scaffolding
  // for a future Variant Master, not persisted.
  { key: "variant", label: "Variant", align: "left", navigable: true, editable: true },
  { key: "color", label: "Color", align: "left", navigable: true, editable: true },
  { key: "quantity", label: "Quantity", align: "right", navigable: true, editable: true },
  { key: "unit", label: "Unit", align: "left", navigable: true, editable: true },
  { key: "rate", label: "Rate", align: "right", navigable: true, editable: true },
  { key: "price", label: "Price", align: "right", navigable: true, editable: false },
  { key: "forex", label: "Forex", align: "left", navigable: true, editable: true },
  { key: "forexPrice", label: "Forex Price", align: "right", navigable: true, editable: true },
  { key: "vatType", label: "VAT Type", align: "left", navigable: true, editable: true },
  { key: "vatPct", label: "VAT %", align: "right", navigable: true, editable: true },
  { key: "itemAmount", label: "Item Amount", align: "right", navigable: true, editable: false },
  { key: "received", label: "Received / Shipped", align: "right", navigable: true, editable: true },
  { key: "mfgOrder", label: "Manufacturing Order", align: "left", navigable: true, editable: true },
  { key: "workOrder", label: "Work Order No", align: "right", navigable: true, editable: true },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

// Column reordering — Type/Code/Name are permanently first; every other column (including
// Variant and Delete's neighbors) is user-reorderable via native HTML5 drag-and-drop on its
// header cell. Reordering only ever changes DISPLAY order — colWidths/MIN_WIDTHS stay keyed
// by ColKey regardless of position, so a resized column keeps its width wherever it's dragged
// to. Delete itself is never part of this set; it's rendered separately and always renders
// last (rightmost), exactly like every other grid library's action column — it scrolls with
// the rest of the row like every other column, not pinned.
const FIXED_COLS: ColKey[] = ["type", "code", "name"];
const REORDERABLE_DEFAULT: ColKey[] = COLUMNS.filter((c) => !FIXED_COLS.includes(c.key)).map((c) => c.key);

// Column order persistence — "Save for This Session" writes to sessionStorage only (cleared on
// tab close, and deliberately never read back after a hard refresh's worth of navigating away
// and back is fine, but a real logout/browser-restart loses it, matching "restore default order
// after next login"). "Save Permanently" additionally writes into the existing UserSettings
// tablePreferences JSON blob (server-side shallow-merged with whatever else already lives
// there — see user-settings.service.ts's updateSettings — so this never clobbers Workspace/My
// Menu's own keys in the same blob) via the SAME settingsApi the Workspace store already uses,
// no new backend endpoint. sanitizeColumnOrder is shared by both read paths: drops any stale
// key that's no longer a valid reorderable column, and appends any column missing from an old
// saved list (e.g. one added to COLUMNS after the preference was saved) so nothing vanishes.
const SESSION_COLUMN_ORDER_KEY = "po-line-grid-column-order";
const PERMANENT_COLUMN_ORDER_SETTINGS_KEY = "poLineGridColumnOrder";
const sanitizeColumnOrder = (saved: unknown): ColKey[] => {
  if (!Array.isArray(saved)) return REORDERABLE_DEFAULT;
  const validSaved = saved.filter((k): k is ColKey => REORDERABLE_DEFAULT.includes(k as ColKey));
  const missing = REORDERABLE_DEFAULT.filter((k) => !validSaved.includes(k));
  return [...validSaved, ...missing];
};

// Column VISIBILITY persistence — same two-tier session/permanent scheme as order above, kept
// as a separate sessionStorage key and a separate tablePreferences key (rather than nesting
// both into one combined value) so the two features stay independently readable/writable and
// an old, order-only saved value from before this pass still loads correctly with nothing
// hidden by default. Only ever contains REORDERABLE keys — Type/Code/Name can never appear
// here, matching FIXED_COLS' "cannot be hidden" rule at the data layer, not just the UI.
const SESSION_HIDDEN_COLUMNS_KEY = "po-line-grid-hidden-columns";
const PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY = "poLineGridHiddenColumns";
const sanitizeHiddenColumns = (saved: unknown): ColKey[] =>
  Array.isArray(saved) ? saved.filter((k): k is ColKey => REORDERABLE_DEFAULT.includes(k as ColKey)) : [];

// Resizable columns — component-state only (no backend persistence asked for). Numeric
// columns stay narrow (a number rarely needs more than ~8-10 characters); Name is the one
// column that gets the leftover room, matching "text columns receive remaining space, numeric
// columns stay narrow." Widened a further pass over the previous values for readability —
// "increase default column widths where appropriate."
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  type: 116, code: 148, name: 280, variant: 104, color: 120, quantity: 92, unit: 80,
  rate: 100, price: 110, forex: 88, forexPrice: 114, vatType: 106, vatPct: 74,
  itemAmount: 128, received: 132, mfgOrder: 180, workOrder: 114,
};
// Sized so each column's own uppercase header label fits without truncating at the DEFAULT
// width, and still comfortably fits (or falls back to the ellipsis this pass added) at the
// MIN width — "Manufacturing Order"/"Received / Shipped" are the two long outliers that drove
// these up from a flat minimum; every other column stays tight and numeric-narrow.
const MIN_WIDTHS: Record<ColKey, number> = {
  type: 96, code: 104, name: 150, variant: 88, color: 90, quantity: 82, unit: 70,
  rate: 80, price: 90, forex: 76, forexPrice: 104, vatType: 90, vatPct: 66,
  itemAmount: 108, received: 116, mfgOrder: 150, workOrder: 104,
};
const DEL_W = 44;

// Every column is its own bounded spreadsheet cell: right + bottom border on every cell
// (header and body alike), plus a left border added only to the very first column so the
// whole grid gets a complete outline without doubling the border at every internal seam
// (two 1px borders from adjacent cells sitting at the exact same pixel would either double
// the apparent thickness or fight each other depending on paint order — the standard, correct
// fix used by every real grid library is to draw one border per seam, not two).
const CELL_BORDER = "border-r border-b border-border";
const FIRST_COL_BORDER = "border-l border-border";

// No pinned/sticky columns, by explicit design: every column — including Type/Code/Name and
// the Delete action column — scrolls together with the horizontal scrollbar, plain-table
// behavior like Excel. (Type/Code/Name stay first via FIXED_COLS above, but that only locks
// their DISPLAY ORDER — it's not position:sticky, no z-index layering, no overlay, nothing
// that can overlap or block pointer events on the columns scrolling beside it.)

const ROW_H = "h-12"; // 48px — roomy top/bottom breathing room for both display and edit mode
const HEADER_H = "h-11"; // 44px — a touch tighter than body rows, matching how most ERP grids differentiate the two
const CELL_PAD = "px-3.5"; // 14px — slightly more than the original px-3, applied identically to static text AND the editor's own internal padding

// The single style every mounted editor (EditableGridInput / SelectTrigger / AutocompleteTextCell's
// input) renders through — identical height/typography, and since it only ever exists while
// `editing` is true for that one cell, there's no "always-on input" look at rest anywhere in
// the grid. Deliberately FLUSH: no border, no radius, no outer margin of its own — the editor's
// own box fills the wrap exactly (h-full === the cell's full height, ROW_H), so nothing about
// its box model changes between display mode and edit mode except the ring below. Border/radius
// live on the WRAP or the cell's own ring instead of "an input floating inside a cell," which is
// what produced the double-border look this replaced. Text still gets breathing room — px-3.5
// matches CELL_PAD exactly, so display-mode text and edit-mode text sit at the identical
// horizontal offset — via the editor's own internal padding, not an outer gap.
// h-full! (Tailwind v4's trailing-bang !important modifier, not v3's leading !h-full) is
// required specifically for SelectTrigger: shadcn's own base classes set height via a
// variant-scoped `data-[size=default]:h-9`, which tailwind-merge doesn't recognize as
// conflicting with a plain `h-full` (different variant scope), so both rules land in the
// stylesheet and the variant-scoped one won unpredictably — confirmed live, every Select-based
// editor (Type/Unit/Forex/VAT Type) rendered at a fixed 36px instead of the full row height
// until this was forced. Harmless on the plain Input/AutocompleteTextCell cases too.
const EDITOR_CONTROL = "h-full! w-full min-w-0 rounded-none border-0 bg-background px-3.5 text-[13px] font-medium shadow-none focus-visible:ring-0";
// items-stretch (not items-center) is what lets a child's own h-full actually fill the wrap;
// the literal ROW_H class name is repeated here (not `cn("flex items-stretch", ROW_H)`) only
// because this constant is declared once and ROW_H's own value is unlikely to change without
// this comment being noticed — if ROW_H's Tailwind class ever changes, update this one too.
const EDITOR_WRAP = "flex h-12 items-stretch";

const INVENTORY_CARDS_LIST_PATH = "/dashboard/legacy-erp/inventory-cards-list";

const uid = () => Math.random().toString(36).slice(2, 10);

// Type dropdown — see purchase-order.service.ts's own comment on ITEM_TYPE_SERVICE: no
// lookup/enum table exists for "item type" in the migrated schema, so this 3-value mapping is
// the one deliberate hardcoded exception the spec itself calls out ("except where explicitly
// mentioned"). itemType is the numeric value actually persisted to IM_OrderReceiptItem.
type TypeKind = "inventory" | "service" | "fixedasset";
const TYPE_OPTIONS: { value: TypeKind; label: string; itemType: number }[] = [
  { value: "inventory", label: "Inventory", itemType: 1 },
  { value: "service", label: "Service", itemType: 2 },
  { value: "fixedasset", label: "Fixed Asset", itemType: 3 },
];
const typeKindFromItemType = (itemType: number | null | undefined): TypeKind =>
  itemType === 2 ? "service" : itemType === 3 ? "fixedasset" : "inventory";

interface LineRow {
  clientId: string; // stable React key + local identity, same convention as Costing Sheet's own rows (id: uid())
  __rowId: number | null; // IM_OrderReceiptItem.RecId once persisted, null for a not-yet-saved row
  itemType: number;
  typeKind: TypeKind;
  inventoryId: number | null; // Type=Inventory or Type=Fixed Asset (both are IM_Item rows)
  serviceCardId: number | null; // Type=Service (IM_OrderReceiptItem.ServiceCardId -> SM_Service)
  sourceType: string | null; // 'fabric'|'yarn'|'trim'|'fixedasset' — which per-type screen this line's Code came from
  code: string;
  name: string;
  quantity: string;
  unitId: number | null;
  unit: string; // display code, e.g. "PCS" — UnitId is the real persisted FK
  // Stock on Hand — display-only, sourced from the SAME inventoryCards.list() call already
  // used to resolve Code/Name (and, live, from the Inventory lookup's own already-fetched row
  // data). Not persisted anywhere on this line — it's a live snapshot of the item master, not
  // a field IM_OrderReceiptItem owns, so it's never sent in buildDto.
  stockOnHand: number | null;
  colorCardId: string | null; // ColorCard.id (text/cuid) — null when a free-typed custom color hasn't resolved to a record yet
  color: string;
  rate: string;
  price: number | null; // computed: Quantity x Rate
  forexId: number | null;
  forexCode: string;
  forexRate: string;
  currencyPrice: string; // ForexUnitPrice
  vatIncluded: 0 | 1;
  vatRate: string;
  lineAmount: number | null; // computed: NetItemTotal
  receivedQuantity: string;
  manufacturingOrderId: number | null; // IM_OrderReceiptItem.ManufacturingOrderId -> MA_WorkOrder
  manufacturingOrderNo: string; // display text (WorkOrderNo), resolved from manufacturingOrderId
  workOrderReceiptItemId: string;
  // Variant — free text only, UI scaffolding for a future Variant Master. There is no scalar
  // "Variant" column on IM_OrderReceiptItem (and adding one is out of scope for this pass —
  // no schema/DTO changes), so this field is intentionally client-side-only: it is never sent
  // in buildDto and never persisted. The composite Variant1+Variant2 breakdown feature that
  // previously lived on this column (IM_OrderReceiptItemVariant, a real one-to-many
  // relationship) was removed from the UI per explicit confirmation; the backend endpoints it
  // used are untouched and still exist, just unreferenced from this screen now.
  variant: string;
}

const emptyLine = (): LineRow => ({
  clientId: uid(), __rowId: null, itemType: 1, typeKind: "inventory", inventoryId: null, serviceCardId: null, sourceType: null,
  code: "", name: "", quantity: "", unitId: null, unit: "", stockOnHand: null, colorCardId: null, color: "", rate: "", price: null,
  forexId: null, forexCode: "", forexRate: "", currencyPrice: "",
  vatIncluded: 0, vatRate: "", lineAmount: null,
  receivedQuantity: "", manufacturingOrderId: null, manufacturingOrderNo: "", workOrderReceiptItemId: "",
  variant: "",
});

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt2 = (n: number | null) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Plain-text display for an editable numeric field's string value — thousands separators,
// trimmed decimals, an em dash when empty (never "0" for a field nobody has typed into yet).
const fmtCell = (v: string) => (v === "" || v == null ? "—" : num(v).toLocaleString(undefined, { maximumFractionDigits: 4 }));

// Quantity x Rate -> Price -> VAT -> Line Amount, per the required calc chain. VAT Exclusive
// adds VatRate% on top of Price; VAT Inclusive means Price already includes it.
function recalc(row: LineRow): LineRow {
  const price = num(row.quantity) * num(row.rate);
  const vatAmount = price * (num(row.vatRate) / 100);
  const lineAmount = row.vatIncluded ? price : price + vatAmount;
  const currencyPrice = row.forexRate ? num(row.rate) * num(row.forexRate) : num(row.currencyPrice) || null;
  return { ...row, price, lineAmount, currencyPrice: currencyPrice != null ? String(currencyPrice) : row.currencyPrice };
}

const isBlankLine = (row: LineRow) => !row.inventoryId && !row.serviceCardId && !row.code.trim();

interface Props {
  orderReceiptId: number | null;
  readOnly?: boolean;
}

// Imperative handle so the parent transaction screen can trigger the "commit draft lines"
// step of the standard header-then-lines Save workflow right after it receives the
// newly-generated PurchaseOrderId — the grid is the only thing that knows which rows are
// still unsaved drafts, so it owns persisting them, not the parent.
export interface PurchaseOrderLineGridHandle {
  commitDrafts: (newOrderReceiptId: number) => Promise<void>;
}

export const PurchaseOrderLineGrid = forwardRef<PurchaseOrderLineGridHandle, Props>(function PurchaseOrderLineGrid(
  { orderReceiptId, readOnly = false },
  ref,
) {
  const [loading, setLoading] = useState(false);
  // Never starts empty — the screen must always open with one editable row.
  const [rows, setRows] = useState<LineRow[]>(() => [emptyLine()]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Local, UI-only display filter — narrows which rows are rendered, never touches the
  // underlying `rows` state, persistence, or the always-present trailing blank row.
  const [searchTerm, setSearchTerm] = useState("");
  // Service Code and Manufacturing Order both use the existing LookupDialog (a debounced
  // server-search popup already reused elsewhere — see lookup-dialog.tsx) instead of the
  // full-screen Workspace tab Inventory uses, since neither has (or needs) a dedicated
  // management screen. One shared dialog instance per field, driven by "which row is active",
  // the same pattern unit-item-detail-grid.tsx already establishes for its own Unit picker.
  const [serviceLookupClientId, setServiceLookupClientId] = useState<string | null>(null);
  const [moLookupClientId, setMoLookupClientId] = useState<string | null>(null);
  const pendingLookupClientId = useRef<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());

  // Unit/Forex/Color are fetched once (same "one unscoped list call" approach already
  // established for these small master lists) — the same masters Costing Sheet itself uses
  // for Category/Currency/Shipping Terms.
  const [unitOptions, setUnitOptions] = useState<any[]>([]);
  const [forexOptions, setForexOptions] = useState<any[]>([]);
  const [colorOptions, setColorOptions] = useState<any[]>([]);
  // Code field's smart-search datasource — the SAME Inventory Card List aggregation
  // hydrateCodesNames already uses to resolve saved lines' Code/Name, fetched once here too so
  // typing into a brand-new (not-yet-saved) row's Code field has something to search against
  // immediately, without a per-keystroke request.
  const [inventoryOptions, setInventoryOptions] = useState<any[]>([]);

  useEffect(() => {
    legacyErpApi.lookupTable("unit").then((r: any) => setUnitOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.lookupTable("forex").then((r: any) => setForexOptions(Array.isArray(r) ? r : [])).catch(() => {});
    plmApi.colors.list().then((r: any) => setColorOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.inventoryCards.list().then((r: any) => setInventoryOptions(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  // Split once (not per-row, per-render) into the two datasources Code's smart search actually
  // needs — Inventory/plain-item rows vs. Fixed Asset rows are both IM_Item, distinguished only
  // by sourceType, exactly the same split openLookupForRow already applies to the full-screen
  // lookup. inventoryById resolves a picked suggestion's id back to the full record (stockOnHand
  // etc.) the way selecting from the full lookup dialog already does.
  const inventoryCodeOptions = useMemo(
    () => inventoryOptions.filter((o) => o.sourceType !== "fixedasset").map((o) => ({ id: String(o.id), code: o.inventoryCode, name: o.inventoryName })),
    [inventoryOptions],
  );
  const fixedAssetCodeOptions = useMemo(
    () => inventoryOptions.filter((o) => o.sourceType === "fixedasset").map((o) => ({ id: String(o.id), code: o.inventoryCode, name: o.inventoryName })),
    [inventoryOptions],
  );
  const inventoryById = useMemo(() => new Map(inventoryOptions.map((o) => [String(o.id), o])), [inventoryOptions]);

  const fromApiRow = (r: any): LineRow => ({
    clientId: uid(),
    __rowId: r.id,
    itemType: r.itemType ?? 1,
    typeKind: typeKindFromItemType(r.itemType),
    inventoryId: r.inventoryId ?? null,
    serviceCardId: r.serviceCardId ?? null,
    sourceType: null,
    code: "", name: "",
    quantity: r.quantity != null ? String(r.quantity) : "",
    unitId: r.unitId ?? null,
    unit: "",
    stockOnHand: null,
    colorCardId: r.colorCardId ?? null,
    color: "",
    rate: r.unitPrice != null ? String(r.unitPrice) : "",
    price: r.itemTotal ?? null,
    forexId: r.forexId ?? null,
    forexCode: "",
    forexRate: r.forexRate != null ? String(r.forexRate) : "",
    currencyPrice: r.forexUnitPrice != null ? String(r.forexUnitPrice) : "",
    vatIncluded: r.vatIncluded ? 1 : 0,
    vatRate: r.vatRate != null ? String(r.vatRate) : "",
    lineAmount: r.netItemTotal ?? null,
    receivedQuantity: r.receivedQuantity != null ? String(r.receivedQuantity) : "",
    manufacturingOrderId: r.manufacturingOrderId ?? null,
    // Fallback to the legacy free-text value (pre-existing rows saved before this column
    // existed) only when there's no real FK to resolve a display name from.
    manufacturingOrderNo: r.manufacturingOrderId == null ? (r.manufacturingOrderNo ?? "") : "",
    workOrderReceiptItemId: r.workOrderReceiptItemId != null ? String(r.workOrderReceiptItemId) : "",
    variant: "", // no backend source yet — see the LineRow field comment above
  });

  // Resolve Code/Name for already-persisted lines via the same Inventory Card List
  // aggregation — its `list()` already returns every Fabric/Yarn/Trim row's code/name/unit,
  // so a single call resolves every line's display text, no per-line lookup calls.
  const hydrateCodesNames = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.length) return list;
    try {
      const all: any = await legacyErpApi.inventoryCards.list();
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((r: any) => [String(r.id), r]));
      return list.map((row) => {
        if (!row.inventoryId) return row;
        const match = byId.get(String(row.inventoryId));
        if (!match) return row;
        return { ...row, code: match.inventoryCode, name: match.inventoryName, sourceType: match.sourceType, unit: row.unit || match.unit || "", stockOnHand: match.stockOnHand ?? null };
      });
    } catch {
      return list;
    }
  };

  const hydrateUnits = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.unitId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("unit");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((u: any) => [String(u.id), u]));
      return list.map((row) => (row.unitId == null ? row : { ...row, unit: byId.get(String(row.unitId))?.code || byId.get(String(row.unitId))?.name || row.unit }));
    } catch {
      return list;
    }
  };

  const hydrateColors = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.colorCardId != null)) return list;
    try {
      const all: any = await plmApi.colors.list();
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((c: any) => [String(c.id), c]));
      return list.map((row) => (row.colorCardId == null ? row : { ...row, color: byId.get(String(row.colorCardId))?.code || byId.get(String(row.colorCardId))?.name || row.color }));
    } catch {
      return list;
    }
  };

  // Type=Service lines resolve Code/Name from SM_Service the same way Inventory/Fixed Asset
  // lines resolve theirs from IM_Item — through the generic lookup-table endpoint, reused
  // as-is (see legacy-master-lookup.service.ts's "service" entry).
  const hydrateServices = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.serviceCardId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("service");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((s: any) => [String(s.id), s]));
      return list.map((row) => {
        if (row.serviceCardId == null) return row;
        const match = byId.get(String(row.serviceCardId));
        return match ? { ...row, code: match.code || row.code, name: match.name || row.name, sourceType: "service" } : row;
      });
    } catch {
      return list;
    }
  };

  const hydrateManufacturingOrders = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.manufacturingOrderId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("manufacturing-order");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((w: any) => [String(w.id), w]));
      return list.map((row) => (row.manufacturingOrderId == null ? row : { ...row, manufacturingOrderNo: byId.get(String(row.manufacturingOrderId))?.name || row.manufacturingOrderNo }));
    } catch {
      return list;
    }
  };


  const load = async (idOverride?: number | null) => {
    const id = idOverride ?? orderReceiptId;
    if (!id) {
      setRows([emptyLine()]);
      return;
    }
    setLoading(true);
    try {
      const r: any = await legacyErpApi.purchaseOrders.listItems(id);
      const list = (Array.isArray(r) ? r : []).map(fromApiRow);
      const withCodesNames = await hydrateCodesNames(list); // resolves Inventory + Fixed Asset (both IM_Item)
      const withServices = await hydrateServices(withCodesNames);
      const withUnits = await hydrateUnits(withServices);
      const withColors = await hydrateColors(withUnits);
      const withMOs = await hydrateManufacturingOrders(withColors);
      const recalculated = withMOs.map(recalc);
      // No trailing blank row auto-appended here — rows are added ONLY by clicking Add Row
      // (see addRow below). A newly-loaded order with existing lines shows exactly those
      // lines; a brand-new order with none yet still gets the one starting blank row so
      // there's somewhere to click before Add Row has ever been pressed.
      setRows(recalculated.length ? recalculated : [emptyLine()]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load purchase order lines");
      setRows([emptyLine()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [orderReceiptId]);

  // Wrapped in useCallback purely for referential stability (a pure function of `row`, no
  // external deps) — lets persistRow below keep a stable identity too instead of recreating
  // a new closure, and therefore a new function reference passed to every cell, on every
  // keystroke in any other cell.
  const buildDto = useCallback((row: LineRow) => ({
    itemType: row.itemType,
    // inventoryId/serviceCardId are sent as explicit null (not undefined) when cleared —
    // Changing Type must actually clear whichever FK the previous type used, not just leave
    // stale data behind (see handleTypeChange below).
    inventoryId: row.inventoryId,
    serviceCardId: row.serviceCardId,
    quantity: row.quantity === "" ? undefined : num(row.quantity),
    unitId: row.unitId ?? undefined,
    unitPrice: row.rate === "" ? undefined : num(row.rate),
    forexId: row.forexId ?? undefined,
    forexRate: row.forexRate === "" ? undefined : num(row.forexRate),
    forexUnitPrice: row.currencyPrice === "" ? undefined : num(row.currencyPrice),
    vatIncluded: row.vatIncluded,
    vatRate: row.vatRate === "" ? undefined : num(row.vatRate),
    itemTotal: row.price ?? undefined,
    netItemTotal: row.lineAmount ?? undefined,
    receivedQuantity: row.receivedQuantity === "" ? undefined : num(row.receivedQuantity),
    manufacturingOrderId: row.manufacturingOrderId,
    workOrderReceiptItemId: row.workOrderReceiptItemId === "" ? undefined : num(row.workOrderReceiptItemId),
    colorCardId: row.colorCardId,
  }), []);

  // Persists one row: creates it the first time it stops being blank, updates it on every
  // commit after that (cell edits commit on blur/select — see the cells below — so typing
  // never fires a request per keystroke). A row that already exists (__rowId set) must still
  // persist even if it's *currently* blank — that's exactly what happens right after Type is
  // changed and clears Code/Name/Color/Manufacturing Order, and that clearing has to reach
  // the database, not just the UI.
  const persistRow = useCallback(async (clientId: string, row: LineRow) => {
    if (!orderReceiptId || savingIds.has(clientId)) return;
    if (row.__rowId == null && isBlankLine(row)) return;
    setSavingIds((s) => new Set(s).add(clientId));
    try {
      if (row.__rowId == null) {
        const saved: any = await legacyErpApi.purchaseOrders.createItem(orderReceiptId, buildDto(row));
        // No auto-appended trailing row here either — a line becoming saved is not a request
        // for another one; the next row only ever appears when Add Row is clicked.
        setRows((prev) => prev.map((r) => (r.clientId === clientId && r.__rowId == null ? { ...r, __rowId: saved.id } : r)));
      } else {
        await legacyErpApi.purchaseOrders.updateItem(orderReceiptId, row.__rowId, buildDto(row));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save line");
    } finally {
      setSavingIds((s) => { const next = new Set(s); next.delete(clientId); return next; });
    }
  }, [orderReceiptId, savingIds, buildDto]);

  // Standard ERP transaction workflow: called by the parent right after it saves the header
  // and receives the new PurchaseOrderId. Bulk-creates every draft row typed while
  // orderReceiptId was still null, then reloads from the server so every row ends up with a
  // real __rowId — invisible to the user as a single "Save" action.
  const commitDrafts = async (newOrderReceiptId: number) => {
    const draftRows = rows.filter((r) => !isBlankLine(r) && r.__rowId == null);
    for (const row of draftRows) {
      try {
        await legacyErpApi.purchaseOrders.createItem(newOrderReceiptId, buildDto(row));
      } catch (e: any) {
        toast.error(e.message || "Failed to save a line item");
      }
    }
    await load(newOrderReceiptId);
  };

  useImperativeHandle(ref, () => ({ commitDrafts }), [rows]);

  // Unconditional append — same as Costing Sheet's own addRaw/addLabor/addOther.
  const addRow = () => setRows((prev) => [...prev, emptyLine()]);

  const removeRow = async (clientId: string) => {
    const row = rows.find((r) => r.clientId === clientId);
    if (!row) return;
    if (row.__rowId != null && orderReceiptId) {
      try {
        await legacyErpApi.purchaseOrders.removeItem(orderReceiptId, row.__rowId);
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    // No replacement blank row auto-appended after a delete — same rule as everywhere else in
    // this file now: Add Row is the only thing that ever adds a row. Deleting the last
    // remaining row is allowed to leave the grid with zero rows; Add Row is right there.
    setRows((prev) => prev.filter((r) => r.clientId !== clientId));
  };

  const updateRow = useCallback((clientId: string, patch: Partial<LineRow>, commit = false) => {
    // Typing into a row — even the last one — never creates another row. Rows are added ONLY
    // by clicking Add Row (see addRow above); this used to auto-append a trailing blank line
    // the moment the last row stopped being blank, which is exactly the "typing creates a new
    // row" behavior that's no longer wanted.
    setRows((prev) => prev.map((r) => {
      if (r.clientId !== clientId) return r;
      const updated = recalc({ ...r, ...patch });
      if (commit) persistRow(clientId, updated);
      return updated;
    }));
  }, [persistRow]);

  // Inventory lookup (Code column) — the EXISTING Inventory Card List reused as a real
  // Workspace tab in lookup mode, opened via a search-icon button next to the Code input,
  // the same "Input + search icon Button" pattern Costing Sheet's own Style/Current Account
  // fields already use — not a new lookup UI.
  const { openFullScreen: openInventoryLookup } = useMasterLookupField(
    "inventory",
    (selection) => {
      const clientId = pendingLookupClientId.current;
      pendingLookupClientId.current = null;
      if (!clientId) return;
      updateRow(clientId, {
        inventoryId: Number(selection.id),
        sourceType: selection.meta?.sourceType ?? null,
        code: selection.code,
        name: selection.name,
        stockOnHand: typeof selection.meta?.stockOnHand === "number" ? selection.meta.stockOnHand : null,
      }, true);
    },
    INVENTORY_CARDS_LIST_PATH,
  );

  // Fixed Asset reuses the exact same Inventory Card List lookup screen (both are IM_Item
  // rows) but filtered to sourceType=fixedasset via useMasterLookupField's extraParams, so
  // only Fixed Asset codes are offered — not a second picker.
  const openLookupForRow = useCallback((clientId: string, typeKind: TypeKind) => {
    pendingLookupClientId.current = clientId;
    openInventoryLookup(typeKind === "fixedasset" ? { sourceType: "fixedasset" } : undefined);
  }, [openInventoryLookup]);

  // Service Code — small master (SM_Service), searched through the generic lookup-table
  // endpoint's existing debounced-search architecture (LookupDialog), reused verbatim.
  const fetchServiceOptions = async (search: string) => {
    const r: any = await legacyErpApi.lookupTable("service", search || undefined);
    return Array.isArray(r) ? r : [];
  };
  const activeServiceRow = rows.find((r) => r.clientId === serviceLookupClientId);

  // Manufacturing Order — same reused LookupDialog architecture, backed by MA_WorkOrder via
  // the generic lookup-table endpoint's "manufacturing-order" entry.
  const fetchManufacturingOrderOptions = async (search: string) => {
    const r: any = await legacyErpApi.lookupTable("manufacturing-order", search || undefined);
    return Array.isArray(r) ? r : [];
  };
  const activeMoRow = rows.find((r) => r.clientId === moLookupClientId);

  // Changing Type clears every field that depended on the previous type (Code/Name/Color/
  // Manufacturing Order) and reloads the correct lookup — literally: the next time the Code
  // lookup opens for this row, it's already scoped to the new Type, and Color/Manufacturing
  // Order dropdowns are re-fetched fresh sources anyway (colorOptions is one shared cached
  // list; the MO/Service dialogs re-search on open), so no explicit "reload" call is needed
  // beyond clearing the row's own selected values.
  const handleTypeChange = useCallback((clientId: string, typeKind: TypeKind) => {
    const opt = TYPE_OPTIONS.find((t) => t.value === typeKind) ?? TYPE_OPTIONS[0];
    updateRow(clientId, {
      typeKind, itemType: opt.itemType,
      inventoryId: null, serviceCardId: null, sourceType: null, code: "", name: "",
      colorCardId: null, color: "",
      manufacturingOrderId: null, manufacturingOrderNo: "",
    }, true);
    setEditing(false);
  }, [updateRow]);

  // ---- Excel-style click-to-edit cell model ------------------------------------------------
  // `cursor` is the single currently-active cell (grid-wide, not per-row); `editing` says
  // whether that cell's real editor is mounted in place of its plain-text display. Only ever
  // one editor exists across the whole grid at any time.
  const [cursor, setCursor] = useState<{ clientId: string; col: ColKey } | null>(null);
  const [editing, setEditing] = useState(false);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cellKey = (clientId: string, col: ColKey) => `${clientId}:${col}`;
  const registerCell = (key: string) => (el: HTMLDivElement | null) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };

  const rowsAtRest = rows.length; // used for the Delete-icon visibility rule below (unaffected by search filtering)
  // Memoized: this filter reran (and allocated a brand-new array) on every render before,
  // which fed straight into cell-navigation math (moveCursor) and the row map below — a new
  // array every keystroke, even in an unrelated cell, is exactly the kind of avoidable work
  // this pass asked to cut. Only recomputes when the actual inputs (rows, searchTerm) change.
  const visibleRows = useMemo(
    () => rows.filter((r) => isBlankLine(r) || !searchTerm.trim() ||
      [r.code, r.name, r.manufacturingOrderNo, r.color, r.unit].some((v) => (v || "").toLowerCase().includes(searchTerm.trim().toLowerCase()))),
    [rows, searchTerm],
  );

  useEffect(() => {
    if (!cursor || editing) return;
    cellRefs.current.get(cellKey(cursor.clientId, cursor.col))?.focus();
  }, [cursor, editing]);

  // ---- Column reordering + visibility (drag-and-drop, Column Manager) -----------------------
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(REORDERABLE_DEFAULT);
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColKey>>(new Set());
  // The actual display order: Type/Code/Name first (always, unreorderable, never hidden), then
  // whichever of the rest the user hasn't hidden, in whatever order they've dragged them into.
  // Everything downstream (colgroup, header, body cells, keyboard nav) reads from this instead
  // of the static COLUMNS declaration order — a hidden column is filtered out right here, so it
  // automatically disappears from resize/keyboard-nav/rendering everywhere at once rather than
  // needing a hidden-column check duplicated at each of those sites.
  const displayColumnDefs = useMemo(
    () => [...FIXED_COLS, ...columnOrder.filter((k) => !hiddenColumns.has(k))].map((k) => COLUMN_BY_KEY.get(k)!),
    [columnOrder, hiddenColumns],
  );
  const navOrder = useMemo(() => displayColumnDefs.filter((c) => c.navigable).map((c) => c.key), [displayColumnDefs]);

  // Restore persisted column order + visibility on mount — a session override (this tab, right
  // now) wins if present, otherwise fall back to whatever was permanently saved for this user,
  // otherwise the built-in default (nothing hidden, declaration order). One-time effect, one API
  // call at most (skipped entirely when a session value already answers the question), not a
  // request per render or per column change.
  useEffect(() => {
    let sessionOrderFound = false;
    try {
      const sessionRaw = sessionStorage.getItem(SESSION_COLUMN_ORDER_KEY);
      if (sessionRaw) { setColumnOrder(sanitizeColumnOrder(JSON.parse(sessionRaw))); sessionOrderFound = true; }
    } catch {
      // Malformed sessionStorage entry — fall through to the permanent/default source below.
    }
    try {
      const sessionHiddenRaw = sessionStorage.getItem(SESSION_HIDDEN_COLUMNS_KEY);
      if (sessionHiddenRaw) setHiddenColumns(new Set(sanitizeHiddenColumns(JSON.parse(sessionHiddenRaw))));
    } catch {
      // Malformed sessionStorage entry — fall through to the permanent/default source below.
    }
    if (sessionOrderFound) return; // this tab already has an explicit session choice — skip the network round trip entirely
    settingsApi.getCurrentSettings()
      .then((s: any) => {
        const savedOrder = s?.tablePreferences?.[PERMANENT_COLUMN_ORDER_SETTINGS_KEY];
        if (Array.isArray(savedOrder) && savedOrder.length) setColumnOrder(sanitizeColumnOrder(savedOrder));
        const savedHidden = s?.tablePreferences?.[PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY];
        if (Array.isArray(savedHidden)) setHiddenColumns(new Set(sanitizeHiddenColumns(savedHidden)));
      })
      .catch(() => {});
  }, []);

  // Native HTML5 drag-and-drop — no library needed for reordering a handful of header cells.
  // Fixed columns are simply never made draggable and never accept a drop (guarded in both
  // handlers below), so they can't be moved and nothing can land in front of them.
  const dragColRef = useRef<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);
  const handleDragStartCol = (key: ColKey) => (e: React.DragEvent) => {
    dragColRef.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOverCol = (key: ColKey) => (e: React.DragEvent) => {
    if (!dragColRef.current || dragColRef.current === key || FIXED_COLS.includes(key)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== key) setDragOverCol(key);
  };
  const handleDropCol = (key: ColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!dragged || dragged === key || FIXED_COLS.includes(key)) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(key), 0, dragged);
      return next;
    });
  };
  const handleDragEndCol = () => { dragColRef.current = null; setDragOverCol(null); };

  // ---- Column Manager modal (order + visibility, session/permanent persistence) -------------
  // A second, explicit entry point onto the SAME columnOrder/hiddenColumns state the inline
  // header-drag above already writes to (order only — visibility has no inline-header
  // equivalent, this modal is its only entry point) — a dedicated list is easier to operate
  // precisely than dragging small header cells, and is the only place session/permanent
  // persistence is offered from. Drafts into its own modalOrder/modalHidden state so Cancel can
  // discard without touching the live grid; Reset Default only resets the DRAFT (still requires
  // an explicit Save to actually commit it), the same as every other change made inside this
  // modal — one consistent mental model instead of Reset being a special one-off exception.
  const [reorderOpen, setReorderOpen] = useState(false);
  const [modalOrder, setModalOrder] = useState<ColKey[]>(columnOrder);
  const [modalHidden, setModalHidden] = useState<Set<ColKey>>(hiddenColumns);
  const [columnSearch, setColumnSearch] = useState("");
  const [savingColumnPrefs, setSavingColumnPrefs] = useState(false);
  const modalDragRef = useRef<ColKey | null>(null);
  const [modalDragOver, setModalDragOver] = useState<ColKey | null>(null);

  const openReorderModal = () => {
    setModalOrder(columnOrder);
    setModalHidden(new Set(hiddenColumns));
    setColumnSearch("");
    setReorderOpen(true);
  };
  const handleModalDragStart = (key: ColKey) => (e: React.DragEvent) => {
    modalDragRef.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleModalDragOver = (key: ColKey) => (e: React.DragEvent) => {
    if (!modalDragRef.current || modalDragRef.current === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (modalDragOver !== key) setModalDragOver(key);
  };
  const handleModalDrop = (key: ColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = modalDragRef.current;
    modalDragRef.current = null;
    setModalDragOver(null);
    if (!dragged || dragged === key) return;
    setModalOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(key), 0, dragged);
      return next;
    });
  };
  const handleModalDragEnd = () => { modalDragRef.current = null; setModalDragOver(null); };
  const toggleModalHidden = (key: ColKey, visible: boolean) => {
    setModalHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key); else next.add(key);
      return next;
    });
  };
  const resetModalToDefault = () => { setModalOrder(REORDERABLE_DEFAULT); setModalHidden(new Set()); };

  // Applies immediately to the live grid AND writes sessionStorage — "Save Permanently" calls
  // this too (in addition to its own DB write) so the current tab reflects the exact same value
  // right away without waiting on a round trip.
  const applySessionColumnPrefs = (order: ColKey[], hidden: Set<ColKey>) => {
    setColumnOrder(order);
    setHiddenColumns(hidden);
    try {
      sessionStorage.setItem(SESSION_COLUMN_ORDER_KEY, JSON.stringify(order));
      sessionStorage.setItem(SESSION_HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(hidden)));
    } catch {}
  };
  const saveForSession = () => { applySessionColumnPrefs(modalOrder, modalHidden); setReorderOpen(false); };
  const savePermanently = async () => {
    setSavingColumnPrefs(true);
    try {
      applySessionColumnPrefs(modalOrder, modalHidden);
      await settingsApi.updateCurrentSettings({
        tablePreferences: {
          [PERMANENT_COLUMN_ORDER_SETTINGS_KEY]: modalOrder,
          [PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY]: Array.from(modalHidden),
        },
      });
      toast.success("Column preferences saved");
      setReorderOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save column preferences");
    } finally {
      setSavingColumnPrefs(false);
    }
  };
  const modalOrderFiltered = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return modalOrder;
    return modalOrder.filter((k) => COLUMN_BY_KEY.get(k)!.label.toLowerCase().includes(q));
  }, [modalOrder, columnSearch]);

  const moveCursor = useCallback((rowDelta: number, colDelta: number) => {
    setCursor((current) => {
      if (!current) return current;
      const rowIdx = visibleRows.findIndex((r) => r.clientId === current.clientId);
      const colIdx = navOrder.indexOf(current.col);
      if (rowIdx === -1 || colIdx === -1) return current;
      const nextRow = visibleRows[Math.min(Math.max(rowIdx + rowDelta, 0), visibleRows.length - 1)];
      const nextCol = navOrder[Math.min(Math.max(colIdx + colDelta, 0), navOrder.length - 1)];
      return { clientId: nextRow.clientId, col: nextCol };
    });
    setEditing(false);
  }, [visibleRows, navOrder]);

  // Snapshot of the row exactly as it was the instant editing began — text/autocomplete
  // editors commit to row state on every keystroke (onChange), not just on commit, so without
  // this Escape had nothing correct to revert TO: it only ever exited edit mode, leaving
  // whatever had already been typed sitting in the row (and liable to be saved for real the
  // next time any other field on that row committed). cancelEdit() below restores this exact
  // snapshot; it's cleared to null whenever a cell activates for a different row/reason so a
  // stale snapshot can never be applied by mistake.
  const preEditSnapshotRef = useRef<LineRow | null>(null);
  const cancelEdit = useCallback((clientId: string) => {
    const snap = preEditSnapshotRef.current;
    preEditSnapshotRef.current = null;
    if (snap && snap.clientId === clientId) {
      setRows((prev) => prev.map((r) => (r.clientId === clientId ? snap : r)));
    }
    setEditing(false);
  }, []);

  // Click / Enter / F2 — the single entry point into edit mode for every editable column.
  // Manufacturing Order has no local typable value (it's purely a picker, same lookup logic
  // as before this pass), so activating it opens the existing LookupDialog directly instead
  // of mounting an inline editor.
  const activateCell = useCallback((row: LineRow, col: ColKey) => {
    if (readOnly) return;
    setCursor({ clientId: row.clientId, col });
    const def = COLUMN_BY_KEY.get(col);
    if (!def?.editable) return;
    if (col === "mfgOrder") { setMoLookupClientId(row.clientId); return; }
    preEditSnapshotRef.current = row;
    setEditing(true);
  }, [readOnly]);

  const handleStaticKeyDown = useCallback((e: React.KeyboardEvent, row: LineRow, col: ColKey) => {
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); moveCursor(-1, 0); break;
      case "ArrowDown": e.preventDefault(); moveCursor(1, 0); break;
      case "ArrowLeft": e.preventDefault(); moveCursor(0, -1); break;
      case "ArrowRight": e.preventDefault(); moveCursor(0, 1); break;
      case "Enter": case "F2": e.preventDefault(); activateCell(row, col); break;
    }
  }, [moveCursor, activateCell]);

  // Commit + move — shared by every inline text/numeric editor's onKeyDown. Select/Popover
  // fields commit via their own onValueChange/onOpenChange instead (see the cells below).
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent, row: LineRow) => {
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(row.clientId); return; }
    if (e.key === "Enter") { e.preventDefault(); persistRow(row.clientId, row); setEditing(false); moveCursor(1, 0); return; }
    if (e.key === "Tab") { e.preventDefault(); persistRow(row.clientId, row); setEditing(false); moveCursor(0, e.shiftKey ? -1 : 1); }
  }, [persistRow, moveCursor, cancelEdit]);

  // ---- Resizable columns (component state only) --------------------------------------------
  const gridRootRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  const startResize = (key: ColKey) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[key];
    const onMove = (ev: MouseEvent) => {
      setColWidths((prev) => ({ ...prev, [key]: Math.max(MIN_WIDTHS[key], startWidth + (ev.clientX - startX)) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Double-click the resize handle to auto-fit — measures the real, currently-rendered
  // content (header label + every visible row's cell for that column) via scrollWidth, which
  // correctly reports an element's full content width even though `truncate` clips it
  // visually (that's the standard trick: overflow:hidden doesn't shrink scrollWidth). Only
  // ever-rendered rows can be measured this way (there's no virtualization to reach into), but
  // for a screen where every row is already in the DOM that's the real content, not a guess.
  const autoFitColumn = (key: ColKey) => {
    if (!gridRootRef.current) return;
    const els = gridRootRef.current.querySelectorAll<HTMLElement>(`[data-col="${key}"]`);
    let max = 0;
    els.forEach((el) => { max = Math.max(max, el.scrollWidth); });
    if (max === 0) return;
    const next = Math.min(480, Math.max(MIN_WIDTHS[key], max + 16));
    setColWidths((prev) => ({ ...prev, [key]: next }));
  };

  // Footer totals — computed from the full row set (not the search-narrowed visibleRows);
  // search should never make the running totals lie about what's actually on the document.
  // Memoized for the same reason visibleRows is: three reduce() passes over every row on
  // every render (including every keystroke in an unrelated cell) is pure waste once the
  // result only actually needs to change when `rows` itself changes.
  // totalRecords counts actual saved/displayed records — every non-blank row, i.e. exactly what
  // isBlankLine already excludes (the empty starter row, and nothing else now that rows are
  // never auto-appended) — never the raw visual row count.
  const { totalRecords, totalQuantity, totalAmount } = useMemo(() => {
    const realRows = rows.filter((r) => !isBlankLine(r));
    return {
      totalRecords: realRows.length,
      totalQuantity: realRows.reduce((s, r) => s + num(r.quantity), 0),
      totalAmount: realRows.reduce((s, r) => s + num(r.lineAmount ?? 0), 0),
    };
  }, [rows]);

  // Stock on Hand — tracks whichever row is currently the active cell (the grid's own
  // "selected row" concept), showing that row's item stock when it's an Inventory or Fixed
  // Asset line (both are real IM_Item rows with a stock figure; Service has none). The number
  // itself is never fetched separately here — it rides along on the exact same
  // inventoryCards.list() call that already resolves Code/Name (hydrateCodesNames) and on the
  // Inventory lookup's own already-fetched row (its meta payload), so selecting a different
  // line is a free lookup into data already in memory, not a new request.
  const stockRow = cursor ? rows.find((r) => r.clientId === cursor.clientId) : undefined;
  const showStock = !!stockRow && stockRow.inventoryId != null && (stockRow.typeKind === "inventory" || stockRow.typeKind === "fixedasset");

  // table-layout: fixed with an unconstrained ("auto") table width is what made resizing
  // silently stop working: the browser computes the table's own auto-width ONCE against its
  // containing block on first render, and does not reliably re-derive it purely from later
  // <col> width mutations — confirmed live (the colgroup's own width attribute updated
  // correctly on every drag, but the table's rendered width stayed pinned at its initial
  // value, so table-layout:fixed's proportional-shrink algorithm quietly rescaled every
  // column back down to fit). Giving the table an EXPLICIT width — the actual sum of every
  // column's current width — removes that ambiguity outright: there is nothing left for the
  // browser to "compute," so a resize (or a reorder, which never changes the sum) always
  // renders at exactly the width colWidths says it should.
  const totalTableWidth = displayColumnDefs.reduce((sum, c) => sum + colWidths[c.key], 0) + (!readOnly ? DEL_W : 0);

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div ref={gridRootRef} className="po-grid rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      {/* Exactly ONE scrolling element for the whole grid: the shared Table component's own
          built-in wrapper (`[data-slot="table-container"]`), styled here instead of wrapped in
          a second div. Two nested `overflow-auto` containers is what caused the reported bug —
          `position: sticky` in the header resolved against the WRONG ancestor once there were
          two scroll containers stacked on top of each other, which is what made the header
          (and the old pinned Type/Code/Name block) desync from the body and overlap it while
          scrolling. With a single scroll container the browser has exactly one unambiguous
          containing block to stick against, and there is nothing left to desync. */}
      <style>{`
        .po-grid [data-slot="table-container"] {
          max-height: 520px;
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .po-grid [data-slot="table-container"]::-webkit-scrollbar { height: 8px; width: 8px; }
        .po-grid [data-slot="table-container"]::-webkit-scrollbar-track { background: transparent; }
        .po-grid [data-slot="table-container"]::-webkit-scrollbar-thumb { background-color: var(--border); border-radius: 9999px; }
        .po-grid [data-slot="table-container"]::-webkit-scrollbar-thumb:hover { background-color: var(--muted-foreground); }
        .po-resize-handle:hover, .po-resize-handle.active { background-color: var(--primary); }
      `}</style>

      {/* Toolbar — Search left, Add Row right. Nothing else: Import/Export have no backend
          today, and a real ERP toolbar never ships an action that does nothing when clicked. */}
      <div className={cn(HEADER_H, "flex items-center justify-between gap-3 border-b border-border px-3")}>
        <div className="relative w-full max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search lines..."
            aria-label="Search detail lines"
            className="h-7 border-0 bg-muted/40 pl-8 text-[13px] shadow-none focus-visible:ring-1"
          />
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={openReorderModal}>
              <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[13px]" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Row
            </Button>
          </div>
        )}
      </div>

      <Table
        role="grid"
        aria-label="Purchase order detail lines"
        aria-rowcount={visibleRows.length + 1}
        className="table-fixed"
        style={{ width: totalTableWidth, minWidth: "100%" }}
      >
        {/* table-layout: fixed + an explicit <colgroup> is what makes every column render at
            EXACTLY the same width in the header and every row — the standard, non-hacky way
            to build a fixed-width scrollable grid on a plain HTML table (no per-cell width
            guessing, no header/body drift). Resizing a column just updates colWidths, which
            re-renders this colgroup — every cell in that column follows automatically. */}
        <colgroup>
          {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
          {!readOnly && <col style={{ width: DEL_W }} />}
        </colgroup>
        <TableHeader>
          <TableRow role="row" className={cn(HEADER_H, "bg-muted hover:bg-muted")}>
            {displayColumnDefs.map((col, colIdx) => {
              const fixed = FIXED_COLS.includes(col.key);
              return (
                <TableHead
                  key={col.key}
                  role="columnheader"
                  scope="col"
                  // Drop-target handlers only — NOT a drag source. `draggable` lives on the
                  // label span below instead (see its own comment): making the whole <th> a
                  // native HTML5 drag source put the resize handle (a child of this element)
                  // inside that drag region too, and a `draggable=true` ancestor intercepts
                  // any mousedown-drag gesture started on a descendant — including the
                  // handle's own `draggable=false` — before startResize's mousemove logic
                  // ever got a chance to run. That's what made resizing silently do nothing.
                  onDragOver={!fixed ? handleDragOverCol(col.key) : undefined}
                  onDrop={!fixed ? handleDropCol(col.key) : undefined}
                  className={cn(
                    "relative p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                    CELL_BORDER,
                    colIdx === 0 && FIRST_COL_BORDER,
                    dragOverCol === col.key && "bg-primary/15",
                  )}
                >
                  {/* The label itself is the drag source (reordering), not the whole header
                      cell — see the comment on the <th> above for why that separation matters.
                      The resize handle below is a plain sibling, entirely outside this
                      draggable subtree, so a mousedown started on it can never be hijacked
                      into a native drag gesture. Every header label centers horizontally AND
                      vertically regardless of the column's own data alignment — headers read
                      as column titles, not as a preview of how the data below lines up. */}
                  <span
                    title={col.label}
                    draggable={!fixed && !readOnly}
                    onDragStart={!fixed ? handleDragStartCol(col.key) : undefined}
                    onDragEnd={!fixed ? handleDragEndCol : undefined}
                    data-col={col.key}
                    className={cn(
                      HEADER_H, "flex w-full min-w-0 items-center justify-center truncate text-center", CELL_PAD,
                      !fixed && !readOnly && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    {col.label}
                  </span>
                  <div
                    className="po-resize-handle absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                    onMouseDown={startResize(col.key)}
                    onDoubleClick={() => autoFitColumn(col.key)}
                    title="Drag to resize · double-click to auto-fit"
                    aria-hidden="true"
                  />
                </TableHead>
              );
            })}
            {!readOnly && (
              <TableHead
                role="columnheader"
                aria-label="Delete line actions"
                className={cn("p-0", CELL_BORDER)}
              />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
            {visibleRows.map((r, idx) => {
              const isRowActive = cursor?.clientId === r.clientId;
              const rowBg = isRowActive ? "bg-primary/10" : idx % 2 === 1 ? "bg-muted/20" : "bg-card";
              const rowHover = isRowActive ? "hover:bg-primary/15" : "hover:bg-muted/30";
              const isActive = (col: ColKey) => cursor?.clientId === r.clientId && cursor.col === col;
              // One shared way every cell — editable or not — gets its border plus "this is the
              // active cell" ring. The ring lives on the TD itself now, in BOTH static and
              // editing state, so display mode and edit mode show the exact same outline with
              // nothing added or removed when the transition happens (previously the editor had
              // its own separate border on top of this, which is what produced a visible
              // "double border" the moment a cell entered edit mode).
              const cellCls = (col: ColKey, extra?: string) => cn(CELL_BORDER, isActive(col) && "ring-2 ring-inset ring-primary", extra);

              const staticProps = (col: ColKey, opts: { value: React.ReactNode; align?: "left" | "right"; muted?: boolean; emphasis?: boolean }) => ({
                ref: registerCell(cellKey(r.clientId, col)),
                role: "gridcell",
                tabIndex: readOnly ? -1 : 0,
                // Native browser tooltip — shows the untruncated value on hover, per "show full
                // value on hover." Only meaningful for string values; computed numeric cells
                // pass a pre-formatted string too so this covers all of them uniformly.
                title: typeof opts.value === "string" ? opts.value : undefined,
                onClick: () => activateCell(r, col),
                onKeyDown: (e: React.KeyboardEvent) => handleStaticKeyDown(e, r, col),
                className: cn(
                  CELL_PAD,
                  "flex h-full w-full items-center text-[13px] font-medium leading-none outline-none cursor-default select-none",
                  opts.align === "right" ? "justify-end tabular-nums" : "justify-start",
                  opts.muted && "font-normal text-muted-foreground",
                  opts.emphasis && "font-semibold",
                ),
                // min-w-0 overrides the flex-item default of min-width:auto — without it a
                // flex child never shrinks below its own content's natural width, so `truncate`
                // on the span would never actually engage and long values (e.g. a Manufacturing
                // Order number in a narrowed column) would silently overflow the cell instead
                // of ellipsizing.
                // data-col lets autoFitColumn() measure this span's real (untruncated)
                // content width via scrollWidth when the user double-clicks that column's
                // resize handle.
                children: <span data-col={col} className="min-w-0 truncate">{opts.value}</span>,
              });

              // Every column's cell, keyed by ColKey — collected once per row, then rendered in
              // whichever order displayColumnDefs currently says (Type/Code/Name first, always;
              // the rest wherever the user has dragged them). None of the internal logic below
              // changed for this pass — every handler, editor and computed value is byte-for-byte
              // the same as before column reordering existed; only the collection/render
              // structure changed, from a fixed JSX sequence to a keyed lookup.
              const cells: Record<ColKey, React.ReactNode> = {
                // TYPE — always first (FIXED_COLS), and the one column that also carries the
                // grid's left outer border (every other column's own right border already
                // closes the seam before it — see CELL_BORDER's comment above). Plain in-flow
                // cell, no sticky/pinning — it scrolls with everything else and inherits the
                // row's own background (rowBg/rowHover, set once on the <tr>) without needing
                // its own copy of either class.
                type: (
                  <TableCell key="type" className={cellCls("type", FIRST_COL_BORDER)}>
                    {isActive("type") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <Select
                          value={r.typeKind}
                          defaultOpen
                          onOpenChange={(open) => !open && setEditing(false)}
                          onValueChange={(v) => handleTypeChange(r.clientId, v as TypeKind)}
                        >
                          <SelectTrigger className={EDITOR_CONTROL}><SelectValue /></SelectTrigger>
                          <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div {...staticProps("type", { value: TYPE_OPTIONS.find((t) => t.value === r.typeKind)?.label ?? "Inventory" })} />
                    )}
                  </TableCell>
                ),

                // CODE — always second column (FIXED_COLS). Smart-search autocomplete +
                // escalate-to-full-lookup icon, gated behind click-to-edit.
                code: (
                  <TableCell key="code" className={cellCls("code")}>
                    {isActive("code") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <AutocompleteTextCell
                          autoFocus
                          value={r.code}
                          // Service has no cached client-side list (it's a small, rarely-typed
                          // master already well served by the full lookup dialog below) — free
                          // typing still works there, just without inline suggestions.
                          options={r.typeKind === "fixedasset" ? fixedAssetCodeOptions : r.typeKind === "service" ? [] : inventoryCodeOptions}
                          disabled={readOnly}
                          showDropdownIcon
                          onChange={(v) => updateRow(r.clientId, { code: v })}
                          onCancel={() => cancelEdit(r.clientId)}
                          onDoubleClick={() => !readOnly && (r.typeKind === "service" ? setServiceLookupClientId(r.clientId) : openLookupForRow(r.clientId, r.typeKind))}
                          onSelectOption={(o) => {
                            const match = inventoryById.get(o.id);
                            setEditing(false);
                            updateRow(r.clientId, {
                              inventoryId: Number(o.id),
                              sourceType: match?.sourceType ?? r.sourceType,
                              code: o.code ?? "",
                              name: o.name ?? "",
                              stockOnHand: typeof match?.stockOnHand === "number" ? match.stockOnHand : null,
                            }, true);
                          }}
                          onCommit={(finalValue) => {
                            // Free-typed text with nothing picked from the suggestion list —
                            // save exactly what was typed, same as the plain input this
                            // replaced; the row's inventoryId/sourceType are left untouched
                            // (unchanged unless a suggestion above was picked, or the full
                            // lookup dialog resolved it).
                            setEditing(false);
                            updateRow(r.clientId, { code: finalValue }, true);
                          }}
                        />
                        <Button
                          variant="ghost" size="icon"
                          className="h-full w-8 shrink-0 rounded-none border-l border-border"
                          title={r.typeKind === "service" ? "Search Service" : r.typeKind === "fixedasset" ? "Search Fixed Asset" : "Search Inventory"}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => (r.typeKind === "service" ? setServiceLookupClientId(r.clientId) : openLookupForRow(r.clientId, r.typeKind))}
                        >
                          <Search className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div {...staticProps("code", { value: r.code || "—", muted: !r.code })} />
                    )}
                  </TableCell>
                ),

                // NAME — always third column (FIXED_COLS).
                name: (
                  <TableCell key="name" className={cellCls("name")}>
                    {isActive("name") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus
                          value={r.name}
                          disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { name: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("name", { value: r.name || "—", muted: !r.name })} />
                    )}
                  </TableCell>
                ),

                // VARIANT — free text + autocomplete, identical control/styling to Code/Color.
                // No backend field exists yet, so this only ever updates local row state
                // (commit is a no-op call with no API request — see onCommit below) — UI
                // scaffolding for a future Variant Master, per LineRow's own comment on
                // `variant`.
                variant: (
                  <TableCell key="variant" className={cellCls("variant")}>
                    {isActive("variant") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <AutocompleteTextCell
                          autoFocus
                          value={r.variant}
                          options={[]}
                          disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { variant: v })}
                          onCancel={() => cancelEdit(r.clientId)}
                          onCommit={(finalValue) => { setEditing(false); updateRow(r.clientId, { variant: finalValue.trim() }); }}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("variant", { value: r.variant || "—", muted: !r.variant })} />
                    )}
                  </TableCell>
                ),

                // COLOR — free text + autocomplete, identical control/styling to Code. No
                // strict validation: typing a value with no match creates a real new ColorCard
                // record on commit (reusing the existing plmApi.colors.create endpoint) so
                // ColorCardId stays the single source of truth — the field always displays
                // exactly what was typed or picked.
                color: (
                  <TableCell key="color" className={cellCls("color")}>
                    {isActive("color") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <AutocompleteTextCell
                          autoFocus
                          value={r.color}
                          options={colorOptions}
                          disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { color: v })}
                          onCancel={() => cancelEdit(r.clientId)}
                          onCommit={async (finalValue) => {
                            setEditing(false);
                            const text = finalValue.trim();
                            if (!text) { updateRow(r.clientId, { colorCardId: null, color: "" }, true); return; }
                            const match = colorOptions.find((c) =>
                              (c.code || "").toLowerCase() === text.toLowerCase() || (c.name || "").toLowerCase() === text.toLowerCase());
                            if (match) { updateRow(r.clientId, { colorCardId: match.id, color: match.code || match.name || text }, true); return; }
                            try {
                              // Matches the existing Color Card management screen's own create
                              // payload shape exactly (app/dashboard/.../color-cards/page.tsx) —
                              // `color` (hex swatch) and `branchId` are required, non-nullable
                              // columns on ColorCard with no default for branchId.
                              const user = getCurrentUser();
                              const created: any = await plmApi.colors.create({ code: text, name: text, color: "#000000", branchId: user?.branchId });
                              setColorOptions((prev) => [...prev, created]);
                              updateRow(r.clientId, { colorCardId: created.id, color: created.code || created.name || text }, true);
                            } catch (e: any) {
                              toast.error(e.message || "Failed to create color");
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("color", { value: r.color || "—", muted: !r.color })} />
                    )}
                  </TableCell>
                ),

                quantity: (
                  <TableCell key="quantity" className={cellCls("quantity")}>
                    {isActive("quantity") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus type="number" align="right" value={r.quantity} disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { quantity: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("quantity", { value: fmtCell(r.quantity), align: "right", muted: r.quantity === "" })} />
                    )}
                  </TableCell>
                ),

                unit: (
                  <TableCell key="unit" className={cellCls("unit")}>
                    {isActive("unit") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <Select
                          value={r.unitId != null ? String(r.unitId) : ""}
                          defaultOpen
                          onOpenChange={(open) => !open && setEditing(false)}
                          onValueChange={(v) => { const m = unitOptions.find((u) => String(u.id) === v); updateRow(r.clientId, { unitId: Number(v), unit: m?.code || m?.name || "" }, true); setEditing(false); }}
                        >
                          <SelectTrigger className={EDITOR_CONTROL}><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{unitOptions.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.code || u.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div {...staticProps("unit", { value: r.unit || "—", muted: !r.unit })} />
                    )}
                  </TableCell>
                ),

                rate: (
                  <TableCell key="rate" className={cellCls("rate")}>
                    {isActive("rate") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus type="number" align="right" value={r.rate} disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { rate: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("rate", { value: fmtCell(r.rate), align: "right", muted: r.rate === "" })} />
                    )}
                  </TableCell>
                ),

                // PRICE — computed, read-only.
                price: (
                  <TableCell key="price" className={cellCls("price")}>
                    <div {...staticProps("price", { value: fmt2(r.price), align: "right" })} />
                  </TableCell>
                ),

                forex: (
                  <TableCell key="forex" className={cellCls("forex")}>
                    {isActive("forex") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <Select
                          value={r.forexId != null ? String(r.forexId) : ""}
                          defaultOpen
                          onOpenChange={(open) => !open && setEditing(false)}
                          onValueChange={(v) => { const m = forexOptions.find((f) => String(f.id) === v); updateRow(r.clientId, { forexId: Number(v), forexCode: m?.code || m?.name || "" }, true); setEditing(false); }}
                        >
                          <SelectTrigger className={EDITOR_CONTROL}><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{forexOptions.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.code || f.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div {...staticProps("forex", { value: r.forexCode || "—", muted: !r.forexCode })} />
                    )}
                  </TableCell>
                ),

                forexPrice: (
                  <TableCell key="forexPrice" className={cellCls("forexPrice")}>
                    {isActive("forexPrice") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus type="number" align="right" value={r.currencyPrice} disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { currencyPrice: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("forexPrice", { value: fmtCell(r.currencyPrice), align: "right", muted: r.currencyPrice === "" })} />
                    )}
                  </TableCell>
                ),

                vatType: (
                  <TableCell key="vatType" className={cellCls("vatType")}>
                    {isActive("vatType") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <Select
                          value={r.vatIncluded ? "Inclusive" : "Exclusive"}
                          defaultOpen
                          onOpenChange={(open) => !open && setEditing(false)}
                          onValueChange={(v) => { updateRow(r.clientId, { vatIncluded: v === "Inclusive" ? 1 : 0 }, true); setEditing(false); }}
                        >
                          <SelectTrigger className={EDITOR_CONTROL}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Exclusive">Exclusive</SelectItem><SelectItem value="Inclusive">Inclusive</SelectItem></SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div {...staticProps("vatType", { value: r.vatIncluded ? "Inclusive" : "Exclusive" })} />
                    )}
                  </TableCell>
                ),

                vatPct: (
                  <TableCell key="vatPct" className={cellCls("vatPct")}>
                    {isActive("vatPct") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus type="number" align="right" value={r.vatRate} disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { vatRate: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("vatPct", { value: fmtCell(r.vatRate), align: "right", muted: r.vatRate === "" })} />
                    )}
                  </TableCell>
                ),

                // ITEM AMOUNT — computed, read-only.
                itemAmount: (
                  <TableCell key="itemAmount" className={cellCls("itemAmount")}>
                    <div {...staticProps("itemAmount", { value: fmt2(r.lineAmount), align: "right", emphasis: true })} />
                  </TableCell>
                ),

                received: (
                  <TableCell key="received" className={cellCls("received")}>
                    {isActive("received") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus type="number" align="right" value={r.receivedQuantity} disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { receivedQuantity: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("received", { value: fmtCell(r.receivedQuantity), align: "right", muted: r.receivedQuantity === "" })} />
                    )}
                  </TableCell>
                ),

                // MANUFACTURING ORDER — picker only, no local text edit.
                mfgOrder: (
                  <TableCell key="mfgOrder" className={cellCls("mfgOrder")}>
                    <div {...staticProps("mfgOrder", { value: r.manufacturingOrderNo || "—", muted: !r.manufacturingOrderNo })} />
                  </TableCell>
                ),

                workOrder: (
                  <TableCell key="workOrder" className={cellCls("workOrder")}>
                    {isActive("workOrder") && editing ? (
                      <div className={EDITOR_WRAP}>
                        <EditableGridInput
                          autoFocus type="number" align="right" value={r.workOrderReceiptItemId} disabled={readOnly}
                          onChange={(v) => updateRow(r.clientId, { workOrderReceiptItemId: v })}
                          onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                          onKeyDown={(e) => handleEditorKeyDown(e, r)}
                          className={EDITOR_CONTROL}
                        />
                      </div>
                    ) : (
                      <div {...staticProps("workOrder", { value: fmtCell(r.workOrderReceiptItemId), align: "right", muted: r.workOrderReceiptItemId === "" })} />
                    )}
                  </TableCell>
                ),
              };

              return (
                <TableRow
                  key={r.clientId}
                  role="row"
                  aria-selected={isRowActive}
                  aria-rowindex={idx + 2}
                  className={cn(ROW_H, "group transition-colors [&>td]:p-0", rowHover, rowBg)}
                >
                  {displayColumnDefs.map((col) => cells[col.key])}

                  {/* DELETE — bare icon, no button chrome, hidden at 1 row. Not part of the
                      reorderable set — always rendered last, like every other grid library's
                      action column. Scrolls with the rest of the row; no pinning. */}
                  {!readOnly && (
                    <TableCell className={cn("text-center", CELL_BORDER)}>
                      <div className="flex h-full items-center justify-center">
                        {rowsAtRest > 1 && (
                          <Trash2
                            role="button"
                            tabIndex={0}
                            aria-label="Delete line"
                            onClick={() => setPendingDeleteId(r.clientId)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPendingDeleteId(r.clientId); } }}
                            className="h-4 w-4 cursor-pointer text-muted-foreground outline-none hover:text-destructive focus-visible:text-destructive"
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

      {/* Footer — Total Records / Total Quantity / Total Amount, thin top border, inside the
          grid (the parent page's separate totals box was removed to avoid showing the same
          three numbers twice). */}
      {/* No separate top border here — every body cell in the last row already carries its own
          border-b (every cell does, per the grid-line requirement above), which sits directly
          against this div with zero gap between them. Adding a second border-t here would
          double that seam into a visibly heavier ~2px line instead of the thin 1px every other
          row boundary uses. */}
      <div className={cn(HEADER_H, "flex items-center justify-end gap-5 px-3 text-[13px]")}>
        <span className="text-muted-foreground">Total Records <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalRecords}</span></span>
        <span className="text-muted-foreground">Total Quantity <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></span>
        <span className="text-muted-foreground">Total Amount <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
        {/* Stock on Hand — bottom-right, blank whenever the active row isn't a real inventory
            item (no row selected yet, a blank trailing row, or a Service line). */}
        {showStock && (
          <span className="border-l border-border pl-5 text-muted-foreground">
            Stock on Hand
            <span className="ml-1.5 font-semibold text-foreground tabular-nums">
              {(stockRow!.stockOnHand ?? 0).toLocaleString()}{stockRow!.unit ? ` ${stockRow!.unit}` : ""}
            </span>
          </span>
        )}
      </div>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this line?</AlertDialogTitle>
            <AlertDialogDescription>This removes the line item. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId !== null) removeRow(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LookupDialog
        open={serviceLookupClientId !== null}
        onOpenChange={(open) => !open && setServiceLookupClientId(null)}
        title="Select Service"
        fetchOptions={fetchServiceOptions}
        getLabel={(s: any) => (s.code ? `${s.code} - ${s.name}` : s.name)}
        getValue={(s: any) => s.id}
        onSelect={(s: any) => {
          if (activeServiceRow) updateRow(activeServiceRow.clientId, { serviceCardId: Number(s.id), code: s.code || s.name, name: s.name }, true);
        }}
      />

      {/* Column Manager — order AND visibility together, modeled on AG Grid's Columns Tool
          Panel / DevExpress Column Chooser: a search box narrows the (reorderable) list, each
          row is checkbox + drag handle + name, Type/Code/Name are pinned at the top as
          locked/required rows regardless of search. Header and footer sit outside the
          scrollable middle section (flex-col + flex-1 overflow-y-auto), which is what makes the
          footer "sticky" — it never scrolls out of view no matter how many columns the list
          holds. */}
      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle>Column Manager</DialogTitle>
            <DialogDescription>Show, hide and reorder columns. Type, Code and Name are required and always stay first.</DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b border-border px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                placeholder="Search columns..."
                aria-label="Search columns"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
            {FIXED_COLS.map((key) => {
              const col = COLUMN_BY_KEY.get(key)!;
              return (
                <div key={key} className="flex items-center gap-3 rounded-md border border-transparent bg-muted/40 px-3 py-2.5">
                  <Checkbox checked disabled aria-label={`${col.label} is a required column and cannot be hidden`} />
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Required
                  </span>
                </div>
              );
            })}

            {modalOrderFiltered.length === 0 && columnSearch.trim() !== "" && (
              <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">No columns match &ldquo;{columnSearch}&rdquo;</p>
            )}

            {modalOrderFiltered.map((key) => {
              const col = COLUMN_BY_KEY.get(key)!;
              const visible = !modalHidden.has(key);
              return (
                <div
                  key={key}
                  // Drop-target handlers only — NOT a drag source. Exactly the same fix as the
                  // grid header's own column-drag (see handleDragStartCol's comment): a
                  // draggable=true ancestor intercepts any mousedown gesture started on a
                  // descendant, including the checkbox's own click — that's what made "hide
                  // this column" silently do nothing when the whole row was draggable. The grip
                  // icon below is the drag source instead, entirely outside the checkbox.
                  onDragOver={handleModalDragOver(key)}
                  onDrop={handleModalDrop(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    modalDragOver === key ? "border-primary bg-primary/10" : "border-border bg-card",
                    !visible && "opacity-60",
                  )}
                >
                  <Checkbox
                    checked={visible}
                    onCheckedChange={(checked) => toggleModalHidden(key, checked === true)}
                    aria-label={`Show ${col.label} column`}
                  />
                  <span
                    draggable
                    onDragStart={handleModalDragStart(key)}
                    onDragEnd={handleModalDragEnd}
                    className="flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                </div>
              );
            })}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReorderOpen(false)}>Cancel</Button>
              <Button variant="ghost" size="sm" onClick={resetModalToDefault}>Reset Default</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={saveForSession}>Save for This Session</Button>
              <Button size="sm" onClick={savePermanently} disabled={savingColumnPrefs}>
                {savingColumnPrefs ? "Saving..." : "Save Permanently"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LookupDialog
        open={moLookupClientId !== null}
        onOpenChange={(open) => !open && setMoLookupClientId(null)}
        title="Select Manufacturing Order"
        fetchOptions={fetchManufacturingOrderOptions}
        getLabel={(w: any) => w.name}
        getValue={(w: any) => w.id}
        onSelect={(w: any) => {
          if (activeMoRow) updateRow(activeMoRow.clientId, { manufacturingOrderId: Number(w.id), manufacturingOrderNo: w.name }, true);
        }}
      />
    </div>
  );
});

// --- Removed: LineVariantDialog (the composite Variant1+Variant2 breakdown UI for
// IM_OrderReceiptItemVariant) was taken off the Variant column per explicit confirmation, in
// favor of a free-text field (AutocompleteTextCell below). The backend endpoints it used
// (purchase-order.service.ts's listItemVariantOptions/listItemVariantLines/createItemVariantLine/
// updateItemVariantLine/removeItemVariantLine, and the matching legacyErpApi.purchaseOrders.*
// client methods) are untouched and still exist — only this screen's use of them was removed.


interface AutocompleteOption {
  id: string;
  code?: string | null;
  name?: string | null;
}

// Generic free-text-with-suggestions editor — same primary control as the Code field (a real
// typable EditableGridInput, not a button that opens a picker), plus a lightweight suggestions
// list that appears while typing. Unlike every forced-selection lookup in this grid, the typed
// text is never rejected: closing without picking a suggestion just keeps whatever was typed.
// Built generic on purpose (options + onCommit are the only per-field pieces) so a second field
// reuses this exact component later — only the data source changes, never the UI or the
// interaction model. Used by Code, Color and Variant.
//
// Matching CONTAINS anywhere in the string (not just a prefix) and case-insensitive throughout
// — "verify-me" matches "v", "ify", "me", "fy", "ABC"/"abc"/"AbC" all match identically, since
// both the query and the candidate text are lower-cased before the same String.includes() check.
function AutocompleteTextCell({
  value, options, disabled, autoFocus, showDropdownIcon, onChange, onCommit, onCancel, onSelectOption, onDoubleClick,
}: {
  value: string;
  options: AutocompleteOption[];
  disabled?: boolean;
  autoFocus?: boolean;
  // Purely visual — a chevron affordance so a searchable text field still reads as "this opens
  // a list" at a glance, the same way every shadcn Select in this grid already does. Opt-in
  // per field (currently just Code/"Inventory selector") rather than automatic, so it doesn't
  // silently change the look of every other field built on this same component.
  showDropdownIcon?: boolean;
  onChange: (v: string) => void;
  onCommit: (finalValue: string) => void;
  onCancel: () => void;
  // Fired instead of onCommit when the user explicitly picks a suggestion (click, or Enter/Tab
  // while a suggestion is highlighted) — hands back the full matched record (id/code/name, and
  // whatever else the caller's own datasource carries) instead of just the display string, for
  // fields whose selection needs to resolve more than one value onto the row (Code sets
  // inventoryId/sourceType/stockOnHand together, not just its own text). Fields that only ever
  // need the label text (Color, Variant) simply omit it and keep using onCommit.
  onSelectOption?: (option: AutocompleteOption) => void;
  onDoubleClick?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [highlighted, setHighlighted] = useState(0);
  const q = value.trim().toLowerCase();
  const filtered = (q ? options.filter((o) => (o.code || o.name || "").toLowerCase().includes(q)) : options).slice(0, 20);

  // Re-anchor the highlighted row whenever the candidate set changes (new keystroke narrows or
  // widens it) — an index left pointing past the new, shorter list would highlight nothing, or
  // Enter/Tab would silently pick the wrong row.
  useEffect(() => { setHighlighted(0); }, [q, options.length]);

  const selectSuggestion = (o: AutocompleteOption) => {
    const label = o.code || o.name || "";
    onChange(label);
    setOpen(false);
    if (onSelectOption) onSelectOption(o); else onCommit(label);
  };

  // Shared by Enter and Tab: if a suggestion is currently highlighted, picking it wins (matches
  // every native combobox); otherwise falls back to committing whatever was actually typed —
  // free text is never rejected just because nothing in the list matched it.
  const resolveHighlightedOrTyped = () => {
    setOpen(false);
    if (filtered.length && highlighted >= 0 && highlighted < filtered.length) selectSuggestion(filtered[highlighted]);
    else onCommit(value);
  };

  return (
    // Popover here is purely a portaling/positioning mechanism (PopoverAnchor + PopoverContent,
    // no PopoverTrigger) — the visible control is still a plain input, matching Code exactly.
    // A plain absolutely-positioned div would get silently clipped by the grid's own scrolling
    // container whenever the active row is near the bottom of the visible area; portaling the
    // suggestion list to the document root (what Popover already does for every other lookup in
    // this grid) avoids that without changing what the field looks like at rest.
    <Popover open={open && filtered.length > 0}>
      {/* No `asChild` here — EditableGridInput isn't ref-forwarding (it's a plain function
          component, same as everywhere else it's used in the app), so Radix couldn't measure
          it directly for positioning. Anchor's own default wrapper element does the measuring
          instead; the input renders as its normal child, unaffected either way. */}
      <PopoverAnchor className="relative block h-full w-full">
        <EditableGridInput
          autoFocus={autoFocus}
          value={value}
          disabled={disabled}
          onChange={(v) => { onChange(v); setOpen(true); }}
          onBlur={() => { setOpen(false); onCommit(value); }}
          onDoubleClick={onDoubleClick}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); onCancel(); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlighted((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0))); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); return; }
            // Enter/Tab resolve immediately (same net effect as blur) rather than routing
            // through the grid's shared handleEditorKeyDown — that helper calls persistRow
            // synchronously off the row's current state, but resolving a brand-new typed value
            // (or a picked suggestion) can mean an async "create the master record" call first
            // (see the Color wiring below); committing here guarantees the row's real FK is set
            // before anything tries to save it.
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); resolveHighlightedOrTyped(); }
          }}
          className={cn(EDITOR_CONTROL, showDropdownIcon && "pr-7")}
        />
        {showDropdownIcon && (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        )}
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={1}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The bare `w-[--radix-popover-trigger-width]` form never actually applied under
        // Tailwind v4 — v4 treats a bracketed arbitrary value as a literal raw value, not an
        // implicit var(...) wrap (that shorthand is v3-only); an explicit var(...) is required,
        // which is why every suggestion popup used to silently ignore the trigger width and
        // just grow to fit its longest suggestion's own text width instead of matching the
        // cell it belongs to.
        className="w-[var(--radix-popover-trigger-width)] max-h-44 overflow-y-auto p-1"
      >
        <div role="listbox">
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => selectSuggestion(o)}
              className={cn("block w-full truncate rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-accent", i === highlighted && "bg-accent")}
            >
              {o.code ? `${o.code} - ${o.name}` : o.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
