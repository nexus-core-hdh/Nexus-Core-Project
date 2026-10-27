"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import { format, parseISO } from "date-fns";
import { BarChart3, ExternalLink, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MENU_CHANGED_EVENT } from "@/lib/workspace/menu-events";
import { notifyMenuChanged } from "@/lib/store/screen-index-store";
import { REPORT_MODULE_UI, reportBuilderApiFor, type ReportCatalog, type ReportDefinition, type ReportModuleKey } from "@/lib/nexuscore-api";


/** <Module> › Reports › Manage Reports — every user-defined report of a module, with create/edit/delete. */
export function ManageReportsScreen({ module }: { module: ReportModuleKey }) {
  const reportApi = useMemo(() => reportBuilderApiFor(module), [module]);
  const ui = REPORT_MODULE_UI[module];
  const VIEW_HREF = (id: string) => `${ui.basePath}/view?id=${id}`;
  const DESIGNER_HREF = (id?: string) => (id ? `${ui.basePath}/designer?id=${id}` : `${ui.basePath}/designer`);
  const router = useRouter();
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [reports, setReports] = useState<ReportDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReportDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (reports ?? []).filter((r) =>
      (sourceFilter === "all" || r.dataSource === sourceFilter) &&
      (!q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q)),
    );
  }, [reports, search, sourceFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Back to the first page when the search, filter or page size changes.
  useEffect(() => setPage(0), [search, sourceFilter, pageSize]);
  // Stay in range when the list shrinks (e.g. the last report on the last page was deleted).
  useEffect(() => setPage((p) => Math.min(p, pageCount - 1)), [pageCount]);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const load = useCallback(async () => {
    try {
      const cat = await reportApi.catalog();
      setCatalog(cat);
      if (!cat.capabilities.view) {
        setReports([]);
        return;
      }
      setReports(await reportApi.list());
      setError(null);
    } catch (e: any) {
      setError(e.message || "Could not load reports");
    }
  }, [reportApi]);

  useEffect(() => {
    void load();
    // Reports created/renamed/deleted in a designer tab also change the menu — refresh then.
    window.addEventListener(MENU_CHANGED_EVENT, load);
    return () => window.removeEventListener(MENU_CHANGED_EVENT, load);
  }, [load]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await reportApi.remove(pendingDelete.id);
      toast.success(`Report "${pendingDelete.name}" deleted`);
      setPendingDelete(null);
      notifyMenuChanged();
    } catch (e: any) {
      toast.error(e.message || "Could not delete the report");
    } finally {
      setDeleting(false);
    }
  };

  const caps = catalog?.capabilities;
  const sourceLabel = (key: string) => catalog?.sources.find((s) => s.key === key)?.label ?? key;

  return (
    <div className="space-y-4 p-4">
      <ModuleHeader
        icon={BarChart3}
        title="Reports"
        subtitle={`Create ${ui.label} reports from its data sources. Each report gets its own menu entry in the ${ui.label} reports section of its data source.`}
        actions={caps?.create && (
          <Button size="sm" onClick={() => navigateOrOpenTab(router, DESIGNER_HREF())}>
            <Plus className="mr-2 h-3.5 w-3.5" />New Report
          </Button>
        )}
      />

      {error ? (
        <Empty className="rounded-md border py-12">
          <EmptyHeader>
            <EmptyTitle>Could not load reports</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !reports || !caps ? (
        <Skeleton className="h-48 w-full" />
      ) : !caps.view ? (
        <Empty className="rounded-md border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Lock /></EmptyMedia>
            <EmptyTitle>No access</EmptyTitle>
            <EmptyDescription>You don&apos;t have permission to view {ui.label} reports. Ask an administrator to grant &quot;{ui.label} Reports&quot; access to your role.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : reports.length === 0 ? (
        <Empty className="rounded-md border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BarChart3 /></EmptyMedia>
            <EmptyTitle>No reports yet</EmptyTitle>
            <EmptyDescription>
              {caps.create ? "Create your first report: pick a data source, choose columns and filters, then save." : `No ${ui.label} reports have been created yet.`}
            </EmptyDescription>
          </EmptyHeader>
          {caps.create && (
            <EmptyContent>
              <Button size="sm" onClick={() => navigateOrOpenTab(router, DESIGNER_HREF())}><Plus className="mr-2 h-3.5 w-3.5" />New Report</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports" className="h-9 pl-8" />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-full sm:w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All data sources</SelectItem>
              {/* Only the sources reports actually use — Legacy ERP offers hundreds of database tables. */}
              {(catalog?.sources ?? []).filter((src) => (reports ?? []).some((r) => r.dataSource === src.key)).map((src) => (
                <SelectItem key={src.key} value={src.key}>{src.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Data Source</TableHead>
                <TableHead className="text-right">Columns</TableHead>
                <TableHead className="text-right">Filters</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No reports match your search.</TableCell>
                </TableRow>
              )}
              {pageRows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onDoubleClick={() => navigateOrOpenTab(router, VIEW_HREF(r.id))}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="max-w-md truncate text-xs text-muted-foreground">{r.description}</div>}
                  </TableCell>
                  <TableCell>{sourceLabel(r.dataSource)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.columns.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.filters.length}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{format(parseISO(r.updatedAt), "dd MMM yyyy, HH:mm")}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Open report" onClick={() => navigateOrOpenTab(router, VIEW_HREF(r.id))}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {caps.update && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit report" onClick={() => navigateOrOpenTab(router, DESIGNER_HREF(r.id))}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {caps.delete && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete report" onClick={() => setPendingDelete(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ReportsPager page={page} pageCount={pageCount} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete report?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name}&quot; and its menu entry will be removed for everyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDelete(); }} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Page numbers to show: first, last, and the current page with one neighbour each side. */
function visiblePages(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([0, pageCount - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pageCount));
  const sorted = Array.from(wanted).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

function ReportsPager({ page, pageCount, pageSize, total, onPage, onPageSize }: {
  page: number; pageCount: number; pageSize: number; total: number;
  onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (p >= 0 && p < pageCount) onPage(p);
  };
  const disabled = "pointer-events-none opacity-50";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {total === 0 ? "0 reports" : `${(page * pageSize + 1).toLocaleString()}–${Math.min((page + 1) * pageSize, total).toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger size="sm" className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" onClick={go(page - 1)} aria-disabled={page === 0} className={page === 0 ? disabled : undefined} />
            </PaginationItem>
            {visiblePages(page, pageCount).map((p, i) => (
              <PaginationItem key={p === "gap" ? `gap-${i}` : p}>
                {p === "gap" ? <PaginationEllipsis /> : (
                  <PaginationLink href="#" isActive={p === page} onClick={go(p)}>{p + 1}</PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext href="#" onClick={go(page + 1)} aria-disabled={page >= pageCount - 1} className={page >= pageCount - 1 ? disabled : undefined} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
