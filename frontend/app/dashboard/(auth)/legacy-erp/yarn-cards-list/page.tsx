"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
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
  Search, RefreshCw, Plus, Eye, Pencil, Trash2, Layers, SearchX, FileClock,
  ChevronRight, MousePointerClick, XCircle,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { ModuleHeader } from "@/components/legacy-erp/module-header";

const YARN_CARDS_LIST_PATH = "/dashboard/legacy-erp/yarn-cards-list";

type SortKey = "inventoryCode" | "inventoryName" | "specialCode";

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
  const wl = useWorklist({ storageKey: "yarnCardsListWorklists" });

  const load = async (term?: string, worklistOverride?: Worklist | null) => {
    setLoading(true);
    try {
      const worklist = worklistOverride !== undefined ? worklistOverride : wl.activeWorklist;
      const r: any = worklist
        ? await legacyErpApi.worklistFields.resolve("yarn-card-list", worklist.fields.map((f) => ({ source: f.source, key: f.key })), term)
        : await legacyErpApi.yarnCards.list(term);
      const list = Array.isArray(r) ? r : [];
      setRows(worklist ? wl.normalizeRows(list) : list);
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

  // Unified column model for WorklistTable — see purchase-orders-list/page.tsx for the reference
  // pattern this mirrors. Only the Standard columns are ever `sortable: true`.
  const columns: WorklistTableColumn<any>[] = useMemo(() => {
    if (activeColumns) {
      return activeColumns.map((c) => ({
        key: c,
        label: wl.columnLabel(c),
        render: (row: any) => formatCell(row[c]),
      }));
    }
    return [
      {
        key: "inventoryCode", label: "Code", sortable: true,
        render: (row: any) => <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.inventoryCode}</span>,
      },
      {
        key: "inventoryName", label: "Name", sortable: true,
        render: (row: any) => <span className="font-medium">{row.inventoryName}</span>,
      },
      {
        key: "specialCode", label: "Special Code", sortable: true,
        render: (row: any) => row.specialCode || <span className="text-muted-foreground">—</span>,
      },
      {
        key: "status", label: "Status",
        render: (row: any) => (
          <Badge
            variant={row.inUse ? "default" : "secondary"}
            className={cn("text-[11px] font-normal", row.inUse && "bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500")}
          >
            {row.inUse ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeColumns]);

  const getRowActions = (row: any): RowAction[] => [
    { key: "view", label: "View", icon: Eye, onSelect: () => view(row.id) },
    { key: "update", label: "Update", icon: Pencil, onSelect: () => update(row.id) },
    { key: "statement", label: "View Statement", icon: FileClock, onSelect: () => viewStatement(row.id) },
    { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.inventoryCode }), destructive: true, separatorBefore: true },
  ];

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/yarn-cards?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/yarn-cards?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/yarn-cards?mode=create`);
  const viewStatement = (id: number) => navigateOrOpenTab(
    router,
    `/dashboard/legacy-erp/item-statement?id=${id}&source=${encodeURIComponent(YARN_CARDS_LIST_PATH)}&sourceLabel=${encodeURIComponent("Yarn Cards")}`,
  );

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

      <ModuleHeader
        icon={Layers}
        title="Yarn Cards"
        subtitle={mode === "lookup" ? "Double-click or press Enter to select a Yarn Card" : "Yarn item master"}
        badges={
          !loading && (
            <Badge variant="secondary" className="h-5 text-[11px] font-normal">
              {rows.length} {rows.length === 1 ? "record" : "records"}
            </Badge>
          )
        }
        actions={
          <>
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
          </>
        }
      />

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={sortedRows}
          storageKey="yarnCardsList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => toggleSort(key as SortKey)}
          actionsColumnWidth={mode === "lookup" ? 160 : 56}
          getRowProps={(row, index) => ({
            ref: (el: HTMLTableRowElement | null) => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); },
            tabIndex: 0,
            onFocus: () => setSelectedId(row.id),
            onKeyDown: (e: React.KeyboardEvent) => handleRowKeyDown(e, row, index),
            onDoubleClick: () => returnAndClose(row),
            className: cn("group outline-none", selectedId === row.id && "bg-primary/10", mode === "lookup" && "cursor-pointer"),
          })}
          renderRowActions={(row) => (
            // Maintenance actions (View/Update/Delete) stay exactly as they were, regardless of
            // mode. Select is ADDITIONAL, shown only in lookup mode — same convention as the
            // Master Lookup screen's Maintenance grid.
            <div className="flex items-center justify-end gap-1">
              {mode === "lookup" && (
                <Button size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}>
                  <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
                </Button>
              )}
              <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
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
        activeTableSource="yarn-card"
        primaryScope="yarn-card-list"
        gridLabel="the Yarn Cards List grid"
        onSave={handleSaveWorklists}
      />

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
