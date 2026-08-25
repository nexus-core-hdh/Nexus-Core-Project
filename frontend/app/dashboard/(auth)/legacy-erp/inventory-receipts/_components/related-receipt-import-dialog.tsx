"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { WorklistBar } from "@/components/legacy-erp/worklist-bar";
import { WorklistDesignModal } from "@/components/legacy-erp/worklist-design-modal";
import { useWorklist } from "@/hooks/legacy-erp/use-worklist";
import type { WorklistField } from "@/lib/legacy-erp/worklist-types";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { PackagePlus, Search, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportedRelatedLine } from "./inventory-receipt-line-grid";

// Purchase Return -> Current Account -> Universal Action Menu -> "Import Related Receipt".
// Structurally a close sibling of pending-orders-dialog.tsx (same Dialog/Table/Checkbox draft-
// then-confirm pattern, same per-line selection with a per-source-receipt "select all" header
// toggle) — reused rather than redesigned, per the task's own reuse-first instruction. The two
// differences from Pending Orders: the source is an existing Receipt Type 2/11 line (Purchase
// Receipt / Outside Process Receive Receipt, not a Purchase Order line) via listRelatedImportable()
// (Current-Account-scoped server-side, not a client-side filter over everything), and a search
// box (spec requirement) filters the already-loaded eligible set by Receipt No / item code / name.
// `fetchEligible` is injected (rather than this component calling a hardcoded API client) since
// this dialog is only ever mounted for Purchase Return, reached through the generic
// legacyErpApi.receipts(122) client, not the Purchase-Receipt-dedicated one.
//
// Customize Worklist — reuses the exact shared WorklistBar/WorklistDesignModal/useWorklist trio
// every Legacy ERP list screen already uses (receipt-master-data/page.tsx is the reference
// usage), not a bespoke picker. `primaryScope="related-receipt-import"` (see
// worklist-fields.service.ts's ALLOWED_SOURCES_BY_PRIMARY) scopes the Design field tree to
// exactly two sources — "purchase-receipt" (header) and "purchase-receipt-item" (line) — so no
// unrelated Yarn Card/Fabric Card/Trim/etc. fields ever appear here. listRelatedImportable()
// selects the FULL HEADER_COLUMNS/ITEM_COLUMNS set (reusing those two existing constants
// wholesale, same convention HEADER_SELECT/ITEM_SELECT already use elsewhere in that file) in
// this SAME single query — no N+1 — so every field either source can offer is genuinely present
// on the already-loaded receipt/line objects. `resolvableExtraFields` below still re-verifies
// that structurally (checking the field's camelCase key actually exists on a loaded sample row)
// before rendering a column, so a selected field this dialog's query doesn't (or no longer)
// carry is silently dropped rather than rendered as a permanent fake "—" column.

interface RelatedLine {
  purchaseReceiptItemId: number; inventoryId: number; code: string; name: string;
  explanation: string | null; unitId: number | null; unitPrice: number | null; colorCardId: string | null;
  receivedQty: number; availableQty: number;
  baseUnitId: number | null; baseUnitCode: string | null; availableBaseQty: number;
}
interface RelatedSourceReceipt {
  id: number; receiptNo: string; receiptDate: string; receiptType: number; label: string;
  lines: RelatedLine[];
}

const fmtQty = (n: number) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtPrice = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

// Same generic resolved-worklist-field formatter receipt-master-data/page.tsx's own formatCell
// uses (duplicated locally, same convention every *-list page already follows for this — no
// shared formatter exists to import instead) — a custom field's type isn't known ahead of time,
// so this covers the three cases that actually occur across HEADER_COLUMNS/ITEM_COLUMNS: ISO
// timestamps, booleans (IsApproved/VatIncluded/...), and everything else as plain text.
const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return String(value);
};

// WorklistField.key is the raw PascalCase column name (e.g. "DocumentNo") — the same
// camelCasing convention inventory-receipt.service.ts's own `camel()` helper applies server-side
// when aliasing it onto the row, so this is how a field key maps back to the already-loaded
// receipt/line object's own property name.
const camelKey = (key: string) => key[0].toLowerCase() + key.slice(1);

// Shared column widths so the TableHeader and every row (header or child) line up exactly. The
// receipt-header columns (Receipt No/Date/Type) and the item columns (Item Code/Name/Colour/
// Received/Available/Unit/Price) are each populated by only ONE row kind and left blank (not
// colSpan-merged) on the other — a full, honest column set with dedicated single-purpose headers
// instead of ambiguous combined labels, which is what keeps every column's header aligned exactly
// with the values that actually belong to it, and keeps numeric columns aligned row-to-row.
const COL = {
  checkbox: "w-10",
  expand: "w-8",
  receiptNo: "w-28",
  date: "w-24",
  type: "w-40",
  code: "min-w-[110px]",
  name: "min-w-[160px]",
  colour: "w-24",
  qty: "w-28",
  unit: "w-20",
  price: "w-28",
};
const th = "h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAccountId: number | null;
  alreadyImportedIds: Set<number>;
  onConfirm: (lines: ImportedRelatedLine[]) => void;
  /** legacyErpApi.receipts(122).listRelatedImportable — injected so this dialog doesn't hardcode
   *  which receipt-type client it's reached through. */
  fetchEligible: (currentAccountId: number) => Promise<any>;
}

export function RelatedReceiptImportDialog({ open, onOpenChange, currentAccountId, alreadyImportedIds, onConfirm, fetchEligible }: Props) {
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<RelatedSourceReceipt[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [unitOptions, setUnitOptions] = useState<any[]>([]);
  const [colorOptions, setColorOptions] = useState<any[]>([]);
  // Every receipt starts expanded — collapsing is a pure display toggle, never hides a receipt
  // from selection/import, so defaulting open keeps today's "everything visible" behavior intact.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const wl = useWorklist({ storageKey: "relatedReceiptImportWorklists" });

  // Only offer columns that genuinely resolve against this dialog's own loaded data (spec: "do
  // not render a permanently empty/fake column"). Resolvability is a structural property of the
  // query shape (every receipt/line object has the same keys), so checking one loaded sample is
  // enough — and one is always available here, since this only needs to run where there's data
  // to render columns for in the first place.
  const resolvableExtraFields = useMemo((): WorklistField[] => {
    const fields = wl.activeWorklist?.fields ?? [];
    const sample = receipts[0];
    if (!sample) return [];
    const sampleLine = sample.lines[0];
    return fields.filter((f) => {
      if (f.source === "purchase-receipt") return camelKey(f.key) in sample;
      if (f.source === "purchase-receipt-item") return !!sampleLine && camelKey(f.key) in sampleLine;
      return false;
    });
  }, [wl.activeWorklist, receipts]);

  useEffect(() => {
    if (!open) return;
    legacyErpApi.lookupTable("unit").then((r: any) => setUnitOptions(Array.isArray(r) ? r : [])).catch(() => {});
    plmApi.colors.list().then((r: any) => setColorOptions(Array.isArray(r) ? r : [])).catch(() => {});
  }, [open]);

  const unitLabel = (id: number | null) => {
    if (id == null) return "—";
    const m = unitOptions.find((u) => String(u.id) === String(id));
    return m?.code || m?.name || "—";
  };
  const colorLabel = (id: string | null) => {
    if (id == null) return "—";
    const m = colorOptions.find((c) => String(c.id) === String(id));
    return m?.code || m?.name || "—";
  };

  useEffect(() => {
    if (!open || !currentAccountId) return;
    setSelected(new Set());
    setSearch("");
    setCollapsed(new Set());
    setLoading(true);
    fetchEligible(currentAccountId)
      .then((r: any) => setReceipts(Array.isArray(r) ? r : []))
      .catch((e: any) => { toast.error(e.message || "Failed to load related receipts"); setReceipts([]); })
      .finally(() => setLoading(false));
  }, [open, currentAccountId, fetchEligible]);

  // Lines already sitting in the current (unsaved) draft can't be excluded server-side yet — same
  // role alreadyImportedIds plays in pending-orders-dialog.tsx. A receipt left with zero
  // remaining lines after this filter is dropped entirely, same rule as a fully-consumed source.
  const eligibleReceipts = useMemo(
    () => receipts
      .map((r) => ({ ...r, lines: r.lines.filter((l) => !alreadyImportedIds.has(l.purchaseReceiptItemId)) }))
      .filter((r) => r.lines.length > 0),
    [receipts, alreadyImportedIds],
  );

  const visibleReceipts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return eligibleReceipts;
    return eligibleReceipts
      .map((r) => ({
        ...r,
        lines: r.receiptNo.toLowerCase().includes(term)
          ? r.lines
          : r.lines.filter((l) => l.code.toLowerCase().includes(term) || l.name.toLowerCase().includes(term)),
      }))
      .filter((r) => r.lines.length > 0);
  }, [eligibleReceipts, search]);

  const toggleLine = (lineId: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
    return next;
  });

  const receiptSelectionState = (r: RelatedSourceReceipt): "all" | "some" | "none" => {
    const count = r.lines.filter((l) => selected.has(l.purchaseReceiptItemId)).length;
    if (count === 0) return "none";
    return count === r.lines.length ? "all" : "some";
  };

  const toggleReceipt = (r: RelatedSourceReceipt) => setSelected((prev) => {
    const next = new Set(prev);
    const allSelected = r.lines.every((l) => next.has(l.purchaseReceiptItemId));
    r.lines.forEach((l) => (allSelected ? next.delete(l.purchaseReceiptItemId) : next.add(l.purchaseReceiptItemId)));
    return next;
  });

  const toggleCollapsed = (id: number) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedCount = selected.size;

  const confirm = () => {
    const lines: ImportedRelatedLine[] = visibleReceipts
      .flatMap((r) => r.lines
        .filter((l) => selected.has(l.purchaseReceiptItemId))
        .map((l): ImportedRelatedLine => ({
          inventoryId: l.inventoryId, code: l.code, name: l.name, quantity: l.availableQty,
          unitId: l.unitId, unit: "", unitPrice: l.unitPrice,
          purchaseReceiptItemId: l.purchaseReceiptItemId, sourceReceiptNo: r.receiptNo,
          colorCardId: l.colorCardId,
        })));
    if (!lines.length) return;
    onConfirm(lines);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than a typical form dialog — same min()/vw-based sizing convention
          WorklistDesignModal already uses, since the grouped receipt+line table has more
          columns than the original flat layout and benefits from the extra width before
          falling back to horizontal scroll. */}
      <DialogContent className="flex h-[min(88vh,820px)] w-[min(94vw,1360px)] max-w-none sm:max-w-none flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5">
          <DialogTitle>Import Related Receipt</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b border-border px-5 py-2.5">
          <WorklistBar
            worklists={wl.worklists}
            activeWorklistId={wl.activeWorklistId}
            onActiveWorklistChange={wl.setActiveWorklistId}
            onDesignOpen={() => wl.setDesignOpen(true)}
          />
        </div>

        <div className="shrink-0 border-b border-border px-5 py-3">
          <InputGroup className="h-9 max-w-sm">
            <InputGroupAddon><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
            <InputGroupInput
              placeholder="Search by Receipt No, item code, or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : visibleReceipts.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><PackagePlus /></EmptyMedia>
                <EmptyTitle>No related receipts</EmptyTitle>
                <EmptyDescription>
                  {search.trim()
                    ? "No eligible lines match your search."
                    : "This Current Account has no eligible Purchase Receipt / Outside Process Receive Receipt lines to import."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className={cn(th, COL.checkbox)} />
                    <TableHead className={cn(th, COL.expand)} />
                    <TableHead className={cn(th, COL.receiptNo)}>Receipt No</TableHead>
                    <TableHead className={cn(th, COL.date)}>Receipt Date</TableHead>
                    <TableHead className={cn(th, COL.type)}>Receipt Type</TableHead>
                    <TableHead className={cn(th, COL.code)}>Item Code</TableHead>
                    <TableHead className={cn(th, COL.name)}>Item Name</TableHead>
                    <TableHead className={cn(th, COL.colour)}>Colour</TableHead>
                    <TableHead className={cn(th, COL.qty, "text-right")}>Received Qty</TableHead>
                    <TableHead className={cn(th, COL.qty, "text-right")}>Available Qty</TableHead>
                    <TableHead className={cn(th, COL.unit)}>Unit</TableHead>
                    <TableHead className={cn(th, COL.price, "text-right")}>Price</TableHead>
                    {resolvableExtraFields.map((f) => (
                      <TableHead key={`${f.source}:${f.key}`} className={cn(th, "min-w-[130px]")}>{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReceipts.map((r) => {
                    const state = receiptSelectionState(r);
                    const isCollapsed = collapsed.has(r.id);
                    return (
                      <Fragment key={r.id}>
                        <TableRow className="cursor-pointer bg-muted/25 hover:bg-muted/35" onClick={() => toggleReceipt(r)}>
                          <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                              onCheckedChange={() => toggleReceipt(r)}
                              aria-label={`Select all lines in ${r.receiptNo}`}
                            />
                          </TableCell>
                          <TableCell className="py-2" onClick={(e) => { e.stopPropagation(); toggleCollapsed(r.id); }}>
                            <button
                              type="button"
                              className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={isCollapsed ? `Expand ${r.receiptNo}` : `Collapse ${r.receiptNo}`}
                            >
                              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="py-2 text-[13px] font-semibold">{r.receiptNo}</TableCell>
                          <TableCell className="py-2 text-[13px] text-muted-foreground">{fmtDate(r.receiptDate)}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className="font-normal">{r.label}</Badge>
                          </TableCell>
                          <TableCell className="py-2" />
                          <TableCell className="py-2" />
                          <TableCell className="py-2" />
                          <TableCell className="py-2" />
                          <TableCell className="py-2" />
                          <TableCell className="py-2" />
                          <TableCell className="py-2" />
                          {resolvableExtraFields.map((f) => (
                            <TableCell key={`${f.source}:${f.key}`} className="py-2 text-[13px] text-muted-foreground">
                              {f.source === "purchase-receipt" ? formatCell((r as any)[camelKey(f.key)]) : null}
                            </TableCell>
                          ))}
                        </TableRow>
                        {!isCollapsed && r.lines.map((l) => (
                          <TableRow key={`line-${l.purchaseReceiptItemId}`} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleLine(l.purchaseReceiptItemId)}>
                            <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(l.purchaseReceiptItemId)}
                                onCheckedChange={() => toggleLine(l.purchaseReceiptItemId)}
                                aria-label={`Select line ${l.code}`}
                              />
                            </TableCell>
                            <TableCell className="py-2" />
                            <TableCell className="py-2" />
                            <TableCell className="py-2" />
                            <TableCell className="py-2" />
                            <TableCell className="py-2 text-[13px]">
                              <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{l.code}</span>
                            </TableCell>
                            <TableCell className="py-2 text-[13px]">{l.name}</TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{colorLabel(l.colorCardId)}</TableCell>
                            <TableCell className="py-2 text-right text-[13px] font-mono">{fmtQty(l.receivedQty)}</TableCell>
                            <TableCell className="py-2 text-right text-[13px] font-mono font-semibold">
                              {fmtQty(l.availableQty)}
                              {l.baseUnitId != null && l.unitId !== l.baseUnitId && (
                                <div className="text-[11px] font-normal text-muted-foreground">{fmtQty(l.availableBaseQty)} {l.baseUnitCode}</div>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{unitLabel(l.unitId)}</TableCell>
                            <TableCell className="py-2 text-right text-[13px] font-mono">{fmtPrice(l.unitPrice)}</TableCell>
                            {resolvableExtraFields.map((f) => (
                              <TableCell key={`${f.source}:${f.key}`} className="py-2 text-[13px] text-muted-foreground">
                                {f.source === "purchase-receipt-item" ? formatCell((l as any)[camelKey(f.key)]) : null}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between">
          <span className="text-[12px] text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount} line${selectedCount === 1 ? "" : "s"} selected` : "No lines selected"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={confirm} disabled={selectedCount === 0}>
              <PackagePlus className="h-3.5 w-3.5 mr-2" />Import Selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <WorklistDesignModal
        open={wl.designOpen}
        onOpenChange={wl.setDesignOpen}
        worklists={wl.worklists}
        activeWorklistId={wl.activeWorklistId}
        primaryScope="related-receipt-import"
        gridLabel="the Import Related Receipt list"
        onSave={async (next) => { await wl.saveWorklists(next); }}
      />
    </Dialog>
  );
}
