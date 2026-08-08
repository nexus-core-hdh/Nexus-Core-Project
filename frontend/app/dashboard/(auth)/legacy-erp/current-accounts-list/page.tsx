"use client";

import { useEffect, useMemo, useState } from "react";
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
  Search, RefreshCw, Plus, MoreHorizontal, Eye, Pencil, Trash2, Users, SearchX,
  ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, MousePointerClick, XCircle,
} from "lucide-react";

// Also doubles as the Current Account lookup for Purchase Order (and any other screen that
// needs it) — this same, unmodified manage screen gains a lookup mode (mode=lookup&
// requestId=&returnTab=), mirroring inventory-cards-list's / yarn-cards-list's own
// established manage-vs-lookup split, instead of building a second Current Account picker.
const CURRENT_ACCOUNTS_LIST_PATH = "/dashboard/legacy-erp/current-accounts-list";

const fmt = (n: any) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balanceTone = (n: any) => {
  const v = Number(n ?? 0);
  if (v < 0) return "text-red-600 dark:text-red-400";
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-muted-foreground";
};

type SortKey = "code" | "name" | "specialCode" | "debit" | "credit" | "balance" | "balanceTrial";

function SortableHead({
  children, sortKey, activeKey, dir, align = "left", onSort,
}: {
  children: React.ReactNode; sortKey: SortKey; activeKey: SortKey; dir: "asc" | "desc";
  align?: "left" | "right"; onSort: (k: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      className={cn(
        "h-10 cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 transition-colors hover:text-foreground",
        align === "right" && "text-right"
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className={cn("group inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
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

export default function CurrentAccountListPage() {
  const router = useRouter();

  const params = useWorkspaceSearchParams();
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = async (term?: string) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.accounts.list(term);
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load current accounts");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/current-accounts?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/current-accounts?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/current-accounts?mode=create`);

  // --- Lookup mode: return the selected account to whichever field opened this tab (e.g.
  // Purchase Order's Current Account field) — mirrors inventory-cards-list's returnAndClose.
  const returnAndClose = (row: any) => {
    if (mode !== "lookup" || !requestId) return;
    resolveLookup(requestId, { id: row.id, code: row.code, name: row.name });
    closeSelf();
  };

  const closeSelf = () => {
    closeTab(tabCtx?.tabKey ?? CURRENT_ACCOUNTS_LIST_PATH);
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
      if (next) setSelectedRowKey(String(next.id));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = sortedRows[index - 1];
      if (prev) setSelectedRowKey(String(prev.id));
    } else if (e.key === "Enter" && mode === "lookup") {
      e.preventDefault();
      returnAndClose(row);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.accounts.delete(deleteTarget.id);
      toast.success("Current account deleted");
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Purely presentational: sorts the already-fetched page of rows client-side.
  // Does not call the API again or change what "search" returns.
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" || typeof bv === "number"
        ? Number(av ?? 0) - Number(bv ?? 0)
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Current Accounts</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Current Accounts</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {mode === "lookup" ? "Double-click or press Enter to select a Current Account" : "Customer & supplier ledger master"}
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
          {mode !== "lookup" && (
            <>
              <div className="hidden h-6 w-px bg-border sm:block" />
              <Button size="sm" onClick={createNew}>
                <Plus className="h-3.5 w-3.5 mr-2" />Create New
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                <SortableHead sortKey="code" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Code</SortableHead>
                <SortableHead sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Name</SortableHead>
                <SortableHead sortKey="specialCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Special Code</SortableHead>
                <SortableHead sortKey="debit" activeKey={sortKey} dir={sortDir} align="right" onSort={toggleSort}>Debit</SortableHead>
                <SortableHead sortKey="credit" activeKey={sortKey} dir={sortDir} align="right" onSort={toggleSort}>Credit</SortableHead>
                <SortableHead sortKey="balance" activeKey={sortKey} dir={sortDir} align="right" onSort={toggleSort}>Balance</SortableHead>
                <SortableHead sortKey="balanceTrial" activeKey={sortKey} dir={sortDir} align="right" onSort={toggleSort}>Balance Trial (BT)</SortableHead>
                <TableHead className="h-10 w-14 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Users />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : "No current accounts yet"}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "You can create a new Current Account." : 'Click "Create New" to add your first Current Account.'}
                        </EmptyDescription>
                      </EmptyHeader>
                      {!searched && mode !== "lookup" && (
                        <EmptyContent>
                          <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
                        </EmptyContent>
                      )}
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : sortedRows.map((row, index) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  onFocus={() => setSelectedRowKey(String(row.id))}
                  onKeyDown={(e) => handleRowKeyDown(e, row, index)}
                  onDoubleClick={() => (mode === "lookup" ? returnAndClose(row) : view(row.id))}
                  className={cn(
                    "group cursor-pointer outline-none hover:bg-muted/40",
                    selectedRowKey === String(row.id) && "bg-primary/10",
                  )}
                >
                  <TableCell className="py-3">
                    <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.code}</span>
                  </TableCell>
                  <TableCell className="py-3 font-medium">{row.name}</TableCell>
                  <TableCell className="py-3">{row.specialCode || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="py-3 text-right font-mono">{fmt(row.debit)}</TableCell>
                  <TableCell className="py-3 text-right font-mono">{fmt(row.credit)}</TableCell>
                  <TableCell className={cn("py-3 text-right font-mono font-semibold", balanceTone(row.balance))}>{fmt(row.balance)}</TableCell>
                  <TableCell className={cn("py-3 text-right font-mono font-semibold", balanceTone(row.balanceTrial))}>{fmt(row.balanceTrial)}</TableCell>
                  <TableCell className="py-3 text-right">
                    {mode === "lookup" ? (
                      <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}>
                        <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
                      </Button>
                    ) : (
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
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: row.id, code: row.code })}>
                            <Trash2 className="h-4 w-4 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
            <AlertDialogTitle>Delete Current Account</AlertDialogTitle>
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
