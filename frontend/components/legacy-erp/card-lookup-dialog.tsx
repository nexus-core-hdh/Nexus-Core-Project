"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Search, SearchX, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CardLookupRow {
  id: number | string;
  inventoryCode: string;
  inventoryName: string;
  inUse?: boolean | number | null;
}

interface CardLookupDialogProps<T extends CardLookupRow> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Select Fabric Card" / "Select Trim Card". */
  title: string;
  /** legacyErpApi.fabricCards.list / legacyErpApi.trimInventoryCards.list — the same list
   *  endpoint each card type's own List screen already searches through (server-side,
   *  code-or-name), reused as-is here. */
  fetchOptions: (search?: string) => Promise<T[]>;
  onSelect: (row: T) => void;
}

// Generic "search a Card master and pick one" grid dialog — a proper multi-column, multi-row
// table (not a single-line autocomplete popup), for fields that need to bind an existing
// Fabric/Trim/other IM_Item-backed Card rather than free text. Deliberately NOT a management
// screen: no create/edit/delete, no worklist customization — those already live on each card
// type's own List screen (fabric-cards-list, trim-inventory-cards-list); this only ever reads
// via the same `.list(search)` call that screen's own search box already calls, and returns a
// selection. One generic component for every card type — Fabric and Trim both mount this with
// their own fetchOptions, never a second copy of the dialog.
export function CardLookupDialog<T extends CardLookupRow>({ open, onOpenChange, title, fetchOptions, onSelect }: CardLookupDialogProps<T>) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const load = (term?: string) => {
    setLoading(true);
    fetchOptions(term)
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]))
      .finally(() => { setLoading(false); setSearched(!!term); });
  };

  // Reset and reload the full list fresh every time the dialog opens — a stale search/result
  // set from the previous time it was opened (possibly for a different row) should never
  // silently carry over.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (row: T) => { onSelect(row); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Search by Code or Name, then select a record.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border px-5 py-3">
          <InputGroup className="h-9">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(search.trim() || undefined)}
              className="text-sm"
            />
          </InputGroup>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Code</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Name</TableHead>
                <TableHead className="w-24 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-10">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{searched ? <SearchX /> : <Search />}</EmptyMedia>
                        <EmptyTitle>{searched ? "No matching records" : "No records yet"}</EmptyTitle>
                        <EmptyDescription>{searched ? "Try a different search term." : "No cards have been created yet."}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="group cursor-pointer"
                    onDoubleClick={() => choose(row)}
                  >
                    <TableCell className="py-2.5"><span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.inventoryCode}</span></TableCell>
                    <TableCell className="py-2.5 font-medium">{row.inventoryName}</TableCell>
                    <TableCell className="py-2.5">
                      <Badge
                        variant={row.inUse ? "default" : "secondary"}
                        className={cn("text-[11px] font-normal", row.inUse && "bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500")}
                      >
                        {row.inUse ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => choose(row)}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground opacity-0 transition-opacity hover:bg-primary/90 group-hover:opacity-100"
                      >
                        <MousePointerClick className="h-3.5 w-3.5" />Select
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
