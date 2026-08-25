"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { getReceiptTypeConfig, SUBCONTRACT_RECEIPT_TYPES } from "@/lib/legacy-erp/receipt-types";
import {
  Search, RefreshCw, Plus, Eye, Pencil, Trash2, Factory, SearchX,
  ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";

// "Subcontract Receipts" — a dedicated nav entry over a curated subset of the existing generic
// Inventory Receipt types (SUBCONTRACT_RECEIPT_TYPES: the four "Outside Process" types — see
// receipt-types.ts's own comment). Deliberately NOT a new receipt list implementation: this is
// inventory-receipts-list/page.tsx's exact list/search/worklist/CRUD pattern, with the one real
// difference being where the active receiptType comes from — an in-page <Select> instead of a
// fixed `?receiptType=` on the URL (receipt-master-data/page.tsx's onTableChange is the existing
// precedent for a dropdown-driven primary source). Every New/View/Update/Delete action still
// opens the same existing generic /legacy-erp/inventory-receipts screen and
// /legacy-erp/receipts/:receiptType API this page's sibling already uses — no new receipt route,
// no new business logic, no schema change.
const TYPE_OPTIONS = SUBCONTRACT_RECEIPT_TYPES.map((t) => getReceiptTypeConfig(t));

type SortKey = "receiptNo" | "documentNo" | "receiptDate";

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

export default function SubcontractReceiptsListPage() {
  const router = useRouter();
  const [receiptType, setReceiptType] = useState<number>(SUBCONTRACT_RECEIPT_TYPES[0]);
  const cfg = getReceiptTypeConfig(receiptType);
  const client = legacyErpApi.receipts(receiptType);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("receiptNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // One shared worklist set across the 4 Outside Process types this page serves, same convention
  // inventory-receipts-list uses across its own 17 — a worklist's fields carry their own source
  // tag, so switching receiptType just re-resolves the same active worklist against the newly
  // selected type's rows.
  const wl = useWorklist({ storageKey: "subcontractReceiptsListWorklists" });

  const load = async (type: number, term?: string, worklistOverride?: Worklist | null) => {
    setLoading(true);
    try {
      const typeCfg = getReceiptTypeConfig(type);
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const r: any = worklist
        ? await legacyErpApi.worklistFields.resolve(typeCfg.key, worklist.fields.map((f) => ({ source: f.source, key: f.key })), term)
        : await legacyErpApi.receipts(type).list(term);
      const list = Array.isArray(r) ? r : [];
      setRows(worklist ? wl.normalizeRows(list) : list);
    } catch (e: any) {
      toast.error(e.message || `Failed to load ${cfg.label.toLowerCase()}s`);
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(receiptType); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const doSearch = () => load(receiptType, search.trim() || undefined);
  const refresh = () => { setSearch(""); load(receiptType); };

  // Selected dropdown type has absolute priority, same as receipt-master-data's onTableChange:
  // switching it clears the grid and reloads fresh from the newly selected type, preserving
  // whichever worklist (if any) is currently active.
  const onTypeChange = (value: string) => {
    const next = Number(value);
    setReceiptType(next);
    setSearch("");
    setRows([]);
    load(next, undefined, wl.activeWorklist);
  };

  const onWorklistChange = (id: string) => {
    const worklist = id === STANDARD_WORKLIST_ID ? null : wl.worklists.find((w) => w.id === id) ?? null;
    wl.setActiveWorklistId(id);
    load(receiptType, search.trim() || undefined, worklist);
  };

  const handleSaveWorklists = async (next: Worklist[]) => {
    const { activeWorklist } = await wl.saveWorklists(next);
    load(receiptType, search.trim() || undefined, activeWorklist);
  };

  const activeColumns = wl.activeWorklist ? wl.columnsFor([]) : null;

  // None of the 4 Subcontract Receipt types is ever the special type-2 case, so the receiptType
  // param is always present — same generic route/screen inventory-receipts-list already opens.
  const typeParam = `&receiptType=${receiptType}`;
  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${id}&mode=view${typeParam}`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${id}&mode=edit${typeParam}`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?mode=create${typeParam}`);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await client.delete(deleteTarget.id);
      toast.success(`${cfg.label} deleted`);
      setDeleteTarget(null);
      load(receiptType, search.trim() || undefined);
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
        <span className="font-medium text-foreground">Subcontract Receipts</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Factory className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Subcontract Receipts</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{cfg.label}s</p>
              {!loading && (
                <Badge variant="secondary" className="h-5 text-[11px] font-normal">
                  {rows.length} {rows.length === 1 ? "record" : "records"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-72 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by Receipt No or Document No..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={createNew}>
            <Plus className="h-3.5 w-3.5 mr-2" />Create New
          </Button>
        </div>

        <Select value={String(receiptType)} onValueChange={onTypeChange}>
          <SelectTrigger className="h-9 w-72 text-sm">
            <SelectValue placeholder="Select receipt type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.receiptType} value={String(o.receiptType)}>{o.receiptType}-{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <SortableHead sortKey="receiptNo" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Receipt No</SortableHead>
                    <SortableHead sortKey="receiptDate" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Receipt Date</SortableHead>
                    <SortableHead sortKey="documentNo" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Document</SortableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Vehicle No</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Driver Name</TableHead>
                  </>
                )}
                <TableHead className="h-10 w-14 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: (activeColumns?.length ?? 5) + 1 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={(activeColumns?.length ?? 5) + 1} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Factory />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : `No ${cfg.label.toLowerCase()}s yet`}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? `You can create a new ${cfg.label}.` : `Click "Create New" to add your first ${cfg.label}.`}
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
                  { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.receiptNo }), destructive: true, separatorBefore: true },
                ];
                return (
                <RowContextMenu key={row.id} actions={rowActions}>
                <TableRow className="group cursor-pointer hover:bg-muted/40" onDoubleClick={() => view(row.id)}>
                  {activeColumns ? (
                    activeColumns.map((c) => (
                      <TableCell key={c} className="whitespace-nowrap py-3 text-sm">{formatCell(row[c])}</TableCell>
                    ))
                  ) : (
                    <>
                      <TableCell className="py-3">
                        <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.receiptNo}</span>
                      </TableCell>
                      <TableCell className="py-3">{row.receiptDate ? new Date(row.receiptDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="py-3">{row.documentNo || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="py-3">{row.plateNumber || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="py-3">{row.driverName || <span className="text-muted-foreground">—</span>}</TableCell>
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
        activeTableSource="purchase-receipt"
        gridLabel="the Subcontract Receipts List grid"
        onSave={handleSaveWorklists}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {cfg.label}</AlertDialogTitle>
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
