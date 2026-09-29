"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { storedFileUrl } from "@/lib/stored-file";

// An uploaded image (upload API path or absolute URL). Shows `placeholder` when there is no image
// or it fails to load, never the browser's broken-image icon.
export function StoredImage({ url, alt = "", className, placeholder }: {
  url: string | null | undefined; alt?: string; className?: string; placeholder?: ReactNode;
}) {
  const src = storedFileUrl(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <>{placeholder ?? <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageOff className="h-5 w-5" /></div>}</>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
