"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { plmApi, legacyErpApi } from "@/lib/nexuscore-api";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");

// Style Card's own path ("+ Create Order") reuses the EXISTING Work Order system end to end —
// no new Order module/table (see work-order.service.ts's HEADER_COLUMNS + migration
// 20260908092625_add_style_card_link_to_work_order: MA_WorkOrder.StyleCardId is the one new,
// genuinely-missing column this needed; everything else — create/update/list, numbering, Style
// lookup, BOM/size/save logic — is the New Work Order screen's own, completely unchanged).
// Sample Card's own path (sampleCardId prop) is untouched: still the pre-existing PlmOrder
// module/screen, since the task only asked for this on Style Card. Exactly one of the two props
// is ever passed by the caller.
export function OrderInfoTab({ styleCardId, sampleCardId }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (sampleCardId) {
        const list = await plmApi.sampleCards.getOrders(sampleCardId);
        setOrders(Array.isArray(list) ? list : []);
      } else {
        const list: any = await legacyErpApi.workOrders.list({ styleCardId });
        setOrders(Array.isArray(list) ? list : []);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId, sampleCardId]);

  // Sample Card path — unchanged: creates a PlmOrder and opens its own full-page editor.
  const openOrderForm = async () => {
    setCreating(true);
    try {
      const created: any = await plmApi.orders.create({ sampleCardId, quantity: 0 });
      router.push(`/dashboard/plm/orders/${created.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  // Style Card path — navigates to the EXISTING New Work Order screen with this Style Card
  // pre-selected (work-orders/page.tsx's own initialStyleCardId effect). No record is created
  // here — the Work Order itself is only created once the user actually Saves there, so
  // Cancel-without-Save leaves nothing behind, same as opening New Work Order normally.
  const createWorkOrder = () => {
    navigateOrOpenTab(router, `/dashboard/legacy-erp/work-orders?mode=create&styleCardId=${styleCardId}`, { title: "New Work Order" });
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

  if (sampleCardId) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <Button size="sm" onClick={openOrderForm} disabled={creating}>{creating ? "Creating..." : "Order Form"}</Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order No</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Delivery Date</TableHead>
                <TableHead>Shipment Date</TableHead>
                <TableHead>Order Group</TableHead>
                <TableHead>Customer Order No</TableHead>
                <TableHead>Sample Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orders.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No orders yet</TableCell></TableRow>
              ) : orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                  <TableCell>{fmtDate(o.orderDate)}</TableCell>
                  <TableCell>{fmtDate(o.deliveryDate)}</TableCell>
                  <TableCell>{fmtDate(o.shipmentDate)}</TableCell>
                  <TableCell>{o.orderGroup || "—"}</TableCell>
                  <TableCell>{o.customerOrderNo || "—"}</TableCell>
                  <TableCell>{o.sampleType?.name || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{o.quantity}</TableCell>
                  <TableCell><Link href={`/dashboard/plm/orders/${o.id}`}><ExternalLink className="h-4 w-4 text-muted-foreground" /></Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={createWorkOrder}>+ Create Order</Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Work Order No</TableHead>
              <TableHead>Work Order Date</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead>Shipment Date</TableHead>
              <TableHead>Customer Order No</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!orders.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No orders yet</TableCell></TableRow>
            ) : orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.workOrderNo}</TableCell>
                <TableCell>{fmtDate(o.workOrderDate)}</TableCell>
                <TableCell>{fmtDate(o.deliveryDate)}</TableCell>
                <TableCell>{fmtDate(o.shipmentDate)}</TableCell>
                <TableCell>{o.customerOrderNo || "—"}</TableCell>
                <TableCell className="text-right font-mono">{o.quantity ?? 0}</TableCell>
                <TableCell>
                  <button type="button" onClick={() => navigateOrOpenTab(router, `/dashboard/legacy-erp/work-orders?id=${o.id}&mode=edit`, { title: o.workOrderNo })}>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
