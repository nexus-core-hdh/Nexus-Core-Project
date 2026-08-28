"use client";

// Shared column-customization state machine for every "Excel-style" grid in the app:
// resize (drag + double-click auto-fit), reorder (native HTML5 drag-and-drop on header
// labels), show/hide, and two-tier persistence (this browser tab's sessionStorage for
// "Save for This Session", UserSettings.tablePreferences for "Save Permanently").
//
// Extracted from components/legacy-erp/purchase-order-line-grid.tsx, the original
// hand-rolled reference implementation — behavior here is intentionally byte-for-byte
// equivalent to what that file did inline, just generic over any column-key union so
// every grid in the app (not just Purchase Order lines) can share one implementation
// instead of re-copy-pasting this ~250-line block per screen.
//
// tablePreferences naming convention (flat top-level keys per screen, matching the
// pre-existing poLineGridColumnOrder/poLineGridHiddenColumns precedent this was
// extracted from — do not diverge from this without updating every caller):
//   `${storageKey}ColumnOrder`   -> string[]
//   `${storageKey}HiddenColumns` -> string[]
//   `${storageKey}ColumnWidths`  -> Record<string, number>
// sessionStorage mirrors these with `${storageKey}-column-order` / `-hidden-columns` /
// `-column-widths` keys, checked first on mount (skips the network round trip when a
// same-tab session value already answers the question).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { settingsApi } from "@/lib/api";

export interface GridColumnDef<K extends string> {
  key: K;
  label: string;
  defaultWidth: number;
  minWidth: number;
}

export interface UseGridColumnsOptions<K extends string> {
  /** Unique per screen/grid — namespaces both the sessionStorage keys and the
   *  tablePreferences keys. Reuse an existing grid's exact string when migrating it
   *  onto this hook so previously-saved user layouts aren't orphaned. */
  storageKey: string;
  columns: GridColumnDef<K>[];
  /** Always rendered first, in declared order; never hidden, never reordered. */
  fixedColumns?: K[];
  /** Columns hidden the FIRST time this grid is ever opened (no saved session/permanent
   *  preference yet) — e.g. secondary dimension columns a dense transaction grid wants tucked
   *  away by default but still reachable via Manage Columns. Omit for the existing default every
   *  other grid already relies on: nothing hidden until the user hides something themselves. Has
   *  no effect once any preference (session or permanent) has been saved for this storageKey —
   *  it only seeds the very first render, exactly like `defaultWidth` already does for widths. */
  defaultHidden?: K[];
}

export interface HeaderDragProps {
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export interface UseGridColumnsResult<K extends string> {
  fixedColumns: K[];
  /** Fixed columns first, then whichever reorderable columns aren't hidden, in the
   *  user's current order — the single source of truth every caller should render
   *  (colgroup, header cells, body cells, keyboard-nav order) instead of the static
   *  `columns` declaration order. */
  displayColumnDefs: GridColumnDef<K>[];
  /** Raw reorderable-column order (ALL reorderable columns, including currently-hidden
   *  ones — unlike `displayColumnDefs`, which is already filtered to visible). For
   *  adapters (e.g. Family A's TanStack `DataTable`) that need to feed a host library's
   *  own `columnOrder`/`columnVisibility` state, which expect hidden columns to remain
   *  present in the order so they can be shown again later. */
  columnOrder: K[];
  /** Raw hidden-columns set — see `columnOrder` above for why adapters need the raw
   *  form instead of only the pre-filtered `displayColumnDefs`. */
  hiddenColumns: Set<K>;
  colWidths: Record<K, number>;
  getWidth: (key: K) => number;
  /** Sum of every currently-displayed column's width, plus any extra (e.g. a fixed
   *  action column) — feed this straight into the <Table> element's explicit `width`
   *  style. An unconstrained/auto table width silently breaks resizing: the browser
   *  computes it once against the containing block and doesn't re-derive it purely
   *  from later <col> width mutations. */
  totalWidth: (extra?: number) => number;
  isLoadingPreferences: boolean;

  startResize: (key: K) => (e: React.MouseEvent) => void;
  /** Pass the grid's own root element (holding `[data-col="key"]` markers on every
   *  rendered cell for that column) — measures real content width via `scrollWidth`. */
  autoFitColumn: (key: K, gridRoot: HTMLElement | null) => void;
  /** Resets one column back to its declared `defaultWidth` — for grids that offer a
   *  per-column "double-click to reset" instead of (or alongside) auto-fit. */
  resetWidth: (key: K) => void;

  dragOverColumn: K | null;
  /** Spread onto the header LABEL element (never the header cell itself — a
   *  draggable ancestor swallows the resize handle's mousedown before a resize drag
   *  can start). Returns {} for fixed columns. */
  getHeaderDragProps: (key: K) => HeaderDragProps;

  manageColumns: ManageColumnsState<K>;

  /** Width-only persistence, independent of the Manage Columns modal's save buttons — for a
   *  caller with no modal UI at all (e.g. a grid whose order/visibility come from elsewhere,
   *  like a saved preset system, and only wants resize). Writes just the current live
   *  `colWidths`, leaving order/hidden keys in storage untouched. */
  persistWidthsSession: () => void;
  persistWidthsPermanently: () => Promise<void>;
}

export interface ManageColumnsState<K extends string> {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  search: string;
  setSearch: (v: string) => void;
  /** Draft reorderable-column list, filtered by `search`. */
  orderFiltered: K[];
  hidden: Set<K>;
  dragOverKey: K | null;
  getRowDragProps: (key: K) => HeaderDragProps;
  toggleHidden: (key: K, visible: boolean) => void;
  resetToDefault: () => void;
  /** Applies the draft immediately to the live grid and writes sessionStorage. */
  saveForSession: () => void;
  /** Applies the draft, writes sessionStorage, and persists to the backend. */
  savePermanently: () => Promise<void>;
  saving: boolean;
}

const sessionOrderKey = (storageKey: string) => `${storageKey}-column-order`;
const sessionHiddenKey = (storageKey: string) => `${storageKey}-hidden-columns`;
const sessionWidthsKey = (storageKey: string) => `${storageKey}-column-widths`;
const permOrderKey = (storageKey: string) => `${storageKey}ColumnOrder`;
const permHiddenKey = (storageKey: string) => `${storageKey}HiddenColumns`;
const permWidthsKey = (storageKey: string) => `${storageKey}ColumnWidths`;

function sanitizeOrder<K extends string>(saved: unknown, reorderableDefault: K[]): K[] {
  if (!Array.isArray(saved)) return reorderableDefault;
  const validSaved = saved.filter((k): k is K => reorderableDefault.includes(k as K));
  const missing = reorderableDefault.filter((k) => !validSaved.includes(k));
  return [...validSaved, ...missing];
}

function sanitizeHidden<K extends string>(saved: unknown, reorderableDefault: K[]): K[] {
  return Array.isArray(saved) ? saved.filter((k): k is K => reorderableDefault.includes(k as K)) : [];
}

function sanitizeWidths<K extends string>(
  saved: unknown,
  columnByKey: Map<K, GridColumnDef<K>>,
): Partial<Record<K, number>> {
  if (!saved || typeof saved !== "object") return {};
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const col = columnByKey.get(k as K);
    if (!col || typeof v !== "number" || !Number.isFinite(v)) continue;
    out[k as K] = Math.max(col.minWidth, v);
  }
  return out;
}

export function useGridColumns<K extends string>({
  storageKey,
  columns,
  fixedColumns = [],
  defaultHidden = [],
}: UseGridColumnsOptions<K>): UseGridColumnsResult<K> {
  const columnByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const reorderableDefault = useMemo(
    () => columns.filter((c) => !fixedColumns.includes(c.key)).map((c) => c.key),
    [columns, fixedColumns],
  );
  const defaultWidths = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth])) as Record<K, number>,
    [columns],
  );

  const [columnOrder, setColumnOrder] = useState<K[]>(reorderableDefault);
  const [hiddenColumns, setHiddenColumns] = useState<Set<K>>(() => new Set(defaultHidden));
  const [colWidths, setColWidths] = useState<Record<K, number>>(defaultWidths);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  // Restore persisted order/hidden/widths on mount — session (this tab) wins if present
  // (skips the network round trip entirely), else fall back to whatever's permanently
  // saved for this user, else the built-in default.
  useEffect(() => {
    let sessionOrderFound = false;
    try {
      const raw = sessionStorage.getItem(sessionOrderKey(storageKey));
      if (raw) { setColumnOrder(sanitizeOrder(JSON.parse(raw), reorderableDefault)); sessionOrderFound = true; }
    } catch { /* malformed sessionStorage entry — fall through */ }
    try {
      const raw = sessionStorage.getItem(sessionHiddenKey(storageKey));
      if (raw) setHiddenColumns(new Set(sanitizeHidden(JSON.parse(raw), reorderableDefault)));
    } catch { /* malformed sessionStorage entry — fall through */ }
    try {
      const raw = sessionStorage.getItem(sessionWidthsKey(storageKey));
      if (raw) setColWidths((prev) => ({ ...prev, ...sanitizeWidths(JSON.parse(raw), columnByKey) }));
    } catch { /* malformed sessionStorage entry — fall through */ }

    if (sessionOrderFound) { setIsLoadingPreferences(false); return; }
    settingsApi.getCurrentSettings()
      .then((s: any) => {
        const savedOrder = s?.tablePreferences?.[permOrderKey(storageKey)];
        if (Array.isArray(savedOrder) && savedOrder.length) setColumnOrder(sanitizeOrder(savedOrder, reorderableDefault));
        const savedHidden = s?.tablePreferences?.[permHiddenKey(storageKey)];
        if (Array.isArray(savedHidden)) setHiddenColumns(new Set(sanitizeHidden(savedHidden, reorderableDefault)));
        const savedWidths = s?.tablePreferences?.[permWidthsKey(storageKey)];
        if (savedWidths) setColWidths((prev) => ({ ...prev, ...sanitizeWidths(savedWidths, columnByKey) }));
      })
      .catch(() => {})
      .finally(() => setIsLoadingPreferences(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const displayColumnDefs = useMemo(
    // `.filter((k) => columnByKey.has(k))` guards against `columnOrder` (state, only ever
    // updated via drag-reorder or the Manage Columns modal) briefly or permanently disagreeing
    // with a `columns` prop that changes shape after mount (e.g. a caller whose column set is
    // driven by something external — a selected preset, a loaded template — switching to a
    // different set without this hook's own state "following" it). Without this, a key gone
    // missing from the current `columns` would resolve through `columnByKey.get(k)!` to
    // `undefined`, and every consumer here maps over this array assuming real column defs —
    // `undefined.key` throws.
    () => [...fixedColumns, ...columnOrder.filter((k) => !hiddenColumns.has(k))]
      .filter((k) => columnByKey.has(k))
      .map((k) => columnByKey.get(k)!),
    [columnOrder, hiddenColumns, fixedColumns, columnByKey],
  );

  const getWidth = useCallback((key: K) => colWidths[key] ?? columnByKey.get(key)?.defaultWidth ?? 120, [colWidths, columnByKey]);
  const totalWidth = useCallback(
    (extra = 0) => displayColumnDefs.reduce((sum, c) => sum + getWidth(c.key), 0) + extra,
    [displayColumnDefs, getWidth],
  );

  // ---- Resize ---------------------------------------------------------------------------
  const startResize = useCallback((key: K) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getWidth(key);
    const minWidth = columnByKey.get(key)?.minWidth ?? 40;
    const onMove = (ev: MouseEvent) => {
      setColWidths((prev) => ({ ...prev, [key]: Math.max(minWidth, startWidth + (ev.clientX - startX)) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [getWidth, columnByKey]);

  const autoFitColumn = useCallback((key: K, gridRoot: HTMLElement | null) => {
    if (!gridRoot) return;
    const els = gridRoot.querySelectorAll<HTMLElement>(`[data-col="${key}"]`);
    let max = 0;
    els.forEach((el) => { max = Math.max(max, el.scrollWidth); });
    if (max === 0) return;
    const minWidth = columnByKey.get(key)?.minWidth ?? 40;
    const next = Math.min(480, Math.max(minWidth, max + 16));
    setColWidths((prev) => ({ ...prev, [key]: next }));
  }, [columnByKey]);

  const resetWidth = useCallback((key: K) => {
    const defaultWidth = columnByKey.get(key)?.defaultWidth;
    if (defaultWidth == null) return;
    setColWidths((prev) => ({ ...prev, [key]: defaultWidth }));
  }, [columnByKey]);

  // ---- Inline header reorder (drag-and-drop on the label, not the header cell) ----------
  const dragColRef = useRef<K | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<K | null>(null);
  const getHeaderDragProps = useCallback((key: K): HeaderDragProps => {
    if (fixedColumns.includes(key)) return {};
    return {
      draggable: true,
      onDragStart: () => { dragColRef.current = key; },
      onDragEnd: () => { dragColRef.current = null; setDragOverColumn(null); },
      onDragOver: (e) => {
        if (!dragColRef.current || dragColRef.current === key) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverColumn !== key) setDragOverColumn(key);
      },
      onDrop: (e) => {
        e.preventDefault();
        const dragged = dragColRef.current;
        dragColRef.current = null;
        setDragOverColumn(null);
        if (!dragged || dragged === key) return;
        setColumnOrder((prev) => {
          const next = prev.filter((k) => k !== dragged);
          next.splice(next.indexOf(key), 0, dragged);
          return next;
        });
      },
    };
  }, [fixedColumns, dragOverColumn]);

  // ---- Manage Columns modal (draft order/visibility, session/permanent save) ------------
  const [open, setOpen] = useState(false);
  const [modalOrder, setModalOrder] = useState<K[]>(columnOrder);
  const [modalHidden, setModalHidden] = useState<Set<K>>(hiddenColumns);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const modalDragRef = useRef<K | null>(null);
  const [modalDragOver, setModalDragOver] = useState<K | null>(null);

  const openModal = useCallback(() => {
    setModalOrder(columnOrder);
    setModalHidden(new Set(hiddenColumns));
    setSearch("");
    setOpen(true);
  }, [columnOrder, hiddenColumns]);
  const closeModal = useCallback(() => setOpen(false), []);

  const getRowDragProps = useCallback((key: K): HeaderDragProps => ({
    draggable: true,
    onDragStart: () => { modalDragRef.current = key; },
    onDragEnd: () => { modalDragRef.current = null; setModalDragOver(null); },
    onDragOver: (e) => {
      if (!modalDragRef.current || modalDragRef.current === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (modalDragOver !== key) setModalDragOver(key);
    },
    onDrop: (e) => {
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
    },
  }), [modalDragOver]);

  const toggleHidden = useCallback((key: K, visible: boolean) => {
    setModalHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setModalOrder(reorderableDefault);
    setModalHidden(new Set(defaultHidden));
  }, [reorderableDefault, defaultHidden]);

  const applySession = useCallback((order: K[], hidden: Set<K>) => {
    setColumnOrder(order);
    setHiddenColumns(hidden);
    try {
      sessionStorage.setItem(sessionOrderKey(storageKey), JSON.stringify(order));
      sessionStorage.setItem(sessionHiddenKey(storageKey), JSON.stringify(Array.from(hidden)));
      sessionStorage.setItem(sessionWidthsKey(storageKey), JSON.stringify(colWidths));
    } catch { /* sessionStorage unavailable — live grid still updated above */ }
  }, [storageKey, colWidths]);

  const saveForSession = useCallback(() => {
    applySession(modalOrder, modalHidden);
    setOpen(false);
  }, [applySession, modalOrder, modalHidden]);

  const savePermanently = useCallback(async () => {
    setSaving(true);
    try {
      applySession(modalOrder, modalHidden);
      await settingsApi.updateCurrentSettings({
        tablePreferences: {
          [permOrderKey(storageKey)]: modalOrder,
          [permHiddenKey(storageKey)]: Array.from(modalHidden),
          [permWidthsKey(storageKey)]: colWidths,
        },
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }, [applySession, modalOrder, modalHidden, colWidths, storageKey]);

  const orderFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modalOrder;
    return modalOrder.filter((k) => (columnByKey.get(k)?.label ?? "").toLowerCase().includes(q));
  }, [modalOrder, search, columnByKey]);

  const persistWidthsSession = useCallback(() => {
    try { sessionStorage.setItem(sessionWidthsKey(storageKey), JSON.stringify(colWidths)); } catch { /* sessionStorage unavailable */ }
  }, [storageKey, colWidths]);

  const persistWidthsPermanently = useCallback(async () => {
    await settingsApi.updateCurrentSettings({ tablePreferences: { [permWidthsKey(storageKey)]: colWidths } });
  }, [storageKey, colWidths]);

  return {
    fixedColumns,
    displayColumnDefs,
    columnOrder,
    hiddenColumns,
    colWidths,
    getWidth,
    totalWidth,
    isLoadingPreferences,
    startResize,
    autoFitColumn,
    resetWidth,
    dragOverColumn,
    getHeaderDragProps,
    persistWidthsSession,
    persistWidthsPermanently,
    manageColumns: {
      open,
      openModal,
      closeModal,
      search,
      setSearch,
      orderFiltered,
      hidden: modalHidden,
      dragOverKey: modalDragOver,
      getRowDragProps,
      toggleHidden,
      resetToDefault,
      saveForSession,
      savePermanently,
      saving,
    },
  };
}
