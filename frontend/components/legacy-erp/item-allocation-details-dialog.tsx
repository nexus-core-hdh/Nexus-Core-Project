"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { getReceiptTypeLabel } from "@/lib/legacy-erp/receipt-types";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { toast } from "sonner";
import { ClipboardList, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Allocation Details ("View Allocations") for ONE receipt line: its real header plus EVERY live
// IM_ItemAllocation row of it, to whichever Work Order owns each (item-allocation.service.ts's
// getReceiptItemAllocations). Delete uses the same existing allocation delete flow as the main grid —
// a reservation is soft-deleted, never a stock/receipt change. Totals shown here come from the server.

interface AllocationRow {
  id: number; quantity: number; allocationDate: string | null; isReturned: number | null;
  workOrderItemId: number; itemOrderNo: number | null; workOrderId: number | null; workOrderNo: string | null;
  styleCode: string | null; styleName: string | null; customerCode: string | null; customerName: string | null;
  colorCode: string | null; colorName: string | null; unit: string | null; createdBy: string | null;
}
interface Details {
  id: number; receiptId: number; receiptNo: string | null; documentNo: string | null; receiptDate: string | null;
  receiptType: number | null; subcontractor: string | null; inventoryCode: string | null; inventoryName: string | null;
  colorCode: string | null; colorName: string | null; unit: string | null; warehouse: string | null;
  receivedQuantity: number; returnedQuantity: number; totalAllocatedQuantity: number; globalAvailableQuantity: number;
  allocations: AllocationRow[];
}

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");

export function ItemAllocationDetailsDialog({
  receiptItemId, currentWorkOrderId, onClose, onChanged,
}: {
  receiptItemId: number | null;
  currentWorkOrderId: number | null;
  onClose: () => void;
  /** Called after a delete so the main receipt grid re-reads the server's aggregates. */
  onChanged?: () => void;
}) {
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  const fmt = (n: number) => round(n, "quantity").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [data, setData] = useState<Details | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (receiptItemId == null) return;
    setLoading(true);
    try { setData((await legacyErpApi.itemAllocations.receiptItemAllocations(receiptItemId)) as Details); }
    catch (e: any) { toast.error(e.message || "Failed to load allocations"); }
    finally { setLoading(false); }
  }, [receiptItemId]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const remove = async (a: AllocationRow) => {
    if (!window.confirm(`Remove the ${fmt(a.quantity)} ${a.unit || ""} allocation to ${a.workOrderNo || "this order"}? This does not affect Stock On Hand or the receipt itself.`)) return;
    setBusyId(a.id);
    try {
      await legacyErpApi.itemAllocations.remove(a.id);
      toast.success("Allocation removed.");
      await load();
      onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed to remove allocation"); }
    finally { setBusyId(null); }
  };

  const th = "h-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80";
  const lbl = "text-[11.5px] text-muted-foreground";
  const val = "text-[12.5px] font-medium";

  return (
    <Dialog open={receiptItemId != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] w-[min(94vw,1100px)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><ClipboardList className="h-4 w-4 text-primary" />Allocation Details</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && !data ? <Skeleton className="h-40 w-full" /> : data && (
            <>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_300px]">
                <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 rounded-md border bg-muted/20 p-3">
                  <span className={lbl}>Receipt No</span><span className={val}>{data.receiptNo || "—"}</span>
                  <span className={lbl}>Document No</span><span className={val}>{data.documentNo || "—"}</span>
                  <span className={lbl}>Receipt Date</span><span className={val}>{fmtDate(data.receiptDate)}</span>
                  <span className={lbl}>Receipt Type</span><span className={val}>{getReceiptTypeLabel(data.receiptType, data.subcontractor)}</span>
                  <span className={lbl}>Warehouse</span><span className={val}>{data.warehouse || "—"}</span>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 rounded-md border bg-muted/20 p-3">
                  <span className={lbl}>Inventory Code</span><span className={val}>{data.inventoryCode || "—"}</span>
                  <span className={lbl}>Inventory Name</span><span className={val}>{data.inventoryName || "—"}</span>
                  <span className={lbl}>Color</span><span className={val}>{data.colorCode || data.colorName || "Common"}</span>
                  <span className={lbl}>Unit</span><span className={val}>{data.unit || "—"}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-md border bg-muted/20 p-3 font-mono text-[12.5px]">
                  <span className={lbl}>Received Quantity</span><span className="text-right">{fmt(data.receivedQuantity)}</span>
                  <span className={lbl}>Returned Quantity</span><span className="text-right">{fmt(data.returnedQuantity)}</span>
                  <span className={lbl}>Total Allocated (All Orders)</span><span className="text-right font-semibold text-blue-600">{fmt(data.totalAllocatedQuantity)}</span>
                  <span className={lbl}>Global Available</span><span className="text-right font-semibold text-emerald-600">{fmt(data.globalAvailableQuantity)}</span>
                </div>
              </div>

              <p className="text-[12px] font-semibold">Allocations to Work Orders</p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className={`${th} w-8`}>#</TableHead>
                      <TableHead className={th}>Work Order No</TableHead>
                      <TableHead className={th}>Line</TableHead>
                      <TableHead className={th}>Style No</TableHead>
                      <TableHead className={th}>Style Name</TableHead>
                      <TableHead className={th}>Customer</TableHead>
                      <TableHead className={th}>Color</TableHead>
                      <TableHead className={th}>Allocation Date</TableHead>
                      <TableHead className={`${th} text-right`}>Allocated Qty</TableHead>
                      <TableHead className={th}>Unit</TableHead>
                      <TableHead className={th}>Created By</TableHead>
                      <TableHead className={th}>Status</TableHead>
                      <TableHead className={`${th} w-10`} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.allocations.length ? (
                      <TableRow><TableCell colSpan={13} className="py-6 text-center text-[12.5px] text-muted-foreground">This receipt line has no active allocations.</TableCell></TableRow>
                    ) : data.allocations.map((a, i) => (
                      <TableRow key={a.id} className={cn(a.workOrderId === currentWorkOrderId && "bg-primary/5")}>
                        <TableCell className="py-1.5 text-[12.5px]">{i + 1}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px] font-medium">{a.workOrderNo || "—"}{a.workOrderId === currentWorkOrderId && <span className="ml-1 text-[10px] text-primary">(this order)</span>}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.itemOrderNo != null ? `Line ${a.itemOrderNo}` : "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.styleCode || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.styleName || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.customerName || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.colorCode || a.colorName || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{fmtDate(a.allocationDate)}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-[12.5px]">{fmt(a.quantity)}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.unit || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.createdBy || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[12.5px]">{a.isReturned ? "Returned" : "Active"}</TableCell>
                        <TableCell className="py-1.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" disabled={busyId === a.id} title="Remove allocation" onClick={() => remove(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t px-4 py-2"><Button variant="outline" size="sm" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
