"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/app-link";
import { useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { Plus, Search, ExternalLink } from "lucide-react";

const fmt4 = (n: any) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export default function CostingSheetsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: any = { page: '1', limit: '100' };
      if (search) q.search = search;
      const r: any = await plmApi.costingSheets.list(q);
      setSheets(Array.isArray(r) ? r : (r?.data ?? []));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Costing Sheets</h1>
          <p className="text-xs text-muted-foreground">{sheets.length} costing sheets total</p>
        </div>
        <Button size="sm" onClick={() => router.push("/plm/costing-sheets/new")}>
          <Plus className="h-4 w-4 mr-1" />New Costing
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search costing sheets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Costing No</TableHead>
              <TableHead>Style</TableHead>
              <TableHead>Style Name</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Quoted Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : sheets.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No costing sheets yet</TableCell></TableRow>
            ) : sheets.map((row) => (
              <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30">
                <TableCell className="font-mono text-xs">
                  <Link href={`/plm/costing-sheets/${row.id}`} className="hover:underline flex items-center gap-1">
                    {row.costingNo}<ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                </TableCell>
                <TableCell>{row.styleCode || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.styleName || "—"}</TableCell>
                <TableCell>{row.accountName || "—"}</TableCell>
                <TableCell>{row.brand || "—"}</TableCell>
                <TableCell>{row.costingDate ? new Date(row.costingDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="text-right font-mono">{fmt4(row.quotedPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
