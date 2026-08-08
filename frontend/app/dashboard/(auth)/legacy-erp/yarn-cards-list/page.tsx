"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import {
  Search, RefreshCw, Plus, MoreHorizontal, Eye, Pencil, Trash2, Layers, SearchX,
  ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, MousePointerClick, XCircle,
} from "lucide-react";

const YARN_CARDS_LIST_PATH = "/dashboard/legacy-erp/yarn-cards-list";

type SortKey = "inventoryCode" | "inventoryName" | "specialCode";

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

export default function YarnCardListPage() {
  const router = useRouter();

  // Lookup mode — present when this same, unmodified screen is opened from a Yarn Count
  // field (F2 / search icon) instead of the sidebar, exactly like Master Lookup's own
  // manage-vs-lookup split. See MasterLookupScreen for the reference implementation this
  // mirrors; Yarn Card keeps its own dedicated CRUD screen (not a config entry there)
  // because it's a full Item-based card, not a simple Code/Name master.
  const params = useWorkspaceSearchParams();
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("inventoryCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = async (term?: string) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.yarnCards.list(term);
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load yarn cards");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/yarn-cards?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/yarn-cards?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/yarn-cards?mode=create`);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.yarnCards.delete(deleteTarget.id);
      toast.success("Yarn card deleted");
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // --- Lookup mode: return the selected Yarn Card to whichever field opened this tab -----
  const returnAndClose = (row: any) => {
    if (mode !== "lookup" || !requestId) return;
    resolveLookup(requestId, { id: row.id, code: row.inventoryCode, name: row.inventoryName });
    closeSelf();
  };

  const closeSelf = () => {
    closeTab(tabCtx?.tabKey ?? YARN_CARDS_LIST_PATH);
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
      if (next) { setSelectedId(next.id); rowRefs.current.get(next.id)?.focus(); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = sortedRows[index - 1];
      if (prev) { setSelectedId(prev.id); rowRefs.current.get(prev.id)?.focus(); }
    } else if (e.key === "Enter" && mode === "lookup") {
      e.preventDefault();
      returnAndClose(row);
    }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Yarn Cards</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Yarn Cards</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {mode === "lookup" ? "Double-click or press Enter to select a Yarn Card" : "Yarn item master"}
              </p>
              {!loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {rows.length} {rows.length === 1 ? "record" : "records"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-72 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <Button size="sm" onClick={createNew}>
            <Plus className="h-3.5 w-3.5 mr-2" />Create New
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                <SortableHead sortKey="inventoryCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Code</SortableHead>
                <SortableHead sortKey="inventoryName" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Name</SortableHead>
                <SortableHead sortKey="specialCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Special Code</SortableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Status</TableHead>
                <TableHead className={cn("h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80", mode === "lookup" ? "w-40" : "w-14")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Layers />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : "No yarn cards yet"}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "You can create a new Yarn Card." : 'Click "Create New" to add your first Yarn Card.'}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
                      </EmptyContent>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : sortedRows.map((row, index) => (
                <TableRow
                  key={row.id}
                  ref={(el) => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}
                  tabIndex={0}
                  onFocus={() => setSelectedId(row.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, row, index)}
                  onDoubleClick={() => returnAndClose(row)}
                  className={cn(
                    "group outline-none",
                    selectedId === row.id && "bg-primary/10",
                    mode === "lookup" && "cursor-pointer",
                  )}
                >
                  <TableCell className="py-3">
                    <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.inventoryCode}</span>
                  </TableCell>
                  <TableCell className="py-3 font-medium">{row.inventoryName}</TableCell>
                  <TableCell className="py-3">{row.specialCode || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="py-3">
                    <Badge variant={row.inUse ? "default" : "secondary"} className="text-[11px] font-normal">
                      {row.inUse ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    {/* Maintenance actions (View/Update/Delete) stay exactly as they were,
                        regardless of mode. Select is ADDITIONAL, shown only in lookup mode —
                        same convention as the Master Lookup screen's Maintenance grid. */}
                    <div className="flex items-center justify-end gap-1">
                      {mode === "lookup" && (
                        <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}>
                          <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => view(row.id)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => update(row.id)}><Pencil className="h-4 w-4 mr-2" />Update</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: row.id, code: row.inventoryCode })}>
                            <Trash2 className="h-4 w-4 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {mode === "lookup" && (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={closeSelf}><XCircle className="h-3.5 w-3.5 mr-2" />Close</Button>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Yarn Card</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this record?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
