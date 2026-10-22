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
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, ExternalLink, Copy } from "lucide-react";

const STATUSES = ['draft', 'active', 'discontinued', 'archived'];

const empty = { styleCardId: '', color: '', colorCode: '', fabric: '', fabricContent: '', description: '', status: 'draft' };

export default function ProductCardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);
  const [styleCards, setStyleCards] = useState<any[]>([]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const q: any = { page: String(page), limit: '20' };
      if (search) q.search = search;
      const r: any = await plmApi.productCards.list(q);
      setData(r?.data ?? []);
      setMeta(r?.meta ?? { total: 0, page: 1, pages: 1 });
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    plmApi.styleCards.list({ limit: '200' }).then((r: any) => setStyleCards(r?.data ?? []));
  }, []);

  const save = async () => {
    if (!form.styleCardId) return toast.error("Style card required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.productCards.create({ ...form, createdBy: user?.id });
      toast.success("Product card created");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const duplicate = async (id: string) => {
    try { const user = getCurrentUser(); await plmApi.productCards.duplicate(id, user?.id ? String(user.id) : undefined); toast.success("Duplicated"); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold">Product Cards</h1><p className="text-xs text-muted-foreground">{meta.total} products total</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Product</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" /></div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Product #</TableHead><TableHead>Style</TableHead><TableHead>Color</TableHead><TableHead>Fabric</TableHead><TableHead>Swatches</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No product cards yet</TableCell></TableRow>
            ) : data.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs">{row.productNumber}</TableCell>
                <TableCell>{row.styleCard?.title || '—'}</TableCell>
                <TableCell>{row.color ? <span className="flex items-center gap-1.5">{row.colorCode && <span className="inline-block w-3 h-3 rounded-full border" style={{ backgroundColor: row.colorCode }} />}{row.color}</span> : '—'}</TableCell>
                <TableCell>{row.fabric || '—'}</TableCell>
                <TableCell>{row._count?.swatches ?? 0}</TableCell>
                <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Link href={`/plm/product-cards/${row.id}`}><ExternalLink className="h-4 w-4 text-muted-foreground" /></Link>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicate(row.id)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
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
          <DialogHeader><DialogTitle>New Product Card</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Style Card *</Label>
              <Select value={form.styleCardId} onValueChange={(v) => setForm((p: any) => ({ ...p, styleCardId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
                <SelectContent>{styleCards.map((s) => <SelectItem key={s.id} value={s.id}>{s.styleNumber} — {s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Color</Label><Input value={form.color} onChange={(e) => setForm((p: any) => ({ ...p, color: e.target.value }))} placeholder="e.g. Navy Blue" /></div>
              <div><Label>Color Code</Label><Input type="color" value={form.colorCode || '#000000'} onChange={(e) => setForm((p: any) => ({ ...p, colorCode: e.target.value }))} /></div>
            </div>
            <div><Label>Fabric</Label><Input value={form.fabric} onChange={(e) => setForm((p: any) => ({ ...p, fabric: e.target.value }))} placeholder="e.g. 100% Cotton" /></div>
            <div><Label>Fabric Content</Label><Input value={form.fabricContent} onChange={(e) => setForm((p: any) => ({ ...p, fabricContent: e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p: any) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
