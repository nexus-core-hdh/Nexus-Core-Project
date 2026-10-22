"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { getAuthToken } from "@/lib/auth";
import { toast } from "sonner";
import { ImagePlus, Trash2, Maximize2, ImageOff } from "lucide-react";

const PIC_ACCEPT = "image/*";
const PIC_MESSAGE = "Only image files are allowed.";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

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

async function fetchAttachmentBlob(itemId: number, attId: number) {
  const token = getAuthToken();
  const res = await fetch(legacyErpApi.fabricCards.attachmentContentUrl(itemId, attId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load file");
  return res.blob();
}

interface StagedFile {
  localId: string;
  file: File;
  previewUrl: string;
}

interface Props {
  itemId: number | null;
  readOnly?: boolean;
}

// Picture Gallery — the Type=2 half of the same IM_ItemAttachment table the Attachments tab
// uses (Type=1), rendered as a thumbnail grid. Same pattern as Yarn Card's copy.
export function PictureGalleryTab({ itemId, readOnly = false }: Props) {
  const [pictures, setPictures] = useState<any[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [loading, setLoading] = useState(!!itemId);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flushing = useRef(false);

  const load = async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const pics: any = await legacyErpApi.fabricCards.listAttachments(itemId, "picture");
      setPictures(Array.isArray(pics) ? pics : []);
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
          await legacyErpApi.fabricCards.uploadAttachment(itemId, { kind: "picture", fileName: s.file.name, dataUrl });
          URL.revokeObjectURL(s.previewUrl);
          ok++;
        } catch (e: any) {
          toast.error(`${s.file.name}: ${e.message || "Upload failed"}`);
        }
      }
      setStaged([]);
      if (ok > 0) toast.success(`${ok} staged picture${ok > 1 ? "s" : ""} saved`);
      flushing.current = false;
      load();
    })();
  }, [itemId]);

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      if (!isImageFile(file)) {
        toast.error(`${file.name}: ${PIC_MESSAGE}`);
        continue;
      }
      if (!itemId) {
        setStaged((p) => [{ localId: `${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) }, ...p]);
        successCount++;
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        await legacyErpApi.fabricCards.uploadAttachment(itemId, { kind: "picture", fileName: file.name, dataUrl });
        successCount++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message || "Upload failed"}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} picture${successCount > 1 ? "s" : ""} uploaded`);
      if (itemId) load();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (attId: number) => {
    if (!itemId) return;
    try {
      await legacyErpApi.fabricCards.removeAttachment(itemId, attId);
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

  const viewFullSize = async (attId: number) => {
    try {
      const blob = await fetchAttachmentBlob(itemId!, attId);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const empty = pictures.length === 0 && staged.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Picture Gallery</h3>
        {!readOnly && (
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5 mr-2" />Add Pictures
          </Button>
        )}
        <input ref={inputRef} type="file" accept={PIC_ACCEPT} multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
      </div>

      {!itemId && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Pictures picked here are staged locally and uploaded automatically once you Save the fabric card.
        </div>
      )}

      {empty ? (
        <div className="rounded-xl border border-dashed bg-muted/20 py-10">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><ImageOff /></EmptyMedia>
              <EmptyTitle className="text-sm">No pictures</EmptyTitle>
              <EmptyDescription>{readOnly ? "No pictures have been uploaded." : 'Click "Add Pictures" to upload images.'}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {staged.map((s) => (
            <div key={s.localId} className="group relative overflow-hidden rounded-xl border shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.previewUrl} alt={s.file.name} className="aspect-square w-full object-cover" />
              <Badge variant="outline" className="absolute left-2 top-2 text-[10px] font-normal bg-background/80">Pending save</Badge>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="truncate text-xs">{s.file.name}</span>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeStaged(s.localId)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {pictures.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-xl border shadow-sm">
              {p.thumbnailBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/${p.fileType?.toLowerCase()};base64,${p.thumbnailBase64}`}
                  alt={p.fileName}
                  className="aspect-square w-full cursor-pointer object-cover"
                  onClick={() => setPreview({ src: `data:image/${p.fileType?.toLowerCase()};base64,${p.thumbnailBase64}`, name: p.fileName })}
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-muted"><ImageOff className="h-6 w-6 text-muted-foreground" /></div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="truncate text-xs">{p.fileName}</span>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="View Full Size" onClick={() => viewFullSize(p.id)}><Maximize2 className="h-3.5 w-3.5" /></Button>
                  {!readOnly && <Button variant="ghost" size="icon" className="h-6 w-6" title="Delete" onClick={() => remove(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.src} alt={preview.name} className="w-full max-h-[70vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
