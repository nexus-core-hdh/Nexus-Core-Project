"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docketReportApi } from "@/lib/docket-api";
import { CalendarX, RefreshCw, AlertCircle } from "lucide-react";

function daysUntilExpiry(expiryDate: string) {
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiryColor(days: number) {
  if (days < 0) return "text-red-700 bg-red-100";
  if (days < 7) return "text-red-600 bg-red-50";
  if (days <= 30) return "text-amber-600 bg-amber-50";
  return "text-green-600 bg-green-50";
}

function rowBg(days: number) {
  if (days < 7) return "bg-red-50/50 dark:bg-red-950/20";
  if (days <= 30) return "bg-amber-50/50 dark:bg-amber-950/20";
  return "";
}

export default function DocumentExpiryPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [docTypeCode, setDocTypeCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketReportApi.documentExpiry({
        expiresInDays: expiresInDays || undefined,
        documentTypeCode: docTypeCode || undefined,
      });
      const list = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
      setData(list);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [expiresInDays, docTypeCode]);

  useEffect(() => { load(); }, [load]);

  const expiredCount = data.filter((i) => {
    const d = i.expiryDate ?? i.latestDocument?.expiryDate;
    return d && daysUntilExpiry(d) < 0;
  }).length;
  const expiringSoon = data.filter((i) => {
    const d = i.expiryDate ?? i.latestDocument?.expiryDate;
    return d && daysUntilExpiry(d) >= 0 && daysUntilExpiry(d) < 7;
  }).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarX className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Document Expiry Report</h1>
            <p className="text-xs text-muted-foreground">Documents and certificates expiring soon</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 max-w-xs">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-700">{expiredCount}</p><p className="text-xs text-muted-foreground">Already Expired</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-600">{expiringSoon}</p><p className="text-xs text-muted-foreground">Expiring &lt;7 Days</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Expiring Within (days)</Label>
          <Input className="h-9 w-28" type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Document Type Code</Label>
          <Input className="h-9 w-36 font-mono uppercase" placeholder="e.g. OEKOTEX" value={docTypeCode} onChange={(e) => setDocTypeCode(e.target.value.toUpperCase())} />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-28">Docket #</TableHead>
              <TableHead className="w-32">Expiry Date</TableHead>
              <TableHead className="w-32">Days Until Expiry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No expiring documents found within the selected period.</TableCell></TableRow>
            ) : (
              data.map((item, idx) => {
                const expiryDate = item.expiryDate ?? item.latestDocument?.expiryDate;
                const days = expiryDate ? daysUntilExpiry(expiryDate) : null;
                return (
                  <TableRow key={item.id ?? idx} className={days != null ? rowBg(days) : ""}>
                    <TableCell className="font-medium text-sm">{item.title ?? item.documentTypeCard?.name ?? item.fileName ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{item.documentTypeCard?.code ?? item.documentTypeCode ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.docketNumber ?? item.docket?.docketNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs">{expiryDate ? new Date(expiryDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      {days != null ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${expiryColor(days)}`}>
                          {days < 0 ? `${Math.abs(days)}d expired` : days === 0 ? "Today" : `${days}d`}
                        </span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
