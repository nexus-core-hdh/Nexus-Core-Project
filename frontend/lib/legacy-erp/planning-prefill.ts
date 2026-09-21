// Planning Transaction Context — the shared "hand a real, already-resolved Planning row's data to
// whichever existing create screen a right-click menu action opens" mechanism. Lives in this
// neutral `lib/legacy-erp/` location (not inside the Planning screens' own `_components/`) because
// both sides of the handoff need it: the PRODUCER (fabric-yarn-requirements/_components/
// receipt-menu.ts, deep under the Planning route tree) and the CONSUMERS (purchase-order-line-
// grid.tsx / inventory-receipt-line-grid.tsx under components/legacy-erp/, plus the three
// destination page.tsx files) — a components/ file reaching into a page's own _components/ folder
// would be backwards, so the shared piece moved here instead.
//
// In-memory handoff — this app keeps every opened workspace tab mounted in the SAME browser tab/
// JS runtime (see workspace-content-stack.tsx's own "keep every tab mounted" comment), so a
// `window`-global Map (see getStore below) is a real, same-runtime handoff, not a fake cross-tab
// channel; no localStorage/cookie/URL-JSON-blob needed. The URL only ever carries a short opaque
// id (`prefillHandoff=<id>`); a stale/reused/missing id simply yields `null` (destination opens
// with its existing default blank line, never a broken state).
export interface PlanningPrefillLine {
  inventoryId: number;
  code: string | null;
  name: string | null;
  quantity: number;
  // Real MD_UnitSetItem.RecId — the SAME id space both PurchaseOrderLineGrid's and
  // InventoryReceiptLineGrid's own `unitId` field already validate against (confirmed via
  // legacy-master-lookup.service.ts's own listItemUnits, the exact resolver those two grids' Unit
  // dropdowns already call) — NOT the same id as fabric-yarn-requirements.service.ts's own
  // requirementUnit.id (that item's own IM_ItemUnitItemSize configuration row, a different
  // table); this is requirementUnit.unitItemId specifically. `null` when this item has no
  // Requirement Unit configured — the destination's Unit field is then left for the user, exactly
  // as it already is today for a manually-added line with no unit picked yet.
  unitId: number | null;
  unit: string | null;
  colorCardId: string | null;
  color: string | null;
  workOrderId: number | null;
  workOrderNo: string | null;
  sourceType: "fabric" | "yarn" | "trim";
}

// Backed by a `window` global, NOT a plain module-level variable — Next.js's per-route dynamic
// `import()` code splitting (every Planning/receipt screen is loaded via `dynamic(() => import(...))`
// in registry.generated.ts) does not guarantee this module resolves to the SAME instance across
// two different route chunks (e.g. Fabric Planning's own chunk vs. Purchase Order's own chunk) —
// each could get its own copy of this file's module scope, which would silently break the "same
// runtime" assumption this handoff depends on (a stash in one chunk's Map would be invisible to a
// consume in another chunk's separate Map). `window` is the one thing that's unconditionally
// shared across every chunk in the same real browser tab/frame, so the Map itself lives there.
function getStore(): Map<string, PlanningPrefillLine[]> {
  const w = window as unknown as { __planningPrefillHandoff__?: Map<string, PlanningPrefillLine[]> };
  if (!w.__planningPrefillHandoff__) w.__planningPrefillHandoff__ = new Map();
  return w.__planningPrefillHandoff__;
}

// Producer side — called from receipt-menu.ts's own onSelect handlers (i.e. only at the moment
// the user actually clicks a menu action, never during menu construction). Returns null (nothing
// to append to the URL) when there are no real lines to hand off, e.g. every selected row lacked
// a resolved Inventory Item.
export function stashPlanningPrefillLines(lines: PlanningPrefillLine[]): string | null {
  if (!lines.length) return null;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  getStore().set(id, lines);
  return id;
}

// Consumer side — called from each destination page.tsx's own initial-state resolution
// (purchase-orders / subcontract-orders / inventory-receipts), via a `useState(() => ...)` lazy
// initializer so the resolved lines are available on that SAME first render the line grid's own
// lazy row-seeding reads its `initialLines` prop from (deferring this to a useEffect would arrive
// one render too late for that). Deliberately a non-destructive PEEK (`.get()`, no `.delete()`):
// React 18 Strict Mode intentionally invokes a `useState` lazy initializer TWICE in development to
// surface exactly this class of bug — a delete-on-read here would let the first (discarded) call
// consume the real data and leave the second (kept) call with nothing, silently producing a blank
// line every time in dev. A non-destructive peek is safe to call more than once: every handoff id
// is fresh (timestamp+random, generated once per menu click), workspace tabs are never remounted
// once opened (see workspace-content-stack.tsx's own "keep every tab mounted" comment) so this
// never re-runs later for the same tab instance, and a genuine full-page reload wipes `window`
// (and this Map with it) regardless of any explicit delete. Small, harmless, naturally-bounded
// residue (one entry per Planning-menu click that actually opened a screen) outlives this only
// until the next hard reload — never an unbounded leak in a real session.
export function consumePlanningPrefillLines(handoffId: string | null | undefined): PlanningPrefillLine[] | null {
  if (!handoffId || typeof window === "undefined") return null;
  return getStore().get(handoffId) ?? null;
}
