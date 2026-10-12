"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { docketApi } from "@/lib/docket-api";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Plus, Loader2, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

const emptyForm = { docketId: "", reviewerEmail: "", reviewerName: "", reviewerCompany: "", message: "" };

export default function ExternalReviewPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [dockets, setDockets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [revs, docs]: any = await Promise.allSettled([
        docketApi.sharing.listExternalReviews(),
        docketApi.list({ limit: 200 }),
      ]);
      const revList = revs.status === "fulfilled" ? (Array.isArray(revs.value) ? revs.value : (revs.value?.data ?? [])) : [];
      const docList = docs.status === "fulfilled" ? (Array.isArray(docs.value) ? docs.value : (docs.value?.data ?? [])) : [];
      setReviews(revList);
      setDockets(docList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (field: keyof typeof emptyForm, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const handleSend = async () => {
    if (!form.docketId) { toast.error("Select a docket"); return; }
    if (!form.reviewerEmail.trim()) { toast.error("Reviewer email is required"); return; }
    if (!form.reviewerName.trim()) { toast.error("Reviewer name is required"); return; }
    setSending(true);
    try {
      await docketApi.sharing.createExternalReview(form.docketId, {
        reviewerEmail: form.reviewerEmail.trim(),
        reviewerName: form.reviewerName.trim(),
        reviewerCompany: form.reviewerCompany || undefined,
        message: form.message || undefined,
        expiresInDays: expiresAt ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : 30,
      });
      toast.success("External review request sent");
      setDialogOpen(false);
      setForm(emptyForm);
      setExpiresAt(undefined);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">External Reviews</h1>
            <p className="text-xs text-muted-foreground">Send dockets to external reviewers (buyers, auditors)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Send Review</Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewer</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Docket #</TableHead>
              <TableHead className="w-28">Sent Date</TableHead>
              <TableHead className="w-28">Expires</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : reviews.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No external reviews sent yet.</TableCell></TableRow>
            ) : (
              reviews.map((r) => {
                const isExpired = r.expiresAt && new Date(r.expiresAt) < new Date();
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{r.reviewerName}</p>
                        <p className="text-xs text-muted-foreground">{r.reviewerEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.reviewerCompany ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.docket?.docketNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {isExpired ? "Expired" : "Active"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Send Review Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send External Review Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Docket <span className="text-destructive">*</span></Label>
              <Select value={form.docketId || "__none__"} onValueChange={(v) => set("docketId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a docket" /></SelectTrigger>
                <SelectContent className="w-full">
                  {dockets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.docketNumber} — {d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Reviewer Name <span className="text-destructive">*</span></Label>
                <Input placeholder="John Smith" value={form.reviewerName} onChange={(e) => set("reviewerName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input placeholder="Buyer Co." value={form.reviewerCompany} onChange={(e) => set("reviewerCompany", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reviewer Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="reviewer@buyer.com" value={form.reviewerEmail} onChange={(e) => set("reviewerEmail", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea placeholder="Please review the attached docket and provide feedback..." rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expiresAt ? format(expiresAt, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={expiresAt} onSelect={setExpiresAt} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending}>{sending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Send Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
