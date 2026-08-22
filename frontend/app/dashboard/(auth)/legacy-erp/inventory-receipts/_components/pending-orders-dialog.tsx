"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { ClipboardList, PackageSearch } from "lucide-react";
import type { ImportedPendingLine } from "./inventory-receipt-line-grid";

// Purchase Receipt -> Current Account -> right-click -> Pending Orders. Reuses the same
// Dialog/Table/Checkbox/Button/Skeleton/Empty primitives every other Legacy ERP screen already
// uses (see worklist-design-modal.tsx for the same draft-then-confirm pattern) — no new visual
// system. PendingQty/grouping/exclusion (fully-received POs, other accounts) is already done
// server-side by purchase-order.service.ts's listPending(); this only additionally hides lines
// already sitting in the CURRENT unsaved draft (alreadyImportedIds), since the server can't see
// those until the receipt is actually saved.
//
// Selection is per-LINE (`selected` holds orderReceiptItemIds), not per-PO — each PO's header
// row is a "select all of this PO's lines" toggle (tri-state via its own checked/indeterminate
// visual), not a separate unit of selection. This is what makes all three import shapes the
// spec asks for possible from the exact same UI/state: click a PO header to pull the whole
// order, click individual line checkboxes across one or several POs to pull only those.

interface PendingLine {
  orderReceiptItemId: number; inventoryId: number; code: string; name: string;
  explanation: string | null; unitId: number | null; unitPrice: number | null; colorCardId: string | null;
  orderQty: number; receivedQty: number; pendingQty: number;
  // Base Unit + Unit Conversion (spec Section 9) — additive display fields from
  // purchase-order.service.ts's listPending(). `pendingQty`/`unitId` above stay expressed in the
  // PO line's own unit (this dialog copies both straight onto the new receipt line unchanged —
  // see confirmImport below), these are purely for showing the Base Unit figure alongside it.
  baseUnitId: number | null; baseUnitCode: string | null; pendingBaseQty: number;
  // Variant breakdown (IM_OrderReceiptItemVariant rows for this PO line, if any) — copied
  // verbatim onto new IM_ReceiptItemVariant rows on import. See purchase-order.service.ts's
  // listPending() and inventory-receipt-line-grid.tsx's createPendingVariants.
  variants: { id: number; inventoryVariantId: number; quantity: number; netUnitPrice: number | null }[];
}
interface PendingPo {
  id: number; receiptNo: string; receiptDate: string; documentNo: string | null;
  lines: PendingLine[];
}

const fmtQty = (n: number) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtPrice = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAccountId: number | null;
  alreadyImportedIds: Set<number>;
  onConfirm: (lines: ImportedPendingLine[]) => void;
}

export function PendingOrdersDialog({ open, onOpenChange, currentAccountId, alreadyImportedIds, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<PendingPo[]>([]);
  // Line-level selection — orderReceiptItemId, not orderReceiptId. See file header comment.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Unit/Colour — the SAME generic lookups Purchase Order's own line grid and this receipt's
  // own line grid already use (legacy-master-lookup.service.ts's "unit" key, plmApi.colors),
  // fetched here only to resolve a label for display in this dialog — no new lookup mechanism.
  const [unitOptions, setUnitOptions] = useState<any[]>([]);
  const [colorOptions, setColorOptions] = useState<any[]>([]);

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
    setLoading(true);
    legacyErpApi.purchaseOrders.listPending(currentAccountId)
      .then((r: any) => setPos(Array.isArray(r) ? r : []))
      .catch((e: any) => { toast.error(e.message || "Failed to load pending orders"); setPos([]); })
      .finally(() => setLoading(false));
  }, [open, currentAccountId]);

  // Lines already sitting in the current (unsaved) draft can't be excluded server-side yet —
  // filtered out here so reopening this dialog never re-offers them. A PO left with zero
  // remaining lines after this filter is dropped entirely, same rule as a fully-received PO.
  const visiblePos = useMemo(
    () => pos
      .map((po) => ({ ...po, lines: po.lines.filter((l) => !alreadyImportedIds.has(l.orderReceiptItemId)) }))
      .filter((po) => po.lines.length > 0),
    [pos, alreadyImportedIds],
  );

  const toggleLine = (lineId: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
    return next;
  });

  const poSelectionState = (po: PendingPo): "all" | "some" | "none" => {
    const count = po.lines.filter((l) => selected.has(l.orderReceiptItemId)).length;
    if (count === 0) return "none";
    return count === po.lines.length ? "all" : "some";
  };

  const togglePo = (po: PendingPo) => setSelected((prev) => {
    const next = new Set(prev);
    const allSelected = po.lines.every((l) => next.has(l.orderReceiptItemId));
    po.lines.forEach((l) => (allSelected ? next.delete(l.orderReceiptItemId) : next.add(l.orderReceiptItemId)));
    return next;
  });

  const selectedCount = selected.size;

  const confirm = () => {
    const lines: ImportedPendingLine[] = visiblePos
      .flatMap((po) => po.lines
        .filter((l) => selected.has(l.orderReceiptItemId))
        .map((l): ImportedPendingLine => ({
          inventoryId: l.inventoryId, code: l.code, name: l.name, quantity: l.pendingQty,
          unitId: l.unitId, unit: "", unitPrice: l.unitPrice,
          orderReceiptItemId: l.orderReceiptItemId, poReceiptNo: po.receiptNo,
          colorCardId: l.colorCardId,
          variants: l.variants.map((v) => ({
            inventoryVariantId: v.inventoryVariantId, quantity: v.quantity, netUnitPrice: v.netUnitPrice,
            orderReceiptItemVariantId: v.id,
          })),
        })));
    if (!lines.length) return;
    onConfirm(lines);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>Pending Orders</DialogTitle>
          <DialogDescription>Select a whole Purchase Order, or individual lines across one or more Purchase Orders, to import into this receipt.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : visiblePos.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><PackageSearch /></EmptyMedia>
                <EmptyTitle>No pending orders</EmptyTitle>
                <EmptyDescription>This Current Account has no Purchase Orders with outstanding quantity.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-9 w-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
                    <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Purchase Order</TableHead>
                    <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Date</TableHead>
                    <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Item</TableHead>
                    <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Colour</TableHead>
                    <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Description</TableHead>
                    <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Order Qty</TableHead>
                    <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Pending Qty</TableHead>
                    <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Unit</TableHead>
                    <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePos.map((po) => {
                    const state = poSelectionState(po);
                    return (
                      <Fragment key={po.id}>
                        <TableRow className="cursor-pointer bg-muted/20 hover:bg-muted/30" onClick={() => togglePo(po)}>
                          <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                              onCheckedChange={() => togglePo(po)}
                              aria-label={`Select all lines in ${po.receiptNo}`}
                            />
                          </TableCell>
                          <TableCell colSpan={9} className="py-2 text-[13px] font-semibold">
                            {po.receiptNo}
                            {po.documentNo && <span className="ml-2 font-normal text-muted-foreground">({po.documentNo})</span>}
                            <span className="ml-3 font-normal text-muted-foreground">{fmtDate(po.receiptDate)}</span>
                          </TableCell>
                        </TableRow>
                        {po.lines.map((l) => (
                          <TableRow key={`line-${l.orderReceiptItemId}`} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleLine(l.orderReceiptItemId)}>
                            <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(l.orderReceiptItemId)}
                                onCheckedChange={() => toggleLine(l.orderReceiptItemId)}
                                aria-label={`Select line ${l.code}`}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{po.receiptNo}</TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{fmtDate(po.receiptDate)}</TableCell>
                            <TableCell className="py-2 text-[13px]">
                              <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{l.code}</span> {l.name}
                            </TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{colorLabel(l.colorCardId)}</TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{l.explanation || <span>—</span>}</TableCell>
                            <TableCell className="py-2 text-right text-[13px] font-mono">{fmtQty(l.orderQty)}</TableCell>
                            <TableCell className="py-2 text-right text-[13px] font-mono font-semibold">
                              {fmtQty(l.pendingQty)}
                              {l.baseUnitId != null && l.unitId !== l.baseUnitId && (
                                <div className="text-[11px] font-normal text-muted-foreground">{fmtQty(l.pendingBaseQty)} {l.baseUnitCode}</div>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-[13px] text-muted-foreground">{unitLabel(l.unitId)}</TableCell>
                            <TableCell className="py-2 text-right text-[13px] font-mono">{fmtPrice(l.unitPrice)}</TableCell>
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
              <ClipboardList className="h-3.5 w-3.5 mr-2" />Import Selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
