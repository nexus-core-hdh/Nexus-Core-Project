"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import {
  Search, RefreshCw, Plus, Eye, Pencil, Trash2, Factory, SearchX,
  ChevronRight,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";

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

// "receiptType" is included for completeness (spec's "at minimum" sort list) even though every
// visible row shares the same value while the type dropdown is scoped to one type — sorting by
// it is a harmless no-op in that case, not a bug.
type SortKey = "receiptType" | "subcontractTypeName" | "receiptNo" | "receiptDate" | "currentAccountCode" | "receiptTotal";
// Sorted against the actual underlying number, not the formatted "22,500.0000" display string —
// every other sort key here is already a plain string/short code, safe for localeCompare.
const NUMERIC_SORT_KEYS = new Set<SortKey>(["receiptTotal"]);

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
  // "Subcontractation" filter — the reference screen's own second selector, reusing the existing
  // Subcontract Type master/MasterAutocompleteField wholesale (see legacy-master-lookup.service.ts's
  // TABLES config). "" = no filter (every existing behavior before this filter existed).
  const [subcontractTypeFilterId, setSubcontractTypeFilterId] = useState("");
  const [subcontractTypeFilterLabel, setSubcontractTypeFilterLabel] = useState("");

  const load = async (type: number, term?: string, worklistOverride?: Worklist | null, subcontractTypeOverride?: string) => {
    setLoading(true);
    try {
      const typeCfg = getReceiptTypeConfig(type);
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const subType = subcontractTypeOverride !== undefined ? subcontractTypeOverride : subcontractTypeFilterId;
      // The filter only applies to the Standard path today — a custom worklist's rows come from
      // the generic cross-source resolver (worklistFields.resolve), which has no
      // subcontractTypeId param; adding one there is a separate, bigger change than this fix.
      const r: any = worklist
        ? await legacyErpApi.worklistFields.resolve(typeCfg.key, worklist.fields.map((f) => ({ source: f.source, key: f.key })), term)
        : await legacyErpApi.receipts(type).list(term, subType ? Number(subType) : undefined);
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
  const onSubcontractTypeFilterSelect = (o: { id: number | string; name: string }) => {
    setSubcontractTypeFilterId(String(o.id));
    setSubcontractTypeFilterLabel(o.name);
    load(receiptType, search.trim() || undefined, wl.activeWorklist, String(o.id));
  };
  const onSubcontractTypeFilterClear = () => {
    setSubcontractTypeFilterId("");
    setSubcontractTypeFilterLabel("");
    load(receiptType, search.trim() || undefined, wl.activeWorklist, "");
  };

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

  // Unified column model for WorklistTable — see purchase-orders-list/page.tsx's own comment
  // for the full rationale. Only the Standard columns are ever `sortable: true`. Exact 9-column
  // order/content preserved verbatim from the original Standard branch (see its own comments,
  // now folded into each column's `render`).
  const columns: WorklistTableColumn<any>[] = useMemo(() => {
    if (activeColumns) {
      return activeColumns.map((c) => ({
        key: c,
        label: wl.columnLabel(c),
        render: (row: any) => formatCell(row[c]),
      }));
    }
    return [
      { key: "receiptType", label: "Receipt Type", sortable: true, render: () => <>{receiptType}-{cfg.label}</> },
      { key: "subcontractTypeName", label: "Subcontract", sortable: true, render: (row: any) => row.subcontractTypeName || <span className="text-muted-foreground">—</span> },
      {
        key: "receiptNo", label: "Receipt No", sortable: true,
        render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.receiptNo}</span>,
      },
      {
        key: "receiptDate", label: "Receipt Date", sortable: true,
        render: (row: any) => (row.receiptDate ? new Date(row.receiptDate).toLocaleDateString() : "—"),
      },
      { key: "currentAccountCode", label: "Current Account Code", sortable: true, render: (row: any) => row.currentAccountCode || <span className="text-muted-foreground">—</span> },
      { key: "currentAccountName", label: "Current Account Name", render: (row: any) => row.currentAccountName || <span className="text-muted-foreground">—</span> },
      { key: "documentNo", label: "Document No", render: (row: any) => row.documentNo || <span className="text-muted-foreground">—</span> },
      { key: "warehouseCode", label: "In Warehouse", render: (row: any) => row.warehouseCode || <span className="text-muted-foreground">—</span> },
      {
        key: "receiptTotal", label: "Receipt Total", sortable: true, align: "right",
        render: (row: any) => <span className="tabular-nums">{Number(row.receiptTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>,
      },
    ] as WorklistTableColumn<any>[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColumns, receiptType, cfg.label]);

  const getRowActions = (row: any): RowAction[] => [
    { key: "view", label: "View", icon: Eye, onSelect: () => view(row.id) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => update(row.id) },
    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.receiptNo }), destructive: true, separatorBefore: true },
  ];

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
      const cmp = NUMERIC_SORT_KEYS.has(sortKey)
        ? Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0)
        : String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
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
              placeholder="Search by Receipt No, Account, Document, or Warehouse..."
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

        <div className="flex items-center gap-2">
          {/* "Subcontractation" filter — reuses the existing Subcontract Type master wholesale
              (masterKey="subcontract-type") via the shared MasterAutocompleteField: searchable,
              shows active values, and its own F2/search-icon already opens the real Subcontract
              Type management screen (Add Record there saves and returns the new value here
              automatically — no second "Add New" UI needed). `compact` matches this toolbar
              row's height/no-label styling instead of a full form field's. */}
          <div className="w-56">
            <MasterAutocompleteField
              label="Subcontractation"
              masterKey="subcontract-type"
              compact
              displayValue={subcontractTypeFilterLabel}
              onSelect={onSubcontractTypeFilterSelect}
              onClear={onSubcontractTypeFilterClear}
            />
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
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="subcontractReceiptsList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => toggleSort(key as SortKey)}
          onRowDoubleClick={(row) => view(row.id)}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
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
          }
        />
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
