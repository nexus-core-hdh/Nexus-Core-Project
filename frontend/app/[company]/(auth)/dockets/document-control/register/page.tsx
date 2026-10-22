"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { docketApi } from "@/lib/docket-api";
import { List, RefreshCw, Search, Eye } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  missing: "bg-gray-100 text-gray-600",
  uploaded: "bg-blue-100 text-blue-700",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-600",
};

export default function DocumentRegisterPage() {
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketApi.list({ limit: 200 });
      const dockets = Array.isArray(res) ? res : (res?.data ?? []);
      const items: any[] = [];
      for (const d of dockets) {
        for (const item of (d.items ?? [])) {
          const latestDoc = item.latestDocument ?? item.documents?.[0];
          items.push({
            ...item,
            docket: d,
            docketNumber: d.docketNumber,
            entityType: d.entityType,
            latestDoc,
          });
        }
      }
      setAllItems(items);
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = allItems.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (entityFilter && item.entityType !== entityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !item.title?.toLowerCase().includes(q) &&
        !item.documentTypeCard?.name?.toLowerCase().includes(q) &&
        !item.docketNumber?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Document Register</h1>
            <p className="text-xs text-muted-foreground">All documents across dockets — {allItems.length} total</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents..." className="pl-8 h-9 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {["missing", "uploaded", "in_review", "approved", "rejected", "expired"].map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityFilter || "__all__"} onValueChange={(v) => setEntityFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Entity Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Entity Types</SelectItem>
            <SelectItem value="style_card">Style Card</SelectItem>
            <SelectItem value="sample_card">Sample Card</SelectItem>
            <SelectItem value="product_card">Product Card</SelectItem>
            <SelectItem value="plm_order">PLM Order</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Docket #</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No documents found.</TableCell></TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-sm">{item.title ?? item.documentTypeCard?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {item.documentTypeCard?.category ? (
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs">{item.documentTypeCard.category}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.docketNumber ?? "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{(item.entityType ?? "").replace("_", " ")}</TableCell>
                  <TableCell className="text-xs">{item.latestDoc ? `v${item.latestDoc.version}` : "—"}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {item.status?.replace("_", " ") ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    {item.latestDoc?.fileUrl && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                        <a href={item.latestDoc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
