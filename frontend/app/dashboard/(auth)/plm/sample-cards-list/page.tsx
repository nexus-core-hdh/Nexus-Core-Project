"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Search, RefreshCw, Plus, Eye, Pencil, Trash2, Shirt, SearchX, ChevronRight } from "lucide-react";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";

// Sample Cards List — the legacy-ERP-style master list for the same StyleCard records
// plm/sample-cards (the detail/editor screen, one static route reading ?id=&mode= — the
// same Workspace tab convention every legacy-erp List+Detail pair already uses, e.g.
// yarn-cards-list -> yarn-cards) manages. Moved here from plm/sample-cards itself so that
// route is free for the detail screen — see plm/sample-cards/page.tsx's own header comment.
// Same data, same backend (plm-cards.service.ts's listStyleCards()/deleteStyleCard()) as
// plm/style-cards' own list, just with this screen's own Code/Name/In-Use conventions.
type SortKey = "styleNumber" | "title" | "season";

export default function SampleCardMasterListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("styleNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async (term?: string) => {
    setLoading(true);
    try {
      const r: any = await plmApi.styleCards.list({ limit: "200", ...(term ? { search: term } : {}) });
      const list = Array.isArray(r) ? r : (r?.data ?? []);
      setRows(list);
    } catch (e: any) {
      toast.error(e.message || "Failed to load sample cards");
      setRows([]);
    } finally {
      setLoading(false);
      setSearched(!!term);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = () => load(search.trim() || undefined);
  const refresh = () => { setSearch(""); load(); };

  // Query-param navigation into the detail screen's own single static route (?id=&mode=) —
  // the same shape every other module's List page already uses (see
  // inventory-receipts-list/page.tsx's identical view/update/createNew), so navigateOrOpenTab
  // opens/reuses the Workspace tab correctly instead of a plain in-place navigation.
  const view = (id: string) => navigateOrOpenTab(router, `/dashboard/plm/sample-cards?id=${id}&mode=view`);
  const update = (id: string) => navigateOrOpenTab(router, `/dashboard/plm/sample-cards?id=${id}&mode=edit`);
  const createNew = () => navigateOrOpenTab(router, `/dashboard/plm/sample-cards?mode=create`);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await plmApi.styleCards.delete(deleteTarget.id);
      toast.success("Sample card deleted");
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
        <span>PLM</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Sample Cards</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Shirt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Sample Cards</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Garment sampling master records</p>
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
              placeholder="Search by Code or Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" onClick={createNew}>
          <Plus className="h-3.5 w-3.5 mr-2" />Create New
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-10 cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" onClick={() => toggleSort("styleNumber")}>Code</TableHead>
                <TableHead className="h-10 cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" onClick={() => toggleSort("title")}>Name</TableHead>
                <TableHead className="h-10 cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" onClick={() => toggleSort("season")}>Season</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">In Use</TableHead>
                <TableHead className="h-10 w-14 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
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
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Shirt />}</EmptyMedia>
                        <EmptyTitle>{searched ? "Record not found" : "No sample cards yet"}</EmptyTitle>
                        <EmptyDescription>
                          {searched ? "You can create a new Sample Card." : 'Click "Create New" to add your first Sample Card.'}
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
                  { key: "delete", label: "Delete", icon: Trash2, onSelect: () => setDeleteTarget({ id: row.id, code: row.styleNumber }), destructive: true, separatorBefore: true },
                ];
                return (
                <RowContextMenu key={row.id} actions={rowActions}>
                <TableRow className="group cursor-pointer hover:bg-muted/40" onDoubleClick={() => view(row.id)}>
                  <TableCell className="py-3">
                    <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.styleNumber}</span>
                  </TableCell>
                  <TableCell className="py-3">{row.title}</TableCell>
                  <TableCell className="py-3">{row.season || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="py-3">
                    <Badge variant={row.inUse === false ? "secondary" : "default"} className="h-5 text-[11px] font-normal">
                      {row.inUse === false ? "No" : "Yes"}
                    </Badge>
                  </TableCell>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sample Card</AlertDialogTitle>
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
