"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Search, RefreshCw, Plus, Eye, Pencil, Trash2, Shirt, SearchX, FileClock,
  ChevronRight,
} from "lucide-react";
import { formatCell } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { ModuleHeader } from "@/components/legacy-erp/module-header";

type SortKey = "inventoryCode" | "inventoryName" | "specialCode";

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
      { key: "inventoryName", label: "Name", sortable: true, render: (row: any) => <span className="font-medium">{row.inventoryName}</span> },
      { key: "specialCode", label: "Special Code", sortable: true, render: (row: any) => row.specialCode || <span className="text-muted-foreground">—</span> },
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Fabric Cards</span>
      </div>

      <ModuleHeader
        icon={Shirt}
        title="Fabric Cards"
        subtitle="Fabric item master"
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
          storageKey="fabricCardsList"
          getRowKey={(row) => row.id}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => toggleSort(key as SortKey)}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
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
