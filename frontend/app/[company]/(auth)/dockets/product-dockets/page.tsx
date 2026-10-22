"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docketApi } from "@/lib/docket-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, RefreshCw, Package, Search } from "lucide-react";

const ENTITY_TYPE = "product_card";

const STATUS_BADGE: Record<string, string> = {
  incomplete: "bg-yellow-100 text-yellow-700 border-yellow-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  complete: "bg-green-100 text-green-700 border-green-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  locked: "bg-slate-100 text-slate-700 border-slate-200",
};

function completenessColor(pct: number) {
  if (pct === 100) return "bg-green-500";
  if (pct >= 70) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export default function ProductDocketsPage() {
  const router = useRouter();
  const [dockets, setDockets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketApi.list({ entityType: ENTITY_TYPE, limit: 100 });
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setDockets(list);
    } catch {
      setDockets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = dockets.filter((d) => {
    if (filter !== "all" && d.status !== filter) return false;
    if (search && !d.title?.toLowerCase().includes(search.toLowerCase()) && !d.docketNumber?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const total = dockets.length;
  const complete = dockets.filter((d) => Number(d.completeness) === 100).length;
  const incomplete = dockets.filter((d) => Number(d.completeness) < 100 && d.status !== 'locked').length;
  const locked = dockets.filter((d) => d.status === 'locked').length;

  const handleCreate = async () => {
    if (!entityId.trim()) { toast.error("Entity ID is required"); return; }
    setCreating(true);
    try {
      const user = getCurrentUser();
      const payload: any = { entityType: ENTITY_TYPE, entityId: entityId.trim(), title: title.trim() || `Product Docket — ${entityId.trim()}` };
      if (user?.branchId) payload.branchId = user.branchId;
      const created: any = await docketApi.create(payload);
      toast.success("Docket created");
      setCreateOpen(false);
      setEntityId("");
      setTitle("");
      router.push(`/dockets/product-dockets/${created.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create docket");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Product Dockets</h1>
            <p className="text-xs text-muted-foreground">Document dockets for product cards</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New Docket</Button>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap text-sm">
        <div className="flex items-center gap-1.5"><span className="font-semibold">{total}</span><span className="text-muted-foreground">Total</span></div>
        <div className="w-px bg-border" />
        <div className="flex items-center gap-1.5"><span className="font-semibold text-green-600">{complete}</span><span className="text-muted-foreground">Complete</span></div>
        <div className="w-px bg-border" />
        <div className="flex items-center gap-1.5"><span className="font-semibold text-yellow-600">{incomplete}</span><span className="text-muted-foreground">Incomplete</span></div>
        <div className="w-px bg-border" />
        <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-600">{locked}</span><span className="text-muted-foreground">Locked</span></div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search dockets..." className="pl-8 h-9 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {["all", "complete", "incomplete", "in_progress", "locked"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {f === "all" ? "All" : f.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Docket #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-48">Completeness</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Missing</TableHead>
              <TableHead className="w-32">Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No product dockets found.</TableCell></TableRow>
            ) : (
              filtered.map((d) => {
                const comp = Number(d.completeness ?? 0);
                const missing = (d.items ?? []).filter((i: any) => i.status === 'missing' && i.isRequired).length;
                return (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/30"
                    onClick={() => router.push(`/dockets/product-dockets/${d.id}`)}>
                    <TableCell className="font-mono text-xs">{d.docketNumber}</TableCell>
                    <TableCell className="font-medium text-sm">{d.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${completenessColor(comp)}`} style={{ width: `${comp}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">{comp}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[d.status] ?? 'bg-gray-100 text-gray-700'}`}>{d.status}</span>
                    </TableCell>
                    <TableCell>
                      {missing > 0 ? <span className="text-xs font-medium text-red-600">{missing} required</span> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Product Docket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product Card ID <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter product card ID" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
            </div>
            <div>
              <Label>Title</Label>
              <Input placeholder={`Product Docket — ${entityId || 'entity-id'}`} value={title} onChange={(e) => setTitle(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to auto-generate</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>Create Docket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
