"use client";

// Installs navigator.clipboard.writeText where the browser does not provide it (the app opened over
// plain http on the office network) — see lib/clipboard.ts. Renders nothing.

import { useEffect } from "react";
import { installClipboardFallback } from "@/lib/clipboard";

export function ClipboardFallback() {
  useEffect(() => { installClipboardFallback(); }, []);
  return null;
}
