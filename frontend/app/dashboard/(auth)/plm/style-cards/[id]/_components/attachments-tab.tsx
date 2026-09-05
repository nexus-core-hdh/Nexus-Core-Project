"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, ClipboardPaste, File as FileIcon, ImageOff, X } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { uploadApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

// Full attachment management (all file types), moved out of General into its own tab to match
// the reference screenshot's tab list. Reuses the exact same upload/clipboard-paste mechanism
// already built for plm/sample-cards' General tab (uploadApi.uploadSingle + the clipboard
// image-extraction technique from components/ui/custom/minimal-tiptap's file-handler
// extension) — same StyleCard.attachments Json array, no new storage. Picture Gallery (its own
// tab) reads/writes this same array, filtered to images only. Sample Card reuses this component
// wholesale via the optional `sampleCardId` prop — SampleCard already has its own genuinely
// independent `attachments` column (same field name, separate storage from Style Card's).
export function AttachmentsTab({ styleCardId, sampleCardId, card, onReloadCard }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const [attachments, setAttachments] = useState<any[]>(Array.isArray(card.attachments) ? card.attachments : []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setAttachments(Array.isArray(card.attachments) ? card.attachments : []); }, [card]);

  const persist = async (next: any[]) => {
    setAttachments(next);
    try {
      if (sampleCardId) await plmApi.sampleCards.update(sampleCardId, { attachments: next });
      else await plmApi.styleCards.update(styleCardId!, { attachments: next });
      onReloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to save attachments");
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const user = getCurrentUser();
      const result = await uploadApi.uploadSingle(file, user?.id as any);
      const url = result.relativePath || result.url || `files/${result.type}/${result.name}`;
      await persist([...attachments, { id: `${Date.now()}`, name: file.name, type: file.type, url }]);
      toast.success("File uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadFile(file);
  };

  const onPasteImage = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const file = new File([blob], `clipboard-${Date.now()}.${item.type.split("/")[1] || "png"}`, { type: item.type });
        await uploadFile(file);
        return;
      }
    }
  };

  const removeAttachment = (id: string) => persist(attachments.filter((a) => a.id !== id));

  const attachmentUrl = (a: any) => (String(a.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a.url || "").replace(/^\//, "")}`);
  const isImage = (a: any) => String(a.type || "").startsWith("image/");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div
          ref={pasteZoneRef}
          tabIndex={0}
          onPaste={onPasteImage}
          className="flex flex-1 items-center gap-2 rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 mr-2"
          title="Click here, then paste (Ctrl+V) an image from your clipboard"
        >
          <ClipboardPaste className="h-3.5 w-3.5 shrink-0" />
          {uploading ? "Uploading..." : "Click here, then Ctrl+V to add a picture from clipboard"}
        </div>
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" />Add New Document
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
      </div>

      {!attachments.length ? (
        <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground py-10">
          <ImageOff className="h-5 w-5" />
          <p className="text-xs">No attachments yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {attachments.map((a) => (
            <div key={a.id} className="group relative rounded-md border overflow-hidden">
              {isImage(a) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachmentUrl(a)} alt={a.name} className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 flex-col items-center justify-center gap-1 bg-muted/40">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <span className="block truncate bg-background/90 px-1.5 py-1 text-[11px]">{a.name}</span>
              <button
                onClick={() => removeAttachment(a.id)}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 opacity-0 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
