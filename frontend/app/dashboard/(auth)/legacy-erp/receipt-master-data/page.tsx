"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Database, ChevronRight, Search, RefreshCw, Plus, SearchX, Eye, Pencil, Trash2, BadgeCheck, XCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { TABLE_ACTIONS, TABLE_OPTIONS, RECEIPT_TYPE_BY_KEY, type TableKey } from "./_lib/table-config";
import { humanizeColumn } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, mapTableKeyToWorklistSource, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";

// "Receipt & Master Data" — a single read-only, dropdown-driven grid over 3 retained unified-
// grid sources (Purchase Receipt/Inventory Receipt/Current Account — see unified-grid.service.ts)
// plus the 16 "other" Receipt Screen Replication types (see receipt-type.controller.ts), all
// selected from the same top-right dropdown. The selected dropdown value has absolute priority:
// it decides both which data loads AND which existing module a row's context-menu actions
// resolve to (see ./_lib/table-config.ts) — the clicked row only ever supplies record identity.
// This screen never writes on its own; every action reuses an existing route/API.

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(value);
};

export default function ReceiptMasterDataPage() {
  const router = useRouter();
  const [selectedTable, setSelectedTable] = useState<TableKey>("purchase-receipt");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [detailsRow, setDetailsRow] = useState<Record<string, any> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, any> | null>(null);
  const [approveTarget, setApproveTarget] = useState<Record<string, any> | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Record<string, any> | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  // Customize Worklist — reuses the existing generic per-user UserSettings.tablePreferences
  // JSON blob (same mechanism as Workspace/My Menu/PO line-grid column prefs), namespaced under
  // its own key so it can't collide with those. No dedicated worklist table/schema.
  const wl = useWorklist({ storageKey: "receiptMasterDataWorklists" });

  const actions = TABLE_ACTIONS[selectedTable];

  // A custom worklist is a configurable UNIFIED/JOINED view: the selected top-right dropdown
  // table is still the sole primary/row-identity source (table-selection priority, search, and
  // every New/View/Update/Delete/Approval action target it exactly as before — see
  // table-config.ts), but its fields may additionally be resolved server-side against related
  // existing tables via real FK relationships (worklist-rows.service.ts, which now recognizes
  // all 20 dropdown sources, not just the 3 retained ones). Standard never changes this at all —
  // it keeps calling each source's own original list endpoint (unifiedGrid for the 3 retained
  // options, the generic receipt-type route for the 16 others) untouched.
  const load = async (table: TableKey, term?: string, worklistOverride?: Worklist | null) => {
    setLoading(true);
    try {
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const receiptType = RECEIPT_TYPE_BY_KEY[table];
      let r: any;
      if (worklist) {
        // worklist-rows.service.ts now recognizes every one of the 16 other receipt types too
        // (reusing Purchase Receipt's own relationship map), so a custom worklist resolves the
        // same way regardless of which dropdown source is active — this call already returns
        // raw "RecId" natively (it selects straight off the real table, unlike the Standard
        // receipts() path below), so no id->RecId remap is needed here.
        r = await legacyErpApi.worklistFields.resolve(table, worklist.fields.map((f) => ({ source: f.source, key: f.key })), term);
      } else if (receiptType !== undefined) {
        // Standard for one of the 16 other receipt types — existing generic receipt-type route.
        // Reindex "id" -> "RecId" so row identity/context-menu actions below (which already
        // expect row.RecId, matching unified-grid's convention) work identically for these rows.
        r = await legacyErpApi.receipts(receiptType).list(term);
        r = (Array.isArray(r) ? r : []).map(({ id, ...rest }: any) => ({ ...rest, RecId: id }));
      } else {
        r = await legacyErpApi.unifiedGrid.list(table, term);
      }
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || `Failed to load ${TABLE_ACTIONS[table].label}`);
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  // The active worklist's own field set may have just changed in Design (fields added/removed/
  // reordered) — that changes which relations the resolver needs, so re-fetch rather than
  // relying on already-loaded rows.
  const handleSaveWorklists = async (next: Worklist[]) => {
    const { activeWorklist } = await wl.saveWorklists(next);
    load(selectedTable, search.trim() || undefined, activeWorklist);
  };

  useEffect(() => { load(selectedTable); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Selected dropdown table has absolute priority: switching it clears the grid and reloads
  // fresh, unfiltered, from the newly selected source — never mixes columns/rows across tables.
  // The active worklist (if any) is deliberately preserved across a table switch and simply
  // re-resolved against the new primary — table selection and worklist selection are separate
  // concerns (see WORKLIST DESIGN note above).
  const onTableChange = (value: TableKey) => {
    setSelectedTable(value);
    setSearch("");
    setRows([]);
    load(value, undefined, wl.activeWorklist);
  };

  const onWorklistChange = (id: string) => {
    const worklist = id === STANDARD_WORKLIST_ID ? null : wl.worklists.find((w) => w.id === id) ?? null;
    wl.setActiveWorklistId(id);
    load(selectedTable, search.trim() || undefined, worklist);
  };

  const doSearch = () => load(selectedTable, search.trim() || undefined);
  const refresh = () => { setSearch(""); load(selectedTable); };
  const reload = () => load(selectedTable, search.trim() || undefined);

  // Standard = existing behavior, unchanged. A custom worklist's columns come directly from its
  // saved field order (not filtered against loaded row keys) — per the business requirement, a
  // configured field is always shown as a column even when its relationship can't resolve for a
  // given primary table, rendering blank rather than silently disappearing.
  const columns = useMemo(
    () => wl.columnsFor(rows.length ? Object.keys(rows[0]) : []),
    [wl.activeWorklist, rows],
  );
  const columnLabel = (c: string) => wl.columnLabel(c);

  const runDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await actions.onDelete({ row: deleteTarget, router, reload, openDetails: setDetailsRow });
      toast.success(`${actions.label} deleted`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const runApprove = async () => {
    if (!approveTarget || !actions.onApprove) return;
    setBusy(true);
    try {
      await actions.onApprove({ row: approveTarget, router, reload, openDetails: setDetailsRow });
      toast.success(`${actions.label} approved`);
      setApproveTarget(null);
    } catch (e: any) {
      toast.error(e.message || "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  const runReject = async () => {
    if (!rejectTarget || !actions.onReject) return;
    if (!rejectRemarks.trim()) return toast.error("A rejection reason is required.");
    setBusy(true);
    try {
      await actions.onReject({ row: rejectTarget, router, reload, openDetails: setDetailsRow }, rejectRemarks.trim());
      toast.success(`${actions.label} rejected`);
      setRejectTarget(null);
      setRejectRemarks("");
    } catch (e: any) {
      toast.error(e.message || "Rejection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4 lg:p-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Receipt & Master Data</span>
      </div>

      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight tracking-tight">Receipt & Master Data</h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Unified browser over existing Legacy ERP sources</p>
              {!loading && <Badge variant="secondary" className="h-5 text-[11px] font-normal">{rows.length} {rows.length === 1 ? "record" : "records"}</Badge>}
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
              placeholder={`Search ${actions.label}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {actions.onNew && (
            <Button size="sm" onClick={() => actions.onNew!({ router, reload, openDetails: setDetailsRow })}>
              <Plus className="h-3.5 w-3.5 mr-2" />New {actions.label}
            </Button>
          )}
        </div>

        <Select value={selectedTable} onValueChange={(v) => onTableChange(v as TableKey)}>
          <SelectTrigger className="h-9 w-56 text-sm">
            <SelectValue placeholder="Select table" />
          </SelectTrigger>
          <SelectContent>
            {TABLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-10 w-9" />
                {columns.map((c) => (
                  <TableHead key={c} className="h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                    {columnLabel(c)}
                  </TableHead>
                ))}
                {columns.length === 0 && <TableHead className="h-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: Math.max(columns.length, 5) + 1 }).map((_, j) => (
                      <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={Math.max(columns.length, 1) + 1} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Database />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : `No ${actions.label.toLowerCase()} records yet`}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "Try a different search term." : `Right-click any row (once loaded) for actions, or use New ${actions.label} above.`}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const rowIsApproved = actions.isApproved?.(row);
                  // One action list, two surfaces (right-click + the Quick Actions trigger
                  // below) — see components/legacy-erp/row-actions.tsx. Same actions/handlers
                  // as before, just no longer duplicated as two separate JSX menus.
                  const rowActions: RowAction[] = [
                    { key: "new", label: "New", icon: Plus, onSelect: () => actions.onNew?.({ router, reload, openDetails: setDetailsRow }), disabled: !actions.onNew },
                    { key: "view", label: "View", icon: Eye, onSelect: () => actions.onView({ row, router, reload, openDetails: setDetailsRow }) },
                    { key: "update", label: "Update", icon: Pencil, onSelect: () => actions.onUpdate?.({ row, router, reload, openDetails: setDetailsRow }), disabled: !actions.onUpdate },
                    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget(row), destructive: true, separatorBefore: true },
                    { key: "approve", label: rowIsApproved ? "Already Approved" : "Approval", icon: BadgeCheck, onSelect: () => setApproveTarget(row), disabled: !actions.onApprove || !!rowIsApproved },
                    { key: "reject", label: "Reject", icon: XCircle, onSelect: () => { setRejectRemarks(""); setRejectTarget(row); }, disabled: !actions.onReject || !!rowIsApproved, destructive: true },
                  ];
                  return (
                    <RowContextMenu key={String(row.RecId)} actions={rowActions}>
                      <TableRow className="cursor-context-menu hover:bg-muted/40" onDoubleClick={() => actions.onView({ row, router, reload, openDetails: setDetailsRow })}>
                        <TableCell className="py-1"><RowActionsMenu actions={rowActions} /></TableCell>
                        {columns.map((c) => (
                          <TableCell key={c} className="whitespace-nowrap py-3 text-sm">{formatCell(row[c])}</TableCell>
                        ))}
                      </TableRow>
                    </RowContextMenu>
                  );
                })
              )}
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
        activeTableSource={mapTableKeyToWorklistSource(selectedTable)}
        onSave={handleSaveWorklists}
      />

      {/* Generic read-only fallback for tables with no dedicated detail route (Address/City/
          State/Country/Warehouse) — shows every already-loaded column, no extra request. */}
      <Dialog open={!!detailsRow} onOpenChange={(open) => !open && setDetailsRow(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{actions.label} Details</DialogTitle>
            <DialogDescription>Read-only — all columns from the selected source.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {detailsRow && Object.entries(detailsRow).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{humanizeColumn(k)}</dt>
                <dd className="font-medium break-words">{formatCell(v)}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {actions.label}</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this record? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={runDelete} disabled={busy}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {actions.label}</AlertDialogTitle>
            <AlertDialogDescription>This marks the record as approved using its existing Approved status field.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runApprove} disabled={busy}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {actions.label}</AlertDialogTitle>
            <AlertDialogDescription>A rejection reason is required and will be shown to the original submitter.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectRemarks}
            onChange={(e) => setRejectRemarks(e.target.value)}
            placeholder="Reason for rejection..."
            className="min-h-24"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={runReject} disabled={busy || !rejectRemarks.trim()}>
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
