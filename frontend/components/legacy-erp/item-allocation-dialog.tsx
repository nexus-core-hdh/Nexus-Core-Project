"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { getReceiptTypeLabel } from "@/lib/legacy-erp/receipt-types";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { toast } from "sonner";
import { ClipboardList, Eye, FileText, RefreshCw, Save, Trash2 } from "lucide-react";
import { ItemAllocationDetailsDialog } from "./item-allocation-details-dialog";

// Received Allocation — reservation-only linkage between an already-received Purchase Receipt /
// Outside Process Receive Receipt line and ONE Work Order line, backed by the real, pre-existing
// IM_ItemAllocation/IM_ItemAllocationHistory tables (see item-allocation.service.ts's own top
// comment). This dialog NEVER touches stock: it only ever creates/updates/soft-deletes the
// allocation record itself. Every quantity shown per row is server-computed — this dialog never
// re-derives them:
//   Total Allocated              = every live allocation of that receipt line, to ANY Work Order
//   Allocated to This Work Order = only those owned by the currently opened Work Order
//   Available To Allocate        = received − returned − Total Allocated (global remaining; another
//                                  order's allocation reduces it, this order's own is shown separately)
// "View Allocations" opens the per-receipt-line breakdown (which Work Order owns what).
//
// One receipt line -> at most one allocation row for THIS (Work Order, Inventory) scope, same
// "update in place, never duplicate" rule the backend itself enforces.
interface ReceiptRow {
  id: number; // IM_ReceiptItem.RecId — the real inventoryReceiptItemId
  receiptId: number; // IM_Receipt.RecId — what the Inventory Receipt screen opens by
  receiptDate: string | null;
  receiptType: number | null;
  subcontractor: string | null;
  receiptNo: string | null;
  documentNo: string | null; // IM_Receipt.DocumentNo, shown as-is (null -> "—")
  warehouse: string | null;
  currentAccountCode: string | null;
  currentAccountName: string | null;
  colorCode: string | null;
  colorName: string | null;
  isCommonColor: boolean;
  unit: string | null;
  receivedQuantity: number;
  returnedQuantity: number;
  totalAllocatedQuantity: number;
  currentWorkOrderAllocatedQuantity: number;
  availableQuantity: number;
}

interface AllocationRow {
  id: number;
  inventoryReceiptItemId: number;
  quantity: number;
  grossQuantity: number | null;
}

export interface AllocationDialogContext {
  workOrderId: number;
  workOrderNo: string | null;
  inventoryId: number;
  inventoryCode: string | null;
  inventoryName: string | null;
  colorCardId: string | null;
  colorCode: string | null;
  colorName: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AllocationDialogContext | null;
  /** Called after any real create/update/delete so the caller can refresh its own Planning grid. */
  onChanged?: () => void;
}

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");

export function ItemAllocationDialog({ open, onOpenChange, context, onChanged }: Props) {
  const router = useRouter();
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [detailsFor, setDetailsFor] = useState<number | null>(null);

  const load = async () => {
    if (!context) return;
    setLoading(true);
    setError(null);
    try {
      const [rec, alloc] = await Promise.all([
        legacyErpApi.itemAllocations.availableReceipts(context.workOrderId, context.inventoryId, context.colorCardId),
        legacyErpApi.itemAllocations.list(context.workOrderId, context.inventoryId, context.colorCardId),
      ]);
      const receiptRows: ReceiptRow[] = Array.isArray(rec) ? rec : [];
      const allocationRows: AllocationRow[] = Array.isArray(alloc) ? alloc : [];
      setReceipts(receiptRows);
      setAllocations(allocationRows);
      const nextEdits: Record<number, string> = {};
      for (const r of receiptRows) {
        const own = allocationRows.find((a) => a.inventoryReceiptItemId === r.id);
        nextEdits[r.id] = own ? String(own.quantity) : "";
      }
      setEdits(nextEdits);
    } catch (e: any) {
      const msg = e.message || "Failed to load available receipts";
      setError(msg);
      toast.error(msg);
      setReceipts([]);
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context?.workOrderId, context?.inventoryId, context?.colorCardId]);

  const ownAllocationFor = (receiptItemId: number) => allocations.find((a) => a.inventoryReceiptItemId === receiptItemId) ?? null;

  // Max quantity this Work Order can hold on this line: the global remaining PLUS what this order
  // already holds (updating in place backs its own current amount out first). Display hint only — the
  // backend (saveAllocation) is authoritative and rejects any over-reservation.
  const roomFor = (row: ReceiptRow) => row.availableQuantity + (ownAllocationFor(row.id)?.quantity ?? 0);

  const save = async (row: ReceiptRow) => {
    if (!context) return;
    const raw = edits[row.id] ?? "";
    const qty = Number(raw);
    if (!raw.trim() || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Allocation Qty must be a number greater than zero.");
      return;
    }
    const existing = ownAllocationFor(row.id);
    setSavingId(row.id);
    try {
      await legacyErpApi.itemAllocations.save({
        id: existing?.id,
        inventoryReceiptItemId: row.id,
        workOrderId: context.workOrderId,
        inventoryId: context.inventoryId,
        colorCardId: context.colorCardId,
        quantity: qty,
      });
      toast.success(existing ? "Allocation updated." : "Allocation created.");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to save allocation");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (row: ReceiptRow) => {
    const existing = ownAllocationFor(row.id);
    if (!existing) return;
    if (!window.confirm("Remove this allocation? This does not affect Stock On Hand or the receipt itself.")) return;
    setDeletingId(row.id);
    try {
      await legacyErpApi.itemAllocations.remove(existing.id);
      toast.success("Allocation removed.");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove allocation");
    } finally {
      setDeletingId(null);
    }
  };

  // Opens the REAL receipt (IM_Receipt.RecId) in the existing Inventory Receipts screen, view mode.
  const openReceipt = (row: ReceiptRow) => {
    onOpenChange(false);
    navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${row.receiptId}&mode=view&receiptType=${row.receiptType ?? 2}`);
  };

  const itemLabel = context ? [context.inventoryCode, context.inventoryName].filter(Boolean).join(" — ") : "";
  const colorLabel = context ? (context.colorCode || context.colorName) : null;
  const num = (n: number) => round(n, "quantity").toLocaleString();
  const th = "h-9 whitespace-normal align-bottom px-2 text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground/80";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(80vh,640px)] w-[min(96vw,1400px)] max-w-none sm:max-w-none flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-2.5">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <ClipboardList className="h-4 w-4 text-primary" />
              Received Allocation
            </DialogTitle>
            {context && (
              <p className="text-[11px] text-muted-foreground">
                Work Order <span className="font-medium text-foreground">{context.workOrderNo}</span>
                {" · "}
                <span className="font-medium text-foreground">{itemLabel || "this item"}</span>
                {colorLabel ? <> {" · "}Color <span className="font-medium text-foreground">{colorLabel}</span></> : null}
              </p>
            )}
          </DialogHeader>

          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <p className="text-[11px] text-muted-foreground">
              Allocation is a reservation only — it never changes Stock On Hand, receipt quantity, or creates a movement.
            </p>
            <Button variant="outline" size="sm" className="ml-auto h-8 w-8 p-0" onClick={() => load()} title="Refresh" disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="space-y-1.5 p-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center py-10 text-[13px] text-destructive">{error}</div>
            ) : receipts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
                <p className="text-[13px] font-medium">No receipts available to allocate.</p>
                <p className="text-[11px] text-muted-foreground">
                  No approved Purchase Receipt or Outside Process Receive Receipt with quantity left to allocate was found for this item (and colour) in this company.
                </p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className={th}>Receipt No</TableHead>
                    <TableHead className={th}>Document No</TableHead>
                    <TableHead className={th}>Receipt Date</TableHead>
                    <TableHead className={th}>Type</TableHead>
                    <TableHead className={th}>Warehouse / Account</TableHead>
                    <TableHead className={th}>Color</TableHead>
                    <TableHead className={th}>Unit</TableHead>
                    <TableHead className={`${th} text-right`}>Received</TableHead>
                    <TableHead className={`${th} text-right`}>Returned</TableHead>
                    <TableHead className={`${th} text-right`} title="Allocated from this receipt line to ALL Work Orders">Total Allocated</TableHead>
                    <TableHead className={`${th} text-right`} title="Allocated from this receipt line to the currently opened Work Order only">Allocated to This W/O</TableHead>
                    <TableHead className={`${th} text-right`} title="Received − Returned − Total Allocated">Available To Allocate</TableHead>
                    <TableHead className={`${th} w-28 text-right`}>Allocation Qty</TableHead>
                    <TableHead className={`${th} sticky right-0 z-10 w-32 bg-muted`} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((row) => {
                    const existing = ownAllocationFor(row.id);
                    const room = roomFor(row);
                    const busy = savingId === row.id || deletingId === row.id;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="py-1.5 text-[13px]">
                          <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{row.receiptNo || "—"}</span>
                        </TableCell>
                        <TableCell className="py-1.5 text-[13px]">{row.documentNo || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[13px]">{fmtDate(row.receiptDate)}</TableCell>
                        <TableCell className="max-w-[150px] whitespace-normal px-2 py-1.5 text-[13px] leading-tight">{getReceiptTypeLabel(row.receiptType, row.subcontractor)}</TableCell>
                        <TableCell className="max-w-[130px] whitespace-normal px-2 py-1.5 text-[13px] leading-tight text-muted-foreground">
                          {row.warehouse || (row.currentAccountName ? `${row.currentAccountCode ? row.currentAccountCode + " — " : ""}${row.currentAccountName}` : "—")}
                        </TableCell>
                        <TableCell className="py-1.5 text-[13px] text-muted-foreground">{row.isCommonColor ? "Common" : (row.colorCode || row.colorName || "—")}</TableCell>
                        <TableCell className="py-1.5 text-[13px] text-muted-foreground">{row.unit || "—"}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-[13px]">{num(row.receivedQuantity)}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-[13px]">{row.returnedQuantity ? num(row.returnedQuantity) : "—"}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-[13px] text-blue-600">{num(row.totalAllocatedQuantity)}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-[13px] text-emerald-600">{num(row.currentWorkOrderAllocatedQuantity)}</TableCell>
                        <TableCell
                          className="py-1.5 text-right font-mono text-[13px] font-semibold"
                          title={`Max you can enter on this line: ${num(room)} (includes this order's own current allocation)`}
                        >{num(row.availableQuantity)}</TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            type="number" min={0} step="any"
                            className="ml-auto h-7 w-20 text-right text-xs"
                            value={edits[row.id] ?? ""}
                            onChange={(e) => setEdits((p) => ({ ...p, [row.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && save(row)}
                            disabled={busy}
                          />
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 bg-background py-1.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => save(row)} disabled={busy} title="Save allocation">
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setDetailsFor(row.id)} title="View Allocations (which Work Orders hold this receipt)">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => openReceipt(row)} title="Open Receipt">
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(row)} disabled={busy || !existing} title={existing ? "Remove this Work Order's allocation" : "This Work Order has no allocation on this line"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {receipts.length > 0 && (
            <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <span>
                {allocations.length > 0
                  ? <Badge variant="secondary" className="h-5 text-[11px] font-normal">{allocations.length} allocation{allocations.length === 1 ? "" : "s"} on this Work Order</Badge>
                  : "No allocation yet on this Work Order."}
              </span>
              <span>{receipts.length} receipt{receipts.length === 1 ? "" : "s"} found.</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ItemAllocationDetailsDialog
        receiptItemId={detailsFor}
        currentWorkOrderId={context?.workOrderId ?? null}
        onClose={() => setDetailsFor(null)}
        onChanged={() => { void load(); onChanged?.(); }}
      />
    </>
  );
}
