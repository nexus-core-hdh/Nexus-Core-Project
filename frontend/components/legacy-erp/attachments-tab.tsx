"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { getAuthToken } from "@/lib/auth";
import { toast } from "sonner";
import { FilePlus2, Download, Eye, Trash2, FileText } from "lucide-react";

const DOC_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "txt"];
const DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt";
const DOC_MESSAGE = "Only PDF, Word, Excel and Text files are allowed.";
const NON_PREVIEWABLE_EXTENSIONS = ["doc", "docx", "xls", "xlsx"];

const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface StagedFile {
  localId: string;
  file: File;
  previewUrl: string;
}

/** The subset of a card's legacyErpApi client this component needs — legacyErpApi.fabricCards,
 *  .yarnCards and .trimInventoryCards all already satisfy this shape as-is. */
export interface AttachmentsApi {
  attachmentContentUrl: (id: number, attId: number) => string;
  listAttachments: (id: number, kind: "document" | "picture") => Promise<any>;
  uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => Promise<any>;
  removeAttachment: (id: number, attId: number) => Promise<any>;
}

interface Props {
  itemId: number | null;
  readOnly?: boolean;
  /** Which card's API this instance reads/writes through — Fabric Card, Trim Card, ... */
  api: AttachmentsApi;
}

// Documents half of the shared IM_ItemAttachment table (Type=1) — shared by every IM_Item-
// based card (Fabric, Trim; Yarn Card keeps its own pre-existing private copy, untouched) via
// the `api` prop instead of a hardcoded legacyErpApi.<card> reference.
export function AttachmentsTab({ itemId, readOnly = false, api }: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [loading, setLoading] = useState(!!itemId);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const flushing = useRef(false);

  const fetchAttachmentBlob = async (attId: number) => {
    const token = getAuthToken();
    const res = await fetch(api.attachmentContentUrl(itemId!, attId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to load file");
    return res.blob();
  };

  const load = async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const docs: any = await api.listAttachments(itemId, "document");
      setDocuments(Array.isArray(docs) ? docs : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [itemId]);

  useEffect(() => {
    if (!itemId || flushing.current || !staged.length) return;
    flushing.current = true;
    (async () => {
      let ok = 0;
      for (const s of staged) {
        try {
          const dataUrl = await readAsDataUrl(s.file);
          await api.uploadAttachment(itemId, { kind: "document", fileName: s.file.name, dataUrl });
          URL.revokeObjectURL(s.previewUrl);
          ok++;
        } catch (e: any) {
          toast.error(`${s.file.name}: ${e.message || "Upload failed"}`);
        }
      }
      setStaged([]);
      if (ok > 0) toast.success(`${ok} staged file${ok > 1 ? "s" : ""} saved`);
      flushing.current = false;
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      if (!DOC_EXTENSIONS.includes(extOf(file.name))) {
        toast.error(`${file.name}: ${DOC_MESSAGE}`);
        continue;
      }
      if (!itemId) {
        setStaged((p) => [{ localId: `${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) }, ...p]);
        successCount++;
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        await api.uploadAttachment(itemId, { kind: "document", fileName: file.name, dataUrl });
        successCount++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message || "Upload failed"}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? "s" : ""} uploaded`);
      if (itemId) load();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (attId: number) => {
    if (!itemId) return;
    try {
      await api.removeAttachment(itemId, attId);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const removeStaged = (localId: string) => {
    const found = staged.find((s) => s.localId === localId);
    if (found) URL.revokeObjectURL(found.previewUrl);
    setStaged((p) => p.filter((s) => s.localId !== localId));
  };

  const download = async (attId: number, fileName: string) => {
    try {
      const blob = await fetchAttachmentBlob(attId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const view = async (attId: number, fileName: string) => {
    if (NON_PREVIEWABLE_EXTENSIONS.includes(extOf(fileName))) {
      toast.error("This file type can't be previewed in-browser — use Download instead.");
      return;
    }
    try {
      const blob = await fetchAttachmentBlob(attId);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      {!itemId && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Files picked here are staged locally and uploaded automatically once you Save the card.
        </div>
      )}

      <div className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <h3 className="text-sm font-semibold">Documents</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <FilePlus2 className="h-3.5 w-3.5 mr-2" />Add Document
            </Button>
          )}
          <input ref={inputRef} type="file" accept={DOC_ACCEPT} multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
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
            {documents.length === 0 && staged.length === 0 ? (
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
                {staged.map((s) => (
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
                      {!readOnly && <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => removeStaged(s.localId)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
                      <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" title="View" onClick={() => view(d.id, d.fileName)}><Eye className="h-4 w-4" /></Button>
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
    </div>
  );
}
