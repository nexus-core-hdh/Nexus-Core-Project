"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Plus, Search, ExternalLink, Copy } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  concept: 'bg-slate-100 text-slate-700', design: 'bg-blue-100 text-blue-700',
  sampling: 'bg-purple-100 text-purple-700', approved: 'bg-green-100 text-green-700',
  production: 'bg-emerald-100 text-emerald-700', discontinued: 'bg-red-100 text-red-700',
};
const STATUSES = ['concept', 'design', 'mood-board-review', 'tech-pack', 'sampling', 'sample-review', 'approved', 'production', 'discontinued'];

// "New Style" and row editing used to open a small inline Dialog with a handful of fields
// (Title/Season/Year/Gender/Status/Category/Description) — now that plm/style-cards/[id] is a
// complete Code/Name/In Use + 12-tab detail screen (including full create-mode support), that
// dialog is a redundant, more limited duplicate of it. Both actions now navigate to that screen
// instead, matching how plm/sample-cards' own list page already works.
export default function StyleCardsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const q: any = { page: String(page), limit: '20' };
      if (search) q.search = search;
      if (status) q.status = status;
      const r: any = await plmApi.styleCards.list(q);
      const list = Array.isArray(r) ? r : (r?.data ?? []);
      setData(list);
      setMeta(Array.isArray(r) ? { total: list.length, page: 1, pages: 1 } : (r?.meta ?? { total: list.length, page: 1, pages: 1 }));
    } finally { setLoading(false); }
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  const duplicate = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    try { await plmApi.styleCards.duplicate(id); toast.success("Duplicated"); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Style Cards</h1><p className="text-xs text-muted-foreground">{meta.total} styles total</p></div>
        <Button size="sm" onClick={() => router.push("/dashboard/plm/style-cards/new")}><Plus className="h-4 w-4 mr-1" />New Style</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search styles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" /></div>
        <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : v)}><SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Style #</TableHead><TableHead>Title</TableHead><TableHead>Season</TableHead><TableHead>Gender</TableHead><TableHead>Samples</TableHead><TableHead>Orders</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No style cards yet</TableCell></TableRow>
            ) : data.map((row) => (
              <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30">
                <TableCell className="font-mono text-xs">{row.styleNumber}</TableCell>
                <TableCell className="font-medium"><Link href={`/dashboard/plm/style-cards/${row.id}`} className="hover:underline flex items-center gap-1">{row.title}<ExternalLink className="h-3 w-3 text-muted-foreground" /></Link></TableCell>
                <TableCell>{row.season || '—'}</TableCell>
                <TableCell><span className="capitalize">{row.gender || '—'}</span></TableCell>
                <TableCell>{row._count?.sampleCards ?? 0}</TableCell>
                <TableCell>{row._count?.plmOrders ?? 0}</TableCell>
                <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-700'}`}>{row.status}</span></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => duplicate(row.id, e)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
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
    </div>
  );
}
