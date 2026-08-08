"use client";

import { useEffect, useState } from "react";
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
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { Search, RefreshCw, Plus, MoreHorizontal, Eye, Pencil, Trash2, Ruler, SearchX, ChevronRight } from "lucide-react";

interface UnitSetRow {
  id: number;
  setCode: string;
  setName: string;
  inUse?: boolean | number | null;
  systemSet?: boolean | number | null;
}

// The master LIST screen — mirrors current-accounts-list/page.tsx exactly (search,
// sortable table, row actions navigating to the single-record editor). Selecting or
// creating a set opens /legacy-erp/unit-sets?id=&mode=, the detail screen that hosts
// the Master-Detail Workspace Layout for that set's Units.
export default function UnitSetsListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UnitSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UnitSetRow | null>(null);

  const load = async (term?: string) => {
    setLoading(true);
    try {
      const r = await legacyErpApi.unitSets.list(term);
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load unit sets");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  const view = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/unit-sets?id=${id}&mode=view`);
  const update = (id: number) => navigateOrOpenTab(router, `/dashboard/legacy-erp/unit-sets?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/legacy-erp/unit-sets?mode=create`);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.unitSets.delete(deleteTarget.id);
      toast.success("Unit set deleted");
      setDeleteTarget(null);
      load(search.trim() || undefined);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Unit Sets</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Ruler className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Unit Sets</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Units of measure master data</p>
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
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Code</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Name</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Type</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Status</TableHead>
                <TableHead className="h-10 w-14 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Ruler />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : "No unit sets yet"}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "You can create a new Unit Set." : 'Click "Create New" to add your first Unit Set.'}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button size="sm" onClick={createNew}><Plus className="h-3.5 w-3.5 mr-2" />Create New</Button>
                      </EmptyContent>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} className="group">
                  <TableCell className="py-3">
                    <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.setCode}</span>
                  </TableCell>
                  <TableCell className="py-3 font-medium">{row.setName}</TableCell>
                  <TableCell className="py-3">
                    {row.systemSet ? (
                      <Badge variant="secondary" className="text-[11px] font-normal">System</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-normal">User Defined</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    {row.inUse ? (
                      <Badge variant="outline" className="border-emerald-400/50 text-[11px] font-normal text-emerald-600 dark:text-emerald-400">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => view(row.id)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => update(row.id)}><Pencil className="h-4 w-4 mr-2" />Update</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(row)}>
                          <Trash2 className="h-4 w-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit Set</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete &ldquo;{deleteTarget?.setName}&rdquo;?</AlertDialogDescription>
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
