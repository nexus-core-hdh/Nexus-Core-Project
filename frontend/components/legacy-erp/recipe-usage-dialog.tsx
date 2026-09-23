"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { recipeUsageApi, type RecipeUsageRow, type RecipeUsageType } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Search, RefreshCw, Network, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

// Recipe Usage ("Where Used") — ONE dialog shared by Fabric Cards, Yarn Cards, Trim Cards and
// Inventory Cards' own "Recipe Usage Information" right-click action (row-actions.tsx's RowAction
// framework). Backed entirely by recipeUsageApi.list() -> RecipeUsageController ->
// RecipeUsageService — server-side search/type-filter/pagination/count, same {rows,total,skip,
// take} contract log-tracking/page.tsx's own auditApi.list() already uses (same Previous/Next +
// "Showing X-Y of Z" pattern, reused rather than a new pagination UI). No per-card-type variant of
// this component exists or is needed — `inventoryId` alone (the real IM_Item.RecId every one of
// those four screens' own row.id already is) is enough to resolve real usage.
//
// Compact worklist-style grid (Type/Code/Name/Order/Quantity), matching the reference legacy
// "Recipe Usage List" screen's own density — deliberately no big Empty-state artwork/cards; a
// zero-result or error state is just a plain centered line inside the same grid area.
const PAGE_SIZE = 50;

// "Order" (not "Work Order") to match the reference screen's own Type column wording exactly.
const TYPE_LABEL: Record<RecipeUsageType, string> = { Style: "Style", Sample: "Sample", Order: "Order", Fabric: "Fabric" };
const TYPE_BADGE: Record<RecipeUsageType, string> = {
  Style: "bg-blue-600 hover:bg-blue-600/90 dark:bg-blue-500 text-white border-transparent",
  Sample: "bg-amber-600 hover:bg-amber-600/90 dark:bg-amber-500 text-white border-transparent",
  Order: "bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500 text-white border-transparent",
  Fabric: "bg-violet-600 hover:bg-violet-600/90 dark:bg-violet-500 text-white border-transparent",
};

const fmtQty = (n: number | null) => (n == null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));

// Every real type this resolver can return already has a real, existing destination screen (see
// recipe-usage.service.ts's own header comment on what was searched/confirmed) — no invented
// routes. Kept as an explicit per-type map (not a formula) so a future usage type this dialog
// doesn't yet know how to open falls through to `null` (row stays informational, per this
// feature's own "never fabricate a navigation path" rule) instead of guessing a URL shape.
function sourceRoute(row: RecipeUsageRow): string | null {
  switch (row.type) {
    case "Style": return `/dashboard/plm/style-cards/${row.sourceId}`;
    case "Sample": return `/dashboard/plm/sample-cards?id=${row.sourceId}&mode=edit`;
    case "Order": return `/dashboard/legacy-erp/work-orders?id=${row.sourceId}&mode=view`;
    case "Fabric": return `/dashboard/legacy-erp/fabric-cards?id=${row.sourceId}&mode=view`;
    default: return null;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The real IM_Item.RecId being inspected — null/undefined leaves the dialog closed-empty. */
  inventoryId: number | null;
  /** Display-only subtitle, e.g. "FABRIC-00007 — FLAT KNIT RIB 1X1" — never used for the query. */
  itemLabel?: string;
}

export function RecipeUsageDialog({ open, onOpenChange, inventoryId, itemLabel }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipeUsageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | RecipeUsageType>("all");

  const load = async (nextSkip = 0) => {
    if (!inventoryId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await recipeUsageApi.list({
        inventoryId,
        search: search.trim() || undefined,
        type: type !== "all" ? type : undefined,
        skip: nextSkip,
        take: PAGE_SIZE,
      });
      setRows(r.rows);
      setTotal(r.total);
      setSkip(r.skip);
    } catch (e: any) {
      const msg = e.message || "Failed to load Recipe Usage";
      setError(msg);
      toast.error(msg);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Reset to a clean first page every time the dialog opens for a (possibly different) item, or
  // when search/type changes while open — never carries stale filters/paging from a previous item.
  useEffect(() => {
    if (!open) return;
    setSearchInput("");
    setSearch("");
    setType("all");
    setSkip(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inventoryId]);

  useEffect(() => {
    if (!open) return;
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inventoryId, search, type]);

  const openSource = (row: RecipeUsageRow) => {
    const route = sourceRoute(row);
    if (!route) return;
    navigateOrOpenTab(router, route);
    onOpenChange(false);
  };

  const pageFrom = total === 0 ? 0 : skip + 1;
  const pageTo = Math.min(skip + PAGE_SIZE, total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] w-[min(92vw,860px)] max-w-none sm:max-w-none flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Network className="h-4 w-4 text-primary" />
            Recipe Usage List
          </DialogTitle>
          {itemLabel && <p className="text-[11px] text-muted-foreground">{itemLabel}</p>}
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <InputGroup className="h-8 max-w-xs">
            <InputGroupAddon><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
            <InputGroupInput
              placeholder="Search code, name, or order no..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
              className="text-xs"
            />
          </InputGroup>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Style">Style</SelectItem>
              <SelectItem value="Sample">Sample</SelectItem>
              <SelectItem value="Order">Order</SelectItem>
              <SelectItem value="Fabric">Fabric</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => load(skip)} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {!loading && !error && (
            <Badge variant="secondary" className="ml-auto h-5 text-[11px] font-normal">
              Count = {total}
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center py-10 text-[13px] text-destructive">{error}</div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
              <p className="text-[13px] font-medium">No recipe usage found.</p>
              <p className="text-[11px] text-muted-foreground">
                {search.trim() || type !== "all"
                  ? "No usage matches your current search/filter."
                  : "This item is not referenced by any Style, Sample, Order, or Fabric recipe."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-8 w-24 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Type</TableHead>
                  <TableHead className="h-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Code</TableHead>
                  <TableHead className="h-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Name</TableHead>
                  <TableHead className="h-8 w-28 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Order</TableHead>
                  <TableHead className="h-8 w-24 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Quantity</TableHead>
                  <TableHead className="h-8 w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const route = sourceRoute(row);
                  return (
                    <TableRow
                      key={`${row.type}-${row.sourceId}-${i}`}
                      className={route ? "cursor-pointer hover:bg-muted/30" : undefined}
                      onDoubleClick={() => route && openSource(row)}
                      title={route ? "Double-click to open" : undefined}
                    >
                      <TableCell className="py-1.5">
                        <Badge className={`text-[11px] font-normal ${TYPE_BADGE[row.type]}`}>{TYPE_LABEL[row.type]}</Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-[13px]">
                        <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{row.code || "—"}</span>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate py-1.5 text-[13px]" title={row.name ?? undefined}>
                        {row.name || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-[13px] text-muted-foreground">{row.documentNo || "—"}</TableCell>
                      <TableCell className="py-1.5 text-right text-[13px] font-mono">{fmtQty(row.quantity)}</TableCell>
                      <TableCell className="py-1.5">
                        {route && (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => openSource(row)} title="Open"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {total > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span>Showing {pageFrom}–{pageTo} of {total}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7" disabled={loading || skip === 0} onClick={() => load(Math.max(0, skip - PAGE_SIZE))}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />Previous
              </Button>
              <Button variant="outline" size="sm" className="h-7" disabled={loading || skip + PAGE_SIZE >= total} onClick={() => load(skip + PAGE_SIZE)}>
                Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
