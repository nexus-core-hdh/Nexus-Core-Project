"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";


const STATUSES = ['pending', 'confirmed', 'cutting', 'sewing', 'finishing', 'qc', 'shipped', 'delivered', 'cancelled'];
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700', confirmed: 'bg-blue-100 text-blue-700',
  cutting: 'bg-amber-100 text-amber-700', sewing: 'bg-orange-100 text-orange-700',
  finishing: 'bg-purple-100 text-purple-700', qc: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-teal-100 text-teal-700', delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const FLOW = ['pending', 'confirmed', 'cutting', 'sewing', 'finishing', 'qc', 'shipped', 'delivered'];

export default function OrderDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusDialog, setStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await plmApi.orders.get(id); setOrder(r); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const changeStatus = async () => {
    if (!newStatus) return;
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.orders.changeStatus(id, { status: newStatus, note: statusNote, changedBy: user?.id });
      toast.success("Status updated");
      setStatusDialog(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (!order) return <div className="p-6 text-muted-foreground">Order not found.</div>;

  const currentIdx = FLOW.indexOf(order.status);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{order.orderNumber}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'}`}>{order.status}</span>
          </div>
          <p className="text-xs text-muted-foreground">{order.styleCard?.title} · Buyer: {order.buyerName}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setNewStatus(order.status); setStatusNote(''); setStatusDialog(true); }}>Change Status</Button>
      </div>

      {/* Status pipeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {FLOW.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <div className={`px-2.5 py-1 rounded text-xs font-medium ${i <= currentIdx ? STATUS_COLORS[s] || 'bg-gray-100 text-gray-700' : 'bg-muted text-muted-foreground'}`}>{s}</div>
            {i < FLOW.length - 1 && <div className={`w-4 h-0.5 ${i < currentIdx ? 'bg-green-400' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Quantity</p><p className="text-2xl font-bold">{order.quantity?.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Cost</p><p className="text-2xl font-bold">{order.totalCost ? `${order.currency || ''} ${parseFloat(order.totalCost).toLocaleString()}` : '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Buyer</p><p className="text-lg font-bold">{order.buyerName || '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Delivery Date</p><p className="text-lg font-bold">{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : '—'}</p></CardContent></Card>
      </div>

      {order.notes && (
        <Card><CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{order.notes}</p></CardContent></Card>
      )}

      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Order Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Note</Label><Textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusDialog(false)}>Cancel</Button><Button onClick={changeStatus} disabled={saving}>Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
