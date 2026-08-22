"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import {
  Search, RefreshCw, Plus, Boxes, SearchX, FileClock,
  ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, MousePointerClick, XCircle,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";

// Combines Fabric Card, Yarn Card and Trim Card into one grid — a read-only aggregation via
// legacyErpApi.inventoryCards.list() (see inventory-card.service.ts), never a data source of
// its own. Opening a row for View/Edit routes to that row's own existing card screen
// (fabric-cards / yarn-cards / trim-inventory-cards) based on its sourceType — every actual
// field, validation, tab and lookup still lives and behaves exactly as it already does there.
//
// Also doubles as the Inventory lookup for Purchase Order's Code/Name grid cell (F2/search
// icon) — this same, unmodified screen gains a lookup mode (mode=lookup&requestId=&
// returnTab=), mirroring yarn-cards-list's own established manage-vs-lookup split, instead
// of building a second Inventory picker.

type SortKey = "inventoryCode" | "inventoryName" | "insertedAt" | "insertedBy";

const INVENTORY_CARDS_LIST_PATH = "/dashboard/legacy-erp/inventory-cards-list";

const SOURCE_ROUTES: Record<string, string> = {
  fabric: "/dashboard/legacy-erp/fabric-cards",
  yarn: "/dashboard/legacy-erp/yarn-cards",
  trim: "/dashboard/legacy-erp/trim-inventory-cards",
};

function SortableHead({
  children, sortKey, activeKey, dir, onSort,
}: {
  children: React.ReactNode; sortKey: SortKey; activeKey: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      className="h-10 cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 transition-colors hover:text-foreground"
      onClick={() => onSort(sortKey)}
    >
      <span className="group inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3 text-foreground" /> : <ArrowDown className="h-3 w-3 text-foreground" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

export default function InventoryCardListPage() {
  const router = useRouter();

  const params = useWorkspaceSearchParams();
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  // Optional narrowing filter — e.g. Purchase Order's Fixed Asset Code column opens this same
  // screen with sourceType=fixedasset so only Fixed Asset rows are offered, without a second
  // dedicated picker screen. Client-side only: the backend already returns the full combined
  // (≤200 row) list in one call, so narrowing here adds no extra request.
  const sourceTypeFilter = params.get("sourceType") || undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("inventoryCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // This screen's Standard rows already carry every field a custom worklist could select (the
  // synthetic UNION ALL's fixed output — see inventory-card.service.ts's INVENTORY_CARD_COLUMNS).
  // So unlike every other list screen, a custom worklist here is just a client-side column
  // projection/reorder of the already-loaded rows — no separate resolve() round-trip, no
  // `worklistOverride` param on load(), no refetch on switch/save.
  const wl = useWorklist({ storageKey: "inventoryCardsListWorklists" });
  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;
  // Worklist columns are fieldKey-formatted ("inventory-card:inventoryCode"); this screen's rows
  // use the bare camelCase key directly (there's no raw table to alias from) — strip the prefix.
  const rawKey = (c: string) => c.slice(c.indexOf(":") + 1);

  const load = async (term?: string, sortByOverride?: SortKey, sortDirOverride?: "asc" | "desc") => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.inventoryCards.list({
        search: term,
        sortBy: sortByOverride ?? sortKey,
        sortDir: sortDirOverride ?? sortDir,
      });
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load inventory cards");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  const toggleSort = (key: SortKey) => {
    const nextDir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    setSortKey(key);
    setSortDir(nextDir);
    load(search.trim() || undefined, key, nextDir);
  };

  const openCard = (row: any, cardMode: "view" | "edit") => {
    const base = SOURCE_ROUTES[row.sourceType];
    if (!base) return;
    navigateOrOpenTab(router, `${base}?id=${row.id}&mode=${cardMode}`);
  };

  const viewStatement = (row: any) => navigateOrOpenTab(
    router,
    `/dashboard/legacy-erp/item-statement?id=${row.id}&source=${encodeURIComponent(INVENTORY_CARDS_LIST_PATH)}&sourceLabel=${encodeURIComponent("Inventory Card List")}`,
  );

  // --- Lookup mode: return the selected inventory row to whichever grid cell opened this
  // tab (e.g. Purchase Order's Code column) — mirrors yarn-cards-list's own returnAndClose.
  // sourceType travels in `meta` so the caller knows which per-type endpoint (fabricCards/
  // yarnCards/trimInventoryCards) to call next for VAT/Unit defaults.
  const returnAndClose = (row: any) => {
    if (mode !== "lookup" || !requestId) return;
    resolveLookup(requestId, {
      id: row.id, code: row.inventoryCode, name: row.inventoryName,
      meta: { sourceType: row.sourceType, unit: row.unit, stockOnHand: row.stockOnHand },
    });
    closeSelf();
  };

  const closeSelf = () => {
    closeTab(tabCtx?.tabKey ?? INVENTORY_CARDS_LIST_PATH);
    if (returnTab) {
      const [returnPath] = returnTab.split("?");
      activateTab(returnPath);
      router.replace(returnTab, { scroll: false });
    } else {
      router.back();
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, row: any, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = sortedRows[index + 1];
      if (next) setSelectedRowKey(`${next.sourceType}-${next.id}`);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = sortedRows[index - 1];
      if (prev) setSelectedRowKey(`${prev.sourceType}-${prev.id}`);
    } else if (e.key === "Enter" && mode === "lookup") {
      e.preventDefault();
      returnAndClose(row);
    }
  };

  const addNew = () => navigateOrOpenTab(router, "/dashboard/legacy-erp/inventory-cards-new");

  // Sorting is already applied server-side (matches search, which round-trips too) — this is
  // just a stable client-side copy so a fresh render never visibly reorders rows mid-sort,
  // plus the optional sourceType narrowing described above.
  const sortedRows = useMemo(
    () => (sourceTypeFilter ? rows.filter((r) => r.sourceType === sourceTypeFilter) : rows),
    [rows, sourceTypeFilter],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Inventory Card List</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Boxes className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Inventory Card List</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {mode === "lookup"
                  ? `Double-click or press Enter to select ${sourceTypeFilter ? `a ${sourceTypeFilter === "fixedasset" ? "Fixed Asset" : sourceTypeFilter} item` : "an inventory item"}`
                  : "Fabric, Yarn & Trim inventory in one place"}
              </p>
              {!loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {sortedRows.length} {sortedRows.length === 1 ? "record" : "records"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-80 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by code, name, type or creator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {mode !== "lookup" && (
          <Button size="lg" onClick={addNew} className="min-h-11 min-w-60 px-6 py-2.5">
            <Plus className="h-4 w-4" />Add New Inventory Card
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                {activeColumns ? (
                  activeColumns.map((c) => (
                    <TableHead key={c} className="h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {wl.columnLabel(c)}
                    </TableHead>
                  ))
                ) : (
                  <>
                    <SortableHead sortKey="inventoryCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Inventory Code</SortableHead>
                    <SortableHead sortKey="inventoryName" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Inventory Name</SortableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Inventory Type</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Unit</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Stock On Hand</TableHead>
                    <SortableHead sortKey="insertedAt" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Inserted At</SortableHead>
                    <SortableHead sortKey="insertedBy" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Inserted By</SortableHead>
                  </>
                )}
                <TableHead className={cn("h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80", mode === "lookup" ? "w-28" : "w-14")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: (activeColumns?.length ?? 7) + 1 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : sortedRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={(activeColumns?.length ?? 7) + 1} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Boxes />}</EmptyMedia>
                        <EmptyTitle>{searched ? "No matching records" : "No inventory cards yet"}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "Try a different search term." : 'Click "Add New Inventory Card" to create the first one.'}
                        </EmptyDescription>
                      </EmptyHeader>
                      {!searched && mode !== "lookup" && (
                        <EmptyContent>
                          <Button size="sm" onClick={addNew}><Plus className="h-3.5 w-3.5 mr-2" />Add New Inventory Card</Button>
                        </EmptyContent>
                      )}
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : sortedRows.map((row, index) => {
                // Manage mode only — lookup mode keeps its existing double-click/Select-button
                // flow untouched (no context menu, no quick actions).
                const rowActions: RowAction[] = [
                  { key: "statement", label: "View Statement", icon: FileClock, onSelect: () => viewStatement(row) },
                ];
                const tableRow = (
                <TableRow
                  key={`${row.sourceType}-${row.id}`}
                  tabIndex={0}
                  onFocus={() => setSelectedRowKey(`${row.sourceType}-${row.id}`)}
                  onKeyDown={(e) => handleRowKeyDown(e, row, index)}
                  className={cn(
                    "group cursor-pointer outline-none",
                    selectedRowKey === `${row.sourceType}-${row.id}` && "bg-primary/10",
                    "hover:bg-muted/40",
                  )}
                  onDoubleClick={() => (mode === "lookup" ? returnAndClose(row) : openCard(row, "view"))}
                >
                  {activeColumns ? (
                    activeColumns.map((c) => (
                      <TableCell key={c} className="whitespace-nowrap py-3 text-sm">{formatCell(row[rawKey(c)])}</TableCell>
                    ))
                  ) : (
                    <>
                      <TableCell className="py-3">
                        <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.inventoryCode}</span>
                      </TableCell>
                      <TableCell className="py-3 font-medium">{row.inventoryName}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-[11px] font-normal">{row.inventoryType}</Badge>
                      </TableCell>
                      <TableCell className="py-3">{row.unit || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="py-3">{row.stockOnHand}</TableCell>
                      <TableCell className="py-3 text-muted-foreground">
                        {row.insertedAt ? format(new Date(row.insertedAt), "dd MMM yyyy, hh:mm a") : "—"}
                      </TableCell>
                      <TableCell className="py-3">{row.insertedBy}</TableCell>
                    </>
                  )}
                  {mode === "lookup" ? (
                    <TableCell className="py-3 text-right">
                      <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}>
                        <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
                      </Button>
                    </TableCell>
                  ) : (
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu actions={rowActions} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  )}
                </TableRow>
                );
                return mode === "lookup" ? tableRow : (
                  <RowContextMenu key={`${row.sourceType}-${row.id}`} actions={rowActions}>{tableRow}</RowContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <WorklistBar
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        onActiveWorklistChange={wl.setActiveWorklistId}
        onDesignOpen={() => wl.setDesignOpen(true)}
      />

      <WorklistDesignModal
        open={wl.designOpen}
        onOpenChange={wl.setDesignOpen}
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        activeTableSource="inventory-card"
        primaryScope="inventory-card-list"
        gridLabel="the Inventory Card List grid"
        onSave={async (next: Worklist[]) => { await wl.saveWorklists(next); }}
      />

      {mode === "lookup" && (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={closeSelf}><XCircle className="h-3.5 w-3.5 mr-2" />Close</Button>
        </div>
      )}
    </div>
  );
}
