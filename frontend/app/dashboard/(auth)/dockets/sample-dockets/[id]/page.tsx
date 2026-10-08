"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { docketApi } from "@/lib/docket-api";
import { toast } from "sonner";
import {
  ArrowLeft, RotateCcw, Lock, Share2, CheckCircle2, XCircle,
  AlertTriangle, Circle, Clock, Loader2, Download, Eye, Upload, Copy, ExternalLink, CalendarIcon
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  incomplete: { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Incomplete" },
  in_progress: { cls: "bg-blue-100 text-blue-700 border-blue-200", label: "In Progress" },
  complete: { cls: "bg-green-100 text-green-700 border-green-200", label: "Complete" },
  approved: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Approved" },
  locked: { cls: "bg-slate-100 text-slate-700 border-slate-200", label: "Locked" },
};

const ITEM_STATUS_ICON: Record<string, React.ReactNode> = {
  missing: <Circle className="h-4 w-4 text-gray-400" />,
  uploaded: <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-white" /></div>,
  in_review: <Clock className="h-4 w-4 text-amber-500" />,
  approved: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  rejected: <AlertTriangle className="h-4 w-4 text-red-500" />,
  expired: <XCircle className="h-4 w-4 text-gray-500" />,
};

function completenessColor(pct: number) {
  if (pct === 100) return "bg-green-500";
  if (pct >= 70) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

const FILE_TYPES = ["pdf", "jpg", "png", "xlsx", "docx", "dwg"];

export default function SampleDocketDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [docket, setDocket] = useState<any>(null);
  useWorkspaceRecordLabel(docket?.title || undefined);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [locking, setLocking] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadItemId, setUploadItemId] = useState<string>("");
  const [uploadForm, setUploadForm] = useState({ fileUrl: "", fileName: "", fileType: "pdf", fileSizeMb: "", versionNotes: "" });
  const [uploading, setUploading] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [actionItemId, setActionItemId] = useState<string>("");
  const [actionForm, setActionForm] = useState({ comments: "", reason: "" });
  const [actioning, setActioning] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareForm, setShareForm] = useState({ sharedWith: "", accessType: "view", watermark: false, password: "" });
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState<Date | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d: any = await docketApi.get(id);
      setDocket(d);
    } catch (e: any) {
      toast.error(e.message || "Failed to load docket");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try { await docketApi.recalculate(id); toast.success("Recalculated"); load(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setRecalculating(false); }
  };

  const handleLock = async () => {
    setLocking(true);
    try { await docketApi.updateStatus(id, { status: "locked", notes: "Locked by user" }); toast.success("Locked"); load(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setLocking(false); }
  };

  const openUpload = (itemId: string) => { setUploadItemId(itemId); setUploadForm({ fileUrl: "", fileName: "", fileType: "pdf", fileSizeMb: "", versionNotes: "" }); setUploadOpen(true); };

  const handleUpload = async () => {
    if (!uploadForm.fileUrl.trim()) { toast.error("File URL is required"); return; }
    if (!uploadForm.fileName.trim()) { toast.error("File name is required"); return; }
    setUploading(true);
    try {
      await docketApi.documents.upload(uploadItemId, { fileUrl: uploadForm.fileUrl.trim(), fileName: uploadForm.fileName.trim(), fileType: uploadForm.fileType, fileSizeMb: uploadForm.fileSizeMb ? Number(uploadForm.fileSizeMb) : undefined, versionNotes: uploadForm.versionNotes || undefined });
      toast.success("Uploaded"); setUploadOpen(false); load();
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const openAction = (itemId: string, type: "approve" | "reject") => { setActionItemId(itemId); setActionType(type); setActionForm({ comments: "", reason: "" }); setActionOpen(true); };

  const handleAction = async () => {
    setActioning(true);
    try {
      if (actionType === "approve") { await docketApi.items.approve(actionItemId, { comments: actionForm.comments || undefined }); toast.success("Approved"); }
      else {
        if (!actionForm.reason.trim()) { toast.error("Rejection reason is required"); setActioning(false); return; }
        await docketApi.items.reject(actionItemId, { reason: actionForm.reason.trim(), comments: actionForm.comments || undefined }); toast.success("Rejected");
      }
      setActionOpen(false); load();
    } catch (e: any) { toast.error(e.message || "Action failed"); }
    finally { setActioning(false); }
  };

  const handleShare = async () => {
    if (!shareForm.sharedWith.trim()) { toast.error("Buyer email is required"); return; }
    setSharing(true);
    try {
      const result: any = await docketApi.sharing.createLink(id, { title: `Shared Docket — ${docket?.docketNumber}`, sharedWith: shareForm.sharedWith.trim(), accessType: shareForm.accessType, expiresInDays: shareExpiresAt ? Math.max(1, Math.ceil((shareExpiresAt.getTime() - Date.now()) / 86400000)) : 30, watermark: shareForm.watermark, password: shareForm.password || undefined });
      setShareLink(result?.token ? `${window.location.origin}/shared/${result.token}` : "");
      toast.success("Share link created");
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSharing(false); }
  };

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!docket) return <div className="p-6 text-muted-foreground">Docket not found.<Button variant="outline" size="sm" className="mt-4 ml-2" onClick={() => router.back()}>Back</Button></div>;

  const comp = Number(docket.completeness ?? 0);
  const items = docket.items ?? [];
  const totalRequired = items.filter((i: any) => i.isRequired).length;
  const totalDone = items.filter((i: any) => i.isRequired && i.status === 'approved').length;
  const statusInfo = STATUS_BADGE[docket.status] ?? { cls: "bg-gray-100 text-gray-700", label: docket.status };
  const grouped: Record<string, any[]> = {};
  for (const item of items) {
    const cat = item.documentTypeCard?.category ?? "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-muted-foreground">{docket.docketNumber}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.cls}`}>{statusInfo.label}</span>
            </div>
            <h1 className="text-xl font-semibold mt-0.5">{docket.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculating}>
            {recalculating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}Recalculate
          </Button>
          {docket.status !== "locked" && comp === 100 && (
            <Button variant="outline" size="sm" onClick={handleLock} disabled={locking}>
              {locking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Lock className="h-4 w-4 mr-1" />}Lock
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setShareLink(""); setShareExpiresAt(undefined); setShareOpen(true); }}>
            <Share2 className="h-4 w-4 mr-1" />Share
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Completeness</span>
          <span className="text-2xl font-bold">{comp}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${completenessColor(comp)}`} style={{ width: `${comp}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">{totalDone} of {totalRequired} required items approved</p>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="rounded-lg border">
            <div className="px-4 py-2 bg-muted/40 border-b rounded-t-lg">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category.replace("_", " ")}</span>
            </div>
            <div className="divide-y">
              {catItems.map((item: any) => {
                const latestDoc = item.latestDocument ?? item.documents?.[0];
                const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'approved';
                return (
                  <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="shrink-0">{ITEM_STATUS_ICON[item.status] ?? <Circle className="h-4 w-4 text-gray-400" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{item.title ?? item.documentTypeCard?.name}</span>
                        {item.isRequired && <span className="text-xs text-muted-foreground">(required)</span>}
                        {latestDoc && <span className="text-xs text-muted-foreground">v{latestDoc.version}</span>}
                      </div>
                      {item.dueDate && <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>Due: {new Date(item.dueDate).toLocaleDateString()}{isOverdue && " — OVERDUE"}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.status === 'missing' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openUpload(item.id)}><Upload className="h-3.5 w-3.5 mr-1" />Upload</Button>}
                      {(item.status === 'uploaded' || item.status === 'in_review') && (
                        <>
                          {latestDoc && <Button size="sm" variant="ghost" className="h-7 text-xs" asChild><a href={latestDoc.fileUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-3.5 w-3.5 mr-1" />View</a></Button>}
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => openAction(item.id, "approve")}>Approve</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50" onClick={() => openAction(item.id, "reject")}>Reject</Button>
                        </>
                      )}
                      {item.status === 'approved' && latestDoc && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" asChild><a href={latestDoc.fileUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-3.5 w-3.5 mr-1" />View</a></Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" asChild><a href={latestDoc.fileUrl} download><Download className="h-3.5 w-3.5 mr-1" />Download</a></Button>
                        </>
                      )}
                      {item.status === 'rejected' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openUpload(item.id)}><Upload className="h-3.5 w-3.5 mr-1" />Re-upload</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm rounded-lg border">No document items found.</div>}
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload Document</DialogTitle><DialogDescription>Provide the file details.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>File URL <span className="text-destructive">*</span></Label><Input placeholder="https://..." value={uploadForm.fileUrl} onChange={(e) => setUploadForm((p) => ({ ...p, fileUrl: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>File Name <span className="text-destructive">*</span></Label><Input placeholder="document.pdf" value={uploadForm.fileName} onChange={(e) => setUploadForm((p) => ({ ...p, fileName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>File Type</Label><Select value={uploadForm.fileType} onValueChange={(v) => setUploadForm((p) => ({ ...p, fileType: v }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className="w-full">{FILE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Size (MB)</Label><Input type="number" min={0} step={0.1} placeholder="2.5" value={uploadForm.fileSizeMb} onChange={(e) => setUploadForm((p) => ({ ...p, fileSizeMb: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Version Notes</Label><Textarea rows={2} value={uploadForm.versionNotes} onChange={(e) => setUploadForm((p) => ({ ...p, versionNotes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading}>{uploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{actionType === "approve" ? "Approve Document" : "Reject Document"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {actionType === "reject" && <div className="space-y-1.5"><Label>Reason <span className="text-destructive">*</span></Label><Input value={actionForm.reason} onChange={(e) => setActionForm((p) => ({ ...p, reason: e.target.value }))} /></div>}
            <div className="space-y-1.5"><Label>Comments</Label><Textarea rows={3} value={actionForm.comments} onChange={(e) => setActionForm((p) => ({ ...p, comments: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionOpen(false)} disabled={actioning}>Cancel</Button>
            <Button onClick={handleAction} disabled={actioning} className={actionType === "reject" ? "bg-red-600 hover:bg-red-700" : ""}>{actioning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{actionType === "approve" ? "Approve" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Share Docket</DialogTitle></DialogHeader>
          {shareLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Share link created:</p>
              <div className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                <span className="text-xs font-mono flex-1 truncate">{shareLink}</span>
                <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Copied!"); }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Buyer Email <span className="text-destructive">*</span></Label><Input type="email" placeholder="buyer@company.com" value={shareForm.sharedWith} onChange={(e) => setShareForm((p) => ({ ...p, sharedWith: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Access Type</Label><Select value={shareForm.accessType} onValueChange={(v) => setShareForm((p) => ({ ...p, accessType: v }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent className="w-full"><SelectItem value="view">View Only</SelectItem><SelectItem value="download">View + Download</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5">
                  <Label>Expires</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {shareExpiresAt ? format(shareExpiresAt, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={shareExpiresAt} onSelect={setShareExpiresAt} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Password (optional)</Label><Input type="password" value={shareForm.password} onChange={(e) => setShareForm((p) => ({ ...p, password: e.target.value }))} /></div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2"><Label className="text-sm">Add Watermark</Label><Switch checked={shareForm.watermark} onCheckedChange={(v) => setShareForm((p) => ({ ...p, watermark: v }))} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>Close</Button>
            {!shareLink && <Button onClick={handleShare} disabled={sharing}>{sharing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create Link</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
