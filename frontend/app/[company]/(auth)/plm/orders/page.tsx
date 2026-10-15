"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "@/components/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, ExternalLink } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
const STATUSES = ['pending', 'confirmed', 'cutting', 'sewing', 'finishing', 'qc', 'shipped', 'delivered', 'cancelled'];
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700', confirmed: 'bg-blue-100 text-blue-700',
  cutting: 'bg-amber-100 text-amber-700', sewing: 'bg-orange-100 text-orange-700',
  finishing: 'bg-purple-100 text-purple-700', qc: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-teal-100 text-teal-700', delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const empty = { styleCardId: '', buyerName: '', quantity: 0, totalCost: '', deliveryDate: '', notes: '' };

export default function OrdersPage() {
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);
  const [styleCards, setStyleCards] = useState<any[]>([]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const q: any = { page: String(page), limit: '20' };
      if (search) q.search = search;
      if (status) q.status = status;
      const r: any = await plmApi.orders.list(q);
      setData(r?.data ?? []);
      setMeta(r?.meta ?? { total: 0, page: 1, pages: 1 });
    } finally { setLoading(false); }
  }, [search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { plmApi.styleCards.list({ limit: '200' }).then((r: any) => setStyleCards(r?.data ?? [])); }, []);

  const save = async () => {
    if (!form.styleCardId || !form.buyerName) return toast.error("Style card and buyer required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.orders.create({ ...form, branchId: user?.branchId, createdBy: user?.id, quantity: parseInt(form.quantity), totalCost: form.totalCost ? parseFloat(form.totalCost) : undefined });
      toast.success("Order created");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold">PLM Orders</h1><p className="text-xs text-muted-foreground">{meta.total} orders total</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Order</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" /></div>
        <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : v)}><SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Order #</TableHead><TableHead>Style</TableHead><TableHead>Buyer</TableHead><TableHead>Qty</TableHead><TableHead>Delivery</TableHead><TableHead>Total Cost</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No orders yet</TableCell></TableRow>
            ) : data.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
                <TableCell>{row.styleCard?.title || '—'}</TableCell>
                <TableCell>{row.buyerName || '—'}</TableCell>
                <TableCell>{row.quantity?.toLocaleString()}</TableCell>
                <TableCell>{row.deliveryDate ? new Date(row.deliveryDate).toLocaleDateString() : '—'}</TableCell>
                <TableCell>{row.totalCost ? `${row.currency || ''} ${parseFloat(row.totalCost).toLocaleString()}` : '—'}</TableCell>
                <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-700'}`}>{row.status}</span></TableCell>
                <TableCell><Link href={`/plm/orders/${row.id}`}><ExternalLink className="h-4 w-4 text-muted-foreground" /></Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => load(meta.page - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.pages} onClick={() => load(meta.page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New PLM Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Style Card *</Label>
              <Select value={form.styleCardId} onValueChange={(v) => setForm((p: any) => ({ ...p, styleCardId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
                <SelectContent>{styleCards.map((s) => <SelectItem key={s.id} value={s.id}>{s.styleNumber} — {s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Buyer Name *</Label><Input value={form.buyerName} onChange={(e) => setForm((p: any) => ({ ...p, buyerName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Quantity *</Label><Input type="number" value={form.quantity} onChange={(e) => setForm((p: any) => ({ ...p, quantity: e.target.value }))} /></div>
              <div><Label>Total Cost</Label><Input type="number" step="0.01" value={form.totalCost} onChange={(e) => setForm((p: any) => ({ ...p, totalCost: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Delivery Date</Label><DatePicker value={form.deliveryDate} onChange={(e) => setForm((p: any) => ({ ...p, deliveryDate: e.target.value }))} />
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
