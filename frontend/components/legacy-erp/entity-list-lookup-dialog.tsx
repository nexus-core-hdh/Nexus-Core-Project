"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { MousePointerClick, RefreshCw, Search, SearchX, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PageRequest } from "@/lib/nexuscore-api";
import { useServerPaging } from "@/hooks/legacy-erp/use-server-paging";
import { ListPager } from "@/components/legacy-erp/list-pager";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";

// The ERP's standard "[Entity] List" lookup popup, shared by every database-backed record picker
// that needs more than a name to choose correctly (Work Orders List, Inventory Cards List, ...).
//
//  - ListLookupDialogShell: the modal itself — one size, header and body padding for all of them,
//    floating above the calling screen so a grid cell's lookup is never clipped by its grid.
//  - EntityListLookupDialog: shell + the generic list body — server-side search and paging
//    through the entity's own existing list API, its own columns (with WorklistTable's real header
//    filters where a column opts in), sticky header, one scrolling element, highlighted row,
//    ↑/↓ to move, Enter / double-click / Select to pick, Close / Esc to cancel. Column widths and
//    order persist per lookup (WorklistTable `storageKey`).
//
// Each entity supplies only its columns, its loader and how to label/key rows; the caller gets the
// picked row back and keeps its own mapping onto its own fields.

export function ListLookupDialogShell({
  open, onOpenChange, title, description, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "Search, then double-click, press Enter or click Select."}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: every opening starts from a fresh list with an empty search. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{open && children}</div>
      </DialogContent>
    </Dialog>
  );
}

export interface EntityListLookupDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The entity's own list columns (filterable ones get WorklistTable's header filter). */
  columns: WorklistTableColumn<T>[];
  /** The entity's existing list API: search term + page request -> paged response (or array). */
  load: (search: string | undefined, req: PageRequest) => Promise<any>;
  defaultSortBy: string;
  defaultSortDir?: "asc" | "desc";
  searchPlaceholder?: string;
  getRowKey: (row: T) => string | number;
  /** WorklistTable preference key for this lookup's column widths/order. */
  storageKey: string;
  /** The picked row; the dialog closes itself afterwards. */
  onSelect: (row: T) => void;
}

export function EntityListLookupDialog<T>(props: EntityListLookupDialogProps<T>) {
  const { open, onOpenChange, title, description } = props;
  return (
    <ListLookupDialogShell open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <EntityListLookupBody {...props} />
    </ListLookupDialogShell>
  );
}

function EntityListLookupBody<T>({
  onOpenChange, columns, load, defaultSortBy, defaultSortDir, searchPlaceholder, getRowKey, storageKey, onSelect,
}: EntityListLookupDialogProps<T>) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [highlighted, setHighlighted] = useState<string | number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const paging = useServerPaging({ defaultSortBy, defaultSortDir });

  const fetchRows = async (term?: string, req: PageRequest = paging.request) => {
    setLoading(true);
    try {
      setRows(paging.take(await load(term, req)));
    } catch (e: any) {
      toast.error(e?.message || `Failed to load records`);
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { fetchRows(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  paging.reloadRef.current = () => fetchRows(search.trim() || undefined);

  const doSearch = () => fetchRows(search.trim() || undefined, paging.firstPage());
  const refresh = () => { setSearch(""); fetchRows(undefined, paging.firstPage()); };
  const choose = (row: T) => { onSelect(row); onOpenChange(false); };

  // Keyboard: rows are focusable; ↑/↓ moves focus (and the highlight) between them, Enter picks the
  // focused row. ↓ from the search box jumps into the list.
  const rowEls = () => Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("[data-lookup-row]") ?? []);
  const focusRow = (index: number) => rowEls()[index]?.focus();
  const wrapRow = (row: T, el: React.ReactNode) => {
    if (!isValidElement(el)) return el;
    const key = getRowKey(row);
    const index = rows.indexOf(row);
    const element = el as React.ReactElement<any>;
    return cloneElement(element, {
      "data-lookup-row": index,
      tabIndex: 0,
      onFocus: () => setHighlighted(key),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); focusRow(index + 1); }
        else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (index === 0) bodyRef.current?.querySelector<HTMLInputElement>("input")?.focus();
          else focusRow(index - 1);
        } else if (e.key === "Enter") { e.preventDefault(); choose(row); }
      },
      className: cn(element.props.className, "cursor-pointer outline-none", highlighted === key && "bg-selected hover:bg-selected-hover"),
    });
  };

  return (
    <div ref={bodyRef} className="elk-dialog flex min-h-0 flex-col gap-3">
      {/* The shared Table's own built-in scroller (table-container) is the one scrolling element —
          height-capped here so rows scroll under its sticky header inside the modal. */}
      <style>{`.elk-dialog [data-slot="table-container"] { max-height: min(52vh, 520px); overflow: auto; }`}</style>
      <div className="flex items-center gap-2">
        <InputGroup className="h-9 min-w-0 flex-1">
          <InputGroupAddon>
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            placeholder={searchPlaceholder ?? "Search..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
              else if (e.key === "ArrowDown") { e.preventDefault(); focusRow(0); }
            }}
            className="text-sm"
          />
        </InputGroup>
        <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {!loading && (
          <Badge variant="secondary" className="h-5 shrink-0 text-[11px] font-normal">
            {paging.total.toLocaleString()} {paging.total === 1 ? "record" : "records"}
          </Badge>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={rows}
          storageKey={storageKey}
          getRowKey={getRowKey}
          loading={loading}
          sortKey={paging.sortBy}
          sortDir={paging.sortDir}
          onSort={(key) => paging.toggleSort(key)}
          onRowDoubleClick={choose}
          wrapRow={wrapRow}
          renderRowActions={(row) => (
            <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); choose(row); }}>
              <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />Select
            </Button>
          )}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{searched ? <SearchX /> : <Search />}</EmptyMedia>
                <EmptyTitle>{searched ? "No matching records" : "No records yet"}</EmptyTitle>
                <EmptyDescription>{searched ? "Try a different search term." : "There is nothing to select yet."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
        <ListPager paging={paging} loading={loading} />
      </div>

      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          <XCircle className="mr-2 h-3.5 w-3.5" />Close
        </Button>
      </div>
    </div>
  );
}
