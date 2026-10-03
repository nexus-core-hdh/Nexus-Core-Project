"use client";

import { cloneElement, isValidElement, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { RecipeUsageDialog } from "@/components/legacy-erp/recipe-usage-dialog";
import { legacyErpApi, type PageRequest } from "@/lib/nexuscore-api";
import { useServerPaging } from "@/hooks/legacy-erp/use-server-paging";
import { ListPager } from "@/components/legacy-erp/list-pager";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import {
  Search, RefreshCw, Plus, Boxes, SearchX, FileClock,
  ChevronRight, MousePointerClick, XCircle, Network,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { ModuleHeader } from "@/components/legacy-erp/module-header";

// The Inventory Card List — Fabric Card, Yarn Card and Trim Card in one grid, a read-only
// aggregation via legacyErpApi.inventoryCards.list() (see inventory-card.service.ts), never a
// data source of its own. Opening a row for View/Edit routes to that row's own existing card
// screen (fabric-cards / yarn-cards / trim-inventory-cards) based on its sourceType — every
// actual field, validation, tab and lookup still lives and behaves exactly as it already does
// there.
//
// One component, two hosts: the Workspace screen (inventory-cards-list/page.tsx, variant "page" —
// also the full-screen lookup Purchase Order's Code/Name cell opens) and the modal
// InventoryCardsLookupDialog (variant "dialog" — the Receipt Detail Lines item lookup). Same
// search, server paging, columns, worklists, keyboard and selection either way; only where the
// picked row goes (onSelect) and how the host closes (onClose) differ.

type SortKey = "inventoryCode" | "inventoryName" | "insertedAt" | "insertedBy";

const INVENTORY_CARDS_LIST_PATH = "/dashboard/legacy-erp/inventory-cards-list";

const SOURCE_ROUTES: Record<string, string> = {
  fabric: "/dashboard/legacy-erp/fabric-cards",
  yarn: "/dashboard/legacy-erp/yarn-cards",
  trim: "/dashboard/legacy-erp/trim-inventory-cards",
};

export interface InventoryCardsListViewProps {
  mode: "manage" | "lookup";
  /** Optional narrowing (fabric | yarn | trim | fixedasset), sent to the API before paging. */
  sourceTypeFilter?: string;
  /** Lookup mode: the picked inventory row (double-click, Enter or Select). */
  onSelect?: (row: any) => void;
  /** Lookup mode: the Close button. */
  onClose?: () => void;
  /** "page" = the Workspace screen layout; "dialog" = the compact body for a modal host. */
  variant?: "page" | "dialog";
}

export function InventoryCardsListView({ mode, sourceTypeFilter, onSelect, onClose, variant = "page" }: InventoryCardsListViewProps) {
  const router = useRouter();
  const inDialog = variant === "dialog";
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [usageTarget, setUsageTarget] = useState<{ id: number; label: string } | null>(null);

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  // Server-side paging + sorting (+ the optional sourceType narrowing), all applied by the API
  // before paging.
  const paging = useServerPaging({ defaultSortBy: "inventoryCode" });
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

  const load = async (term?: string, req: PageRequest = paging.request) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.inventoryCards.list({ search: term, sourceType: sourceTypeFilter }, req);
      setRows(paging.take(r));
    } catch (e: any) {
      toast.error(e.message || "Failed to load inventory cards");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);
  paging.reloadRef.current = () => load(search.trim() || undefined);

  const doSearch = () => load(search.trim() || undefined, paging.firstPage());
  const refresh = () => { setSearch(""); load(undefined, paging.firstPage()); };

  const openCard = (row: any, cardMode: "view" | "edit") => {
    const base = SOURCE_ROUTES[row.sourceType];
    if (!base) return;
    navigateOrOpenTab(router, `${base}?id=${row.id}&mode=${cardMode}`);
  };

  const viewStatement = (row: any) => navigateOrOpenTab(
    router,
    `/dashboard/legacy-erp/item-statement?id=${row.id}&source=${encodeURIComponent(INVENTORY_CARDS_LIST_PATH)}&sourceLabel=${encodeURIComponent("Inventory Card List")}`,
  );

  // Lookup mode: hand the picked row to the host (which returns it to the caller and closes).
  const select = (row: any) => { if (mode === "lookup") onSelect?.(row); };

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
      select(row);
    }
  };

  const addNew = () => navigateOrOpenTab(router, "/dashboard/legacy-erp/inventory-cards-new");

  // Sorting and the optional sourceType narrowing are both applied server-side, before paging.
  const sortedRows = rows;

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
    {
      key: "recipe-usage", label: "Recipe Usage Information", icon: Network,
      onSelect: () => setUsageTarget({ id: row.id, label: `${row.inventoryCode} — ${row.inventoryName}` }),
    },
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
      className: cn((el as React.ReactElement<any>).props.className, selectedRowKey === rowKey && "bg-selected hover:bg-selected-hover"),
    });
    return mode === "lookup" ? withNav : <RowContextMenu key={rowKey} actions={getRowActions(row)}>{withNav}</RowContextMenu>;
  };

  return (
    <div className={inDialog ? "icl-dialog flex min-h-0 flex-col gap-3" : "mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8"}>
      {/* In the dialog the table's own built-in scroller (the shared Table's table-container) is
          height-capped, so rows scroll under its sticky header inside the modal — one scrolling
          element, same pattern as the receipt/PO line grids. */}
      {inDialog && (
        <style>{`.icl-dialog [data-slot="table-container"] { max-height: min(52vh, 520px); overflow: auto; }`}</style>
      )}
      {!inDialog && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Legacy ERP</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">Inventory Card List</span>
          </div>

          <ModuleHeader
            icon={Boxes}
            title="Inventory Card List"
            subtitle={
              mode === "lookup"
                ? `Double-click or press Enter to select ${sourceTypeFilter ? `a ${sourceTypeFilter === "fixedasset" ? "Fixed Asset" : sourceTypeFilter} item` : "an inventory item"}`
                : "Fabric, Yarn & Trim inventory in one place"
            }
            badges={
              !loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {paging.total.toLocaleString()} {paging.total === 1 ? "record" : "records"}
                </Badge>
              )
            }
          />
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className={cn("flex flex-wrap items-center gap-2", inDialog && "w-full flex-nowrap")}>
          <InputGroup className={cn("h-9 shrink-0", inDialog ? "min-w-0 flex-1" : "w-80")}>
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus={inDialog}
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
          {inDialog && !loading && (
            <Badge variant="secondary" className="h-5 shrink-0 text-[11px] font-normal">
              {paging.total.toLocaleString()} {paging.total === 1 ? "record" : "records"}
            </Badge>
          )}
        </div>
        {mode !== "lookup" && (
          <Button size="lg" onClick={addNew} className="min-h-11 min-w-60 px-6 py-2.5">
            <Plus className="h-4 w-4" />Add New Inventory Card
          </Button>
        )}
      </div>

      <div className={cn("overflow-hidden border shadow-sm", inDialog ? "rounded-lg" : "rounded-xl")}>
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="inventoryCardsList"
          getRowKey={(row) => `${row.sourceType}-${row.id}`}
          loading={loading}
          sortKey={paging.sortBy}
          sortDir={paging.sortDir}
          onSort={(key) => paging.toggleSort(key)}
          onRowDoubleClick={(row) => (mode === "lookup" ? select(row) : openCard(row, "view"))}
          wrapRow={wrapInventoryRow}
          renderRowActions={(row) => (
            mode === "lookup" ? (
              <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); select(row); }}>
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
        <ListPager paging={paging} loading={loading} />
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
        <div className={cn("flex items-center justify-end gap-2", !inDialog && "border-t pt-4")}>
          <Button variant="outline" size="sm" onClick={onClose}><XCircle className="h-3.5 w-3.5 mr-2" />Close</Button>
        </div>
      )}

      <RecipeUsageDialog
        open={!!usageTarget}
        onOpenChange={(open) => !open && setUsageTarget(null)}
        inventoryId={usageTarget?.id ?? null}
        itemLabel={usageTarget?.label}
      />
    </div>
  );
}
