"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { getAuthToken } from "@/lib/auth";
import { toast } from "sonner";
import { FilePlus2, ImagePlus, Download, Eye, Maximize2, Trash2, FileText } from "lucide-react";

const DOC_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "txt"];
const DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt";
const DOC_MESSAGE = "Only PDF, Word, Excel and Text files are allowed.";
const PIC_ACCEPT = "image/*";
const PIC_MESSAGE = "Only image files are allowed.";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
// Browsers have no built-in renderer for these — they'll download rather than preview them
// regardless of Content-Disposition. Not solved with a third-party viewer (Google Docs/Office
// Online) since that would mean sending account attachments to an external service with no
// consent or data-handling agreement in place — not appropriate for business records by default.
// Just tell the user why, instead of a silent/confusing download.
const NON_PREVIEWABLE_EXTENSIONS = ["doc", "docx", "xls", "xlsx"];

const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();
const isImageFile = (file: File) => file.type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extOf(file.name));

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// The content endpoint requires the Bearer token, so a plain <a href> or window.open(url)
// can't be used — browser navigation can't attach custom headers. Fetch as a blob instead.
async function fetchAttachmentBlob(accountId: number, attId: number) {
  const token = getAuthToken();
  const res = await fetch(legacyErpApi.accounts.attachmentContentUrl(accountId, attId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load file");
  return res.blob();
}

// Files picked before the Current Account has been saved (no accountId yet). Kept purely
// client-side — viewable/downloadable immediately via local blob URLs — then flushed to the
// real API the moment accountId becomes available (right after the header Save succeeds).
interface StagedFile {
  localId: string;
  file: File;
  previewUrl: string;
}

interface Props {
  accountId: number | null;
  readOnly?: boolean;
}

export function AttachmentsTab({ accountId, readOnly = false }: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [pictures, setPictures] = useState<any[]>([]);
  const [stagedDocs, setStagedDocs] = useState<StagedFile[]>([]);
  const [stagedPics, setStagedPics] = useState<StagedFile[]>([]);
  const [loading, setLoading] = useState(!!accountId);
  const [uploading, setUploading] = useState(false);
  const [previewPic, setPreviewPic] = useState<{ src: string; name: string } | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const picInputRef = useRef<HTMLInputElement>(null);
  const flushing = useRef(false);

  const load = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [docs, pics]: any = await Promise.all([
        legacyErpApi.accounts.listAttachments(accountId, "document"),
        legacyErpApi.accounts.listAttachments(accountId, "picture"),
      ]);
      setDocuments(Array.isArray(docs) ? docs : []);
      setPictures(Array.isArray(pics) ? pics : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [accountId]);

  // Once the account gets a real id (header just saved), upload whatever was staged locally.
  useEffect(() => {
    if (!accountId || flushing.current) return;
    if (!stagedDocs.length && !stagedPics.length) return;
    flushing.current = true;
    (async () => {
      const toFlush: [StagedFile, "document" | "picture"][] = [
        ...stagedDocs.map((s): [StagedFile, "document" | "picture"] => [s, "document"]),
        ...stagedPics.map((s): [StagedFile, "document" | "picture"] => [s, "picture"]),
      ];
      let ok = 0;
      for (const [staged, kind] of toFlush) {
        try {
          const dataUrl = await readAsDataUrl(staged.file);
          await legacyErpApi.accounts.uploadAttachment(accountId, { kind, fileName: staged.file.name, dataUrl });
          URL.revokeObjectURL(staged.previewUrl);
          ok++;
        } catch (e: any) {
          toast.error(`${staged.file.name}: ${e.message || "Upload failed"}`);
        }
      }
      setStagedDocs([]);
      setStagedPics([]);
      if (ok > 0) toast.success(`${ok} staged file${ok > 1 ? "s" : ""} saved`);
      flushing.current = false;
      load();
    })();
  }, [accountId]);

  const uploadFiles = async (fileList: FileList | null, kind: "document" | "picture") => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      const valid = kind === "document" ? DOC_EXTENSIONS.includes(extOf(file.name)) : isImageFile(file);
      if (!valid) {
        toast.error(`${file.name}: ${kind === "document" ? DOC_MESSAGE : PIC_MESSAGE}`);
        continue;
      }

      if (!accountId) {
        // Stage locally — viewable immediately, persisted once the account is saved.
        const staged: StagedFile = { localId: `${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) };
        if (kind === "document") setStagedDocs((p) => [staged, ...p]);
        else setStagedPics((p) => [staged, ...p]);
        successCount++;
        continue;
      }

      try {
        const dataUrl = await readAsDataUrl(file);
        await legacyErpApi.accounts.uploadAttachment(accountId, { kind, fileName: file.name, dataUrl });
        successCount++;
      } catch (e: any) {
        // Show the real backend error, not a generic message.
        toast.error(`${file.name}: ${e.message || "Upload failed"}`);
      }
    }

    // Success is only ever shown for files that actually persisted (or staged) — never
    // unconditionally after the batch, which was the previous bug.
    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? "s" : ""} uploaded`);
      if (accountId) load();
    }
    setUploading(false);
    if (docInputRef.current) docInputRef.current.value = "";
    if (picInputRef.current) picInputRef.current.value = "";
  };

  const remove = async (attId: number) => {
    if (!accountId) return;
    try {
      await legacyErpApi.accounts.removeAttachment(accountId, attId);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const removeStaged = (localId: string, kind: "document" | "picture") => {
    const list = kind === "document" ? stagedDocs : stagedPics;
    const found = list.find((s) => s.localId === localId);
    if (found) URL.revokeObjectURL(found.previewUrl);
    if (kind === "document") setStagedDocs((p) => p.filter((s) => s.localId !== localId));
    else setStagedPics((p) => p.filter((s) => s.localId !== localId));
  };

  const download = async (attId: number, fileName: string) => {
    try {
      const blob = await fetchAttachmentBlob(accountId!, attId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const downloadStaged = (staged: StagedFile) => {
    const url = URL.createObjectURL(staged.file);
    const a = document.createElement("a");
    a.href = url; a.download = staged.file.name; a.click();
    URL.revokeObjectURL(url);
  };

  // Real browser navigation (not a blob fetch) so the browser gets the actual server response
  // — Content-Type + `Content-Disposition: inline` — and decides how to render it natively.
  // A fetch()-as-blob loses those headers entirely (blob: URLs carry none), which is why Word/
  // Excel files were forcing a download regardless of what the server sent. The endpoint can't
  // require the normal Authorization header for a plain window.open() navigation, so it also
  // accepts the token as a query param (server-side change, see account.controller.ts).
  const viewDocument = async (attId: number, fileName: string) => {
    if (NON_PREVIEWABLE_EXTENSIONS.includes(extOf(fileName))) {
      // Word/Excel have no browser-native renderer — route through Microsoft's Office Online
      // Viewer, which needs a URL it can fetch itself. Uses a short-lived (5 min), purpose-
      // scoped token minted just for this, not the user's real session token.
      try {
        const { token }: any = await legacyErpApi.accounts.getAttachmentViewToken(accountId!, attId);
        const fileUrl = `${legacyErpApi.accounts.attachmentContentUrl(accountId!, attId)}?token=${encodeURIComponent(token)}`;
        window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`, "_blank");
      } catch (e: any) {
        toast.error(e.message || "Couldn't open preview");
      }
      return;
    }
    const token = getAuthToken();
    const url = `${legacyErpApi.accounts.attachmentContentUrl(accountId!, attId)}?token=${encodeURIComponent(token || "")}`;
    window.open(url, "_blank");
  };

  const viewFullSize = async (attId: number) => {
    try {
      const blob = await fetchAttachmentBlob(accountId!, attId);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const previewPicture = (name: string, thumbnailBase64: string | undefined, fileType: string) => {
    if (!thumbnailBase64) return;
    setPreviewPic({ src: `data:image/${fileType.toLowerCase()};base64,${thumbnailBase64}`, name });
  };

  if (loading) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      {!accountId && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Files picked here are staged locally and uploaded automatically once you Save the current account.
        </div>
      )}

      <div className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <h3 className="text-sm font-semibold">Documents</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => docInputRef.current?.click()}>
              <FilePlus2 className="h-3.5 w-3.5 mr-2" />Add Document
            </Button>
          )}
          <input ref={docInputRef} type="file" accept={DOC_ACCEPT} multiple hidden onChange={(e) => uploadFiles(e.target.files, "document")} />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">File Name</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">File Type</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Upload Date</TableHead>
              <TableHead className="h-10 w-32 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 && stagedDocs.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                      <EmptyTitle className="text-sm">No documents</EmptyTitle>
                      <EmptyDescription>{readOnly ? "No documents have been uploaded." : 'Click "Add Document" to upload PDF, Word, Excel or Text files.'}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {stagedDocs.map((s) => (
                  <TableRow key={s.localId} className="group">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{s.file.name}</span>
                        <Badge variant="outline" className="text-[10px] font-normal">Pending save</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">{extOf(s.file.name).toUpperCase()}</TableCell>
                    <TableCell className="py-3 text-muted-foreground">—</TableCell>
                    <TableCell className="text-right py-3">
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => window.open(s.previewUrl, "_blank")}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => downloadStaged(s)}><Download className="h-4 w-4" /></Button>
                      {!readOnly && <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => removeStaged(s.localId, "document")}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {documents.map((d) => (
                  <TableRow key={d.id} className="group">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{d.fileName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3"><Badge variant="secondary">{d.fileType}</Badge></TableCell>
                    <TableCell className="py-3 text-muted-foreground">{d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right py-3">
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="View" onClick={() => viewDocument(d.id, d.fileName)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="Download" onClick={() => download(d.id, d.fileName)}><Download className="h-4 w-4" /></Button>
                      {!readOnly && <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="Delete" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <h3 className="text-sm font-semibold">Pictures</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => picInputRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5 mr-2" />Add Pictures
            </Button>
          )}
          <input ref={picInputRef} type="file" accept={PIC_ACCEPT} multiple hidden onChange={(e) => uploadFiles(e.target.files, "picture")} />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-10 w-16 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Thumbnail</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">File Name</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Image Type</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Upload Date</TableHead>
              <TableHead className="h-10 w-32 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pictures.length === 0 && stagedPics.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><ImagePlus /></EmptyMedia>
                      <EmptyTitle className="text-sm">No pictures</EmptyTitle>
                      <EmptyDescription>{readOnly ? "No pictures have been uploaded." : 'Click "Add Pictures" to upload images.'}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {stagedPics.map((s) => (
                  <TableRow key={s.localId} className="group">
                    <TableCell className="py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.previewUrl} alt={s.file.name} className="h-10 w-10 object-cover rounded-md border" />
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <span>{s.file.name}</span>
                        <Badge variant="outline" className="text-[10px] font-normal">Pending save</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">{extOf(s.file.name).toUpperCase()}</TableCell>
                    <TableCell className="py-3 text-muted-foreground">—</TableCell>
                    <TableCell className="text-right py-3">
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="Preview" onClick={() => setPreviewPic({ src: s.previewUrl, name: s.file.name })}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="View Full Size" onClick={() => window.open(s.previewUrl, "_blank")}><Maximize2 className="h-4 w-4" /></Button>
                      {!readOnly && <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => removeStaged(s.localId, "picture")}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {pictures.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell className="py-3">
                      {p.thumbnailBase64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`data:image/${p.fileType?.toLowerCase()};base64,${p.thumbnailBase64}`} alt={p.fileName} className="h-10 w-10 object-cover rounded-md border" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted border" />
                      )}
                    </TableCell>
                    <TableCell className="py-3 font-medium">{p.fileName}</TableCell>
                    <TableCell className="py-3"><Badge variant="secondary">{p.fileType}</Badge></TableCell>
                    <TableCell className="py-3 text-muted-foreground">{p.uploadedAt ? new Date(p.uploadedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right py-3">
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="Preview" onClick={() => previewPicture(p.fileName, p.thumbnailBase64, p.fileType)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="View Full Size" onClick={() => viewFullSize(p.id)}><Maximize2 className="h-4 w-4" /></Button>
                      {!readOnly && <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="Delete" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!previewPic} onOpenChange={(open) => !open && setPreviewPic(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{previewPic?.name}</DialogTitle></DialogHeader>
          {previewPic && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewPic.src} alt={previewPic.name} className="w-full max-h-[70vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
