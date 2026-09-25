"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";

export interface MockAttachment { id: string; name: string; size: number; }

/** Mock attachments UI (spec section 2/8) — accepts files into local state only, nothing is
 *  uploaded anywhere. Swap for a real upload service in a later phase. */
export function AttachmentsField({ value, onChange }: { value: MockAttachment[]; onChange: (files: MockAttachment[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next = Array.from(fileList).map((f) => ({ id: `${Date.now()}-${f.name}`, name: f.name, size: f.size }));
    onChange([...value, ...next]);
    toast.success(`${next.length} file(s) attached`);
  };

  const remove = (id: string) => onChange(value.filter((f) => f.id !== id));

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Paperclip className="h-3.5 w-3.5 mr-1.5" />Attach Files
      </Button>
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">({(f.size / 1024).toFixed(1)} KB)</span>
              </span>
              <button type="button" onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
