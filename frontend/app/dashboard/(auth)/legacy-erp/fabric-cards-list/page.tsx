"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import {
  Search, RefreshCw, Plus, Eye, Pencil, Trash2, Shirt, SearchX, FileClock,
  ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";

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

export default function FabricCardListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("inventoryCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const wl = useWorklist({ storageKey: "fabricCardsListWorklists" });

  const load = async (term?: string, worklistOverride?: Worklist | null) => {
    setLoading(true);
    try {
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const r: any = worklist
        ? await legacyErpApi.worklistFields.resolve("fabric-card-list", worklist.fields.map((f) => ({ source: f.source, key: f.key })), term)
        : await legacyErpApi.fabricCards.list(term);
      const list = Array.isArray(r) ? r : [];
      setRows(worklist ? wl.normalizeRows(list) : list);
    } catch (e: any) {
      toast.error(e.message || "Failed to load fabric cards");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  const onWorklistChange = (id: string) => {
    const worklist = id === STANDARD_WORKLIST_ID ? null : wl.worklists.find((w) => w.id === id) ?? null;
    wl.setActiveWorklistId(id);
    load(search.trim() || undefined, worklist);
  };

  const handleSaveWorklists = async (next: Worklist[]) => {
    const { activeWorklist } = await wl.saveWorklists(next);
    load(search.trim() || undefined, activeWorklist);
  };

  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/fabric-cards?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/fabric-cards?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/fabric-cards?mode=create`);
  const viewStatement = (id: number) => navigateOrOpenTab(
    router,
    `/dashboard/legacy-erp/item-statement?id=${id}&source=${encodeURIComponent("/dashboard/legacy-erp/fabric-cards-list")}&sourceLabel=${encodeURIComponent("Fabric Cards")}`,
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.fabricCards.delete(deleteTarget.id);
      toast.success("Fabric card deleted");
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
        <span className="font-medium text-foreground">Fabric Cards</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Shirt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Fabric Cards</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Fabric item master</p>
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
                {activeColumns ? (
                  activeColumns.map((c) => (
                    <TableHead key={c} className="h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {wl.columnLabel(c)}
                    </TableHead>
                  ))
                ) : (
                  <>
                    <SortableHead sortKey="inventoryCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Code</SortableHead>
                    <SortableHead sortKey="inventoryName" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Name</SortableHead>
                    <SortableHead sortKey="specialCode" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Special Code</SortableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Status</TableHead>
                  </>
                )}
                <TableHead className="h-10 w-14 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: (activeColumns?.length ?? 4) + 1 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={(activeColumns?.length ?? 4) + 1} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Shirt />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : "No fabric cards yet"}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "You can create a new Fabric Card." : 'Click "Create New" to add your first Fabric Card.'}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
                      </EmptyContent>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : sortedRows.map((row) => {
                const rowActions: RowAction[] = [
                  { key: "view", label: "View", icon: Eye, onSelect: () => view(row.id) },
                  { key: "update", label: "Update", icon: Pencil, onSelect: () => update(row.id) },
                  { key: "statement", label: "View Statement", icon: FileClock, onSelect: () => viewStatement(row.id) },
                  { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.inventoryCode }), destructive: true, separatorBefore: true },
                ];
                return (
                <RowContextMenu key={row.id} actions={rowActions}>
                <TableRow className="group">
                  {activeColumns ? (
                    activeColumns.map((c) => (
                      <TableCell key={c} className="whitespace-nowrap py-3 text-sm">{formatCell(row[c])}</TableCell>
                    ))
                  ) : (
                    <>
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
                    </>
                  )}
                  <TableCell className="py-3 text-right">
                    <RowActionsMenu actions={rowActions} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                  </TableCell>
                </TableRow>
                </RowContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <WorklistBar
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        onActiveWorklistChange={onWorklistChange}
        onDesignOpen={() => wl.setDesignOpen(true)}
      />

      <WorklistDesignModal
        open={wl.designOpen}
        onOpenChange={wl.setDesignOpen}
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        activeTableSource="fabric-card"
        primaryScope="fabric-card-list"
        gridLabel="the Fabric Cards List grid"
        onSave={handleSaveWorklists}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fabric Card</AlertDialogTitle>
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
