"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { docketApi, docketReportApi } from "@/lib/docket-api";
import { toast } from "sonner";
import { CheckSquare, RefreshCw, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

function daysDiff(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

export default function ApprovalQueuePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [actionForm, setActionForm] = useState({ comments: "", reason: "" });
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await docketReportApi.approvalStatus({ status: "pending" });
      const list = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
      setItems(list);
    } catch {
      // Fallback: load all dockets and find pending items
      try {
        const dockets: any = await docketApi.list({ limit: 100 });
        const docketList = Array.isArray(dockets) ? dockets : (dockets?.data ?? []);
        const pendingItems: any[] = [];
        for (const d of docketList) {
          for (const item of (d.items ?? [])) {
            if (item.status === 'uploaded' || item.status === 'in_review') {
              pendingItems.push({ ...item, docket: d, docketNumber: d.docketNumber, entityType: d.entityType });
            }
          }
        }
        setItems(pendingItems);
      } catch {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount = items.length;
  const overdueCount = items.filter((i) => i.uploadedAt && daysDiff(i.uploadedAt) > 3).length;
  const approved = 0; // Requires date-based tracking from API
  const rejected = 0;

  const openSheet = (item: any, type: "approve" | "reject") => {
    setSelectedItem(item);
    setActionType(type);
    setActionForm({ comments: "", reason: "" });
    setSheetOpen(true);
  };

  const handleAction = async () => {
    if (!selectedItem) return;
    setActioning(true);
    try {
      if (actionType === "approve") {
        await docketApi.items.approve(selectedItem.id, { comments: actionForm.comments || undefined });
        toast.success("Document approved");
      } else {
        if (!actionForm.reason.trim()) { toast.error("Rejection reason is required"); setActioning(false); return; }
        await docketApi.items.reject(selectedItem.id, { reason: actionForm.reason.trim(), comments: actionForm.comments || undefined });
        toast.success("Document rejected");
      }
      setSheetOpen(false);
      setItems((prev) => prev.filter((i) => i.id !== selectedItem.id));
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActioning(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Approval Queue</h1>
            <p className="text-xs text-muted-foreground">Documents waiting for review and approval</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950" },
          { label: "Approved Today", value: approved, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950" },
          { label: "Rejected", value: rejected, icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950" },
          { label: "Overdue (>3d)", value: overdueCount, icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50 dark:bg-red-950" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
              <div>
                {loading ? <Skeleton className="h-6 w-10 mb-0.5" /> : <p className="text-xl font-bold">{s.value}</p>}
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Docket #</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Days Waiting</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No items pending approval.</TableCell></TableRow>
            ) : (
              items.map((item) => {
                const days = item.uploadedAt ? daysDiff(item.uploadedAt) : 0;
                const rowCls = days > 3 ? "bg-red-50/50 dark:bg-red-950/20" : days >= 1 ? "bg-amber-50/50 dark:bg-amber-950/20" : "";
                return (
                  <TableRow key={item.id} className={rowCls}>
                    <TableCell className="font-medium text-sm">{item.title ?? item.documentTypeCard?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{item.documentTypeCard?.code ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.docketNumber ?? item.docket?.docketNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{(item.entityType ?? item.docket?.entityType ?? "").replace("_", " ")}</TableCell>
                    <TableCell className="text-xs">{item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${days > 3 ? 'text-red-600' : days >= 1 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {days}d
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => openSheet(item, "approve")}>Approve</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50" onClick={() => openSheet(item, "reject")}>Reject</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Action Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{actionType === "approve" ? "Approve Document" : "Reject Document"}</SheetTitle>
          </SheetHeader>
          {selectedItem && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                <p className="font-medium text-sm">{selectedItem.title ?? selectedItem.documentTypeCard?.name}</p>
                <p className="text-xs text-muted-foreground">Docket: {selectedItem.docketNumber ?? selectedItem.docket?.docketNumber}</p>
                <p className="text-xs text-muted-foreground capitalize">Entity: {(selectedItem.entityType ?? selectedItem.docket?.entityType ?? "").replace("_", " ")}</p>
              </div>
              {actionType === "reject" && (
                <div>
                  <Label>Reason <span className="text-destructive">*</span></Label>
                  <Input placeholder="Reason for rejection" value={actionForm.reason} onChange={(e) => setActionForm((p) => ({ ...p, reason: e.target.value }))} />
                </div>
              )}
              <div>
                <Label>Comments</Label>
                <Textarea placeholder="Optional comments..." rows={4} value={actionForm.comments} onChange={(e) => setActionForm((p) => ({ ...p, comments: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)} disabled={actioning}>Cancel</Button>
                <Button
                  className={`flex-1 ${actionType === "reject" ? "bg-red-600 hover:bg-red-700" : ""}`}
                  onClick={handleAction}
                  disabled={actioning}
                >
                  {actioning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {actionType === "approve" ? "Approve" : "Reject"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
