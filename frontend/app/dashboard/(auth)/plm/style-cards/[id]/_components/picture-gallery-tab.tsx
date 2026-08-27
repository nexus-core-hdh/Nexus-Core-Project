"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, ClipboardPaste, ImageOff, X } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { uploadApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

// Image-only view over the SAME StyleCard.attachments Json array the Attachments tab manages
// (filtered to type startsWith "image/") — deliberately not a second image field/table, per
// "do not create duplicate image storage". Add/remove here only ever touches image entries;
// non-image attachments added elsewhere are left untouched and simply don't appear in this
// grid. Same upload/clipboard-paste mechanism as Attachments tab.
export function PictureGalleryTab({ styleCardId, card, onReloadCard }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [attachments, setAttachments] = useState<any[]>(Array.isArray(card.attachments) ? card.attachments : []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setAttachments(Array.isArray(card.attachments) ? card.attachments : []); }, [card]);

  const isImage = (a: any) => String(a.type || "").startsWith("image/");
  const images = attachments.filter(isImage);

  const persist = async (next: any[]) => {
    setAttachments(next);
    try {
      await plmApi.styleCards.update(styleCardId, { attachments: next });
      onReloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to save picture gallery");
    }
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Only image files can be added to the Picture Gallery");
    setUploading(true);
    try {
      const user = getCurrentUser();
      const result = await uploadApi.uploadSingle(file, user?.id as any);
      const url = result.relativePath || result.url || `files/${result.type}/${result.name}`;
      await persist([...attachments, { id: `${Date.now()}`, name: file.name, type: file.type, url }]);
      toast.success("Image added");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadImage(file);
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
        await uploadImage(file);
        return;
      }
    }
  };

  const removeImage = (id: string) => persist(attachments.filter((a) => a.id !== id));

  const attachmentUrl = (a: any) => (String(a.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a.url || "").replace(/^\//, "")}`);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div
          tabIndex={0}
          onPaste={onPasteImage}
          className="flex flex-1 items-center gap-2 rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 mr-2"
          title="Click here, then paste (Ctrl+V) an image from your clipboard"
        >
          <ClipboardPaste className="h-3.5 w-3.5 shrink-0" />
          {uploading ? "Uploading..." : "Click here, then Ctrl+V to add a picture from clipboard"}
        </div>
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" />Add Picture
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
      </div>

      {!images.length ? (
        <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground py-10">
          <ImageOff className="h-5 w-5" />
          <p className="text-xs">No pictures yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {images.map((a) => (
            <div key={a.id} className="group relative rounded-md border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachmentUrl(a)} alt={a.name} className="h-32 w-full object-cover" />
              <button
                onClick={() => removeImage(a.id)}
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
