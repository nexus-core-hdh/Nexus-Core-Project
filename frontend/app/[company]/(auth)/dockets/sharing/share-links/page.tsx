"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { docketApi } from "@/lib/docket-api";
import { toast } from "sonner";
import { Link2, RefreshCw, Copy, Trash2, Loader2 } from "lucide-react";

function linkStatus(link: any) {
  if (!link.isActive) return { label: "Deactivated", cls: "bg-slate-100 text-slate-600" };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return { label: "Expired", cls: "bg-red-100 text-red-700" };
  return { label: "Active", cls: "bg-green-100 text-green-700" };
}

export default function ShareLinksPage() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all dockets and their share links
      const dockets: any = await docketApi.list({ limit: 200 });
      const docketList = Array.isArray(dockets) ? dockets : (dockets?.data ?? []);
      const allLinks: any[] = [];
      await Promise.allSettled(
        docketList.map(async (d: any) => {
          try {
            const res: any = await docketApi.sharing.listLinks(d.id);
            const linkList = Array.isArray(res) ? res : (res?.data ?? []);
            linkList.forEach((l: any) => allLinks.push({ ...l, docket: d, docketNumber: d.docketNumber }));
          } catch {}
        })
      );
      setLinks(allLinks);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (linkId: string) => {
    try {
      await docketApi.sharing.updateLink(linkId, { isActive: false });
      toast.success("Link deactivated");
      setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, isActive: false } : l));
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const handleDelete = async (linkId: string) => {
    setDeletingId(linkId);
    try {
      await docketApi.sharing.deleteLink(linkId);
      toast.success("Deleted");
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = (link: any) => {
    const url = link.publicUrl ?? (link.token ? `${window.location.origin}/shared/${link.token}` : "");
    if (url) { navigator.clipboard.writeText(url); toast.success("Copied to clipboard"); }
    else toast.error("No shareable URL found");
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Shared Links</h1>
            <p className="text-xs text-muted-foreground">Manage docket share links — {links.length} total</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Docket #</TableHead>
              <TableHead>Shared With</TableHead>
              <TableHead className="w-28">Created</TableHead>
              <TableHead className="w-28">Expires</TableHead>
              <TableHead className="w-24">Access Count</TableHead>
              <TableHead className="w-28">Last Accessed</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : links.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No share links found. Create links from a docket detail page.</TableCell></TableRow>
            ) : (
              links.map((link) => {
                const status = linkStatus(link);
                return (
                  <TableRow key={link.id}>
                    <TableCell className="font-mono text-xs">{link.docketNumber ?? "—"}</TableCell>
                    <TableCell className="text-sm">{link.sharedWith ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{link.createdAt ? new Date(link.createdAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "Never"}</TableCell>
                    <TableCell className="text-sm">{link.accessCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{link.lastAccessedAt ? new Date(link.lastAccessedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>{status.label}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyLink(link)} title="Copy link">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {link.isActive && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => handleDeactivate(link.id)}>
                            Deactivate
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={deletingId === link.id} onClick={() => handleDelete(link.id)}>
                          {deletingId === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
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
