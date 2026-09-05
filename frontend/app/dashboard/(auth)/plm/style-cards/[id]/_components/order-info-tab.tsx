"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");

// Reused wholesale for Sample Card via the optional `sampleCardId` prop — PlmOrder.styleCardId
// was relaxed to nullable and a sibling nullable sampleCardId added (an order belongs to
// exactly one of the two). This tab never edits an order itself, only lists/creates + links out
// to the order's own full-page editor, unchanged either way.
export function OrderInfoTab({ styleCardId, sampleCardId }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = sampleCardId ? await plmApi.sampleCards.getOrders(sampleCardId) : await plmApi.styleCards.getOrders(styleCardId!);
      setOrders(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId, sampleCardId]);

  const openOrderForm = async () => {
    setCreating(true);
    try {
      const created: any = await plmApi.orders.create(sampleCardId ? { sampleCardId, quantity: 0 } : { styleCardId, quantity: 0 });
      router.push(`/dashboard/plm/orders/${created.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

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
