"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { RefreshCw, History } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  revision: 'bg-amber-100 text-amber-700',
};

export default function SampleHistoryReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [styleCards, setStyleCards] = useState<any[]>([]);
  const [styleCardId, setStyleCardId] = useState('');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => { plmApi.styleCards.list({ limit: '200' }).then((r: any) => setStyleCards(r?.data ?? [])); }, []);

  const load = async () => {
    setLoading(true);
    try { const q: any = { from, to }; if (styleCardId) q.styleCardId = styleCardId; const r: any = await plmApi.reports.sampleHistory(q); setData(Array.isArray(r) ? r : []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to, styleCardId]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-purple-500" />
          <div><h1 className="text-lg font-semibold">Sample History Report</h1><p className="text-xs text-muted-foreground">Full status history for samples</p></div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={styleCardId || '__all__'} onValueChange={(v) => setStyleCardId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-48 h-9"><SelectValue placeholder="All styles" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All Styles</SelectItem>{styleCards.map((s) => <SelectItem key={s.id} value={s.id}>{s.styleNumber} — {s.title}</SelectItem>)}</SelectContent>
          </Select>
          <DatePicker value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
          <span className="text-muted-foreground text-sm">to</span>
          <DatePicker value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Sample #</TableHead><TableHead>Style</TableHead><TableHead>Status</TableHead><TableHead>Previous</TableHead><TableHead>Changed By</TableHead><TableHead>Date</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No history data for this period</TableCell></TableRow>
            ) : data.map((h, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{h.sampleNumber || '—'}</TableCell>
                <TableCell>{h.styleTitle || '—'}</TableCell>
                <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[h.status] || 'bg-gray-100 text-gray-700'}`}>{h.status}</span></TableCell>
                <TableCell>{h.previousStatus ? <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[h.previousStatus] || 'bg-gray-100 text-gray-700'}`}>{h.previousStatus}</span> : '—'}</TableCell>
                <TableCell>{h.changedBy || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{h.note || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
