"use client";

import { cloneElement, isValidElement, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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
  ChevronRight, MousePointerClick, XCircle,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";

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

  // Unified column model for WorklistTable — a custom worklist's dynamic fields (formatCell,
  // prefix-stripped via rawKey) or the Standard fixed set (own renderers/sortable headers).
  const columns: WorklistTableColumn<any>[] = useMemo(() => {
    if (activeColumns) {
      return activeColumns.map((c) => ({
        key: c,
        label: wl.columnLabel(c),
        render: (row: any) => formatCell(row[rawKey(c)]),
      }));
    }
    return [
      {
        key: "inventoryCode", label: "Inventory Code", sortable: true,
        render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.inventoryCode}</span>,
      },
      { key: "inventoryName", label: "Inventory Name", sortable: true, render: (row: any) => <span className="font-medium">{row.inventoryName}</span> },
      { key: "inventoryType", label: "Inventory Type", render: (row: any) => <Badge variant="outline" className="text-[11px] font-normal">{row.inventoryType}</Badge> },
      { key: "unit", label: "Unit", render: (row: any) => row.unit || <span className="text-muted-foreground">—</span> },
      { key: "stockOnHand", label: "Stock On Hand", render: (row: any) => row.stockOnHand },
      {
        key: "insertedAt", label: "Inserted At", sortable: true,
        render: (row: any) => <span className="text-muted-foreground">{row.insertedAt ? format(new Date(row.insertedAt), "dd MMM yyyy, hh:mm a") : "—"}</span>,
      },
      { key: "insertedBy", label: "Inserted By", sortable: true, render: (row: any) => row.insertedBy },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColumns]);

  const getRowActions = (row: any): RowAction[] => [
    { key: "statement", label: "View Statement", icon: FileClock, onSelect: () => viewStatement(row) },
  ];

  // Preserves the existing keyboard-nav/selected-row-highlight behavior (tabIndex/onFocus/
  // onKeyDown/conditional background), which WorklistTable's own <TableRow> doesn't expose as
  // props — cloneElement injects them onto the row element WorklistTable already built.
  // `wrapRow` only receives (row, element), so the index for ArrowUp/Down nav is looked up from
  // sortedRows (rows are unique object references, so indexOf resolves correctly here).
  const wrapInventoryRow = (row: any, el: React.ReactNode) => {
    const rowKey = `${row.sourceType}-${row.id}`;
    if (!isValidElement(el)) return el;
    const index = sortedRows.indexOf(row);
    const withNav = cloneElement(el as React.ReactElement<any>, {
      tabIndex: 0,
      onFocus: () => setSelectedRowKey(rowKey),
      onKeyDown: (e: React.KeyboardEvent) => handleRowKeyDown(e, row, index),
      className: cn((el as React.ReactElement<any>).props.className, selectedRowKey === rowKey && "bg-primary/10"),
    });
    return mode === "lookup" ? withNav : <RowContextMenu key={rowKey} actions={getRowActions(row)}>{withNav}</RowContextMenu>;
  };

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
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="inventoryCardsList"
          getRowKey={(row) => `${row.sourceType}-${row.id}`}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => toggleSort(key as SortKey)}
          onRowDoubleClick={(row) => (mode === "lookup" ? returnAndClose(row) : openCard(row, "view"))}
          wrapRow={wrapInventoryRow}
          renderRowActions={(row) => (
            mode === "lookup" ? (
              <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}>
                <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
              </Button>
            ) : (
              <span onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
              </span>
            )
          )}
          emptyState={
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
          }
        />
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
