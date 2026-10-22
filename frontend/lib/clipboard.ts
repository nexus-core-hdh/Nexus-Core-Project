// Copy-to-clipboard that also works when the app is opened over plain http on the office network
// (http://<LAN-IP>:3000). Browsers only provide navigator.clipboard in a secure context (https or
// localhost); elsewhere it is undefined, and every `navigator.clipboard.writeText(...)` in the app
// threw "Cannot read properties of undefined (reading 'writeText')".
//
// installClipboardFallback() (called once by components/clipboard-fallback.tsx) gives such pages a
// navigator.clipboard.writeText with the same contract — resolves when copied, rejects when not —
// using the long-supported selection + execCommand("copy") route. A secure context keeps the
// browser's own implementation untouched.

type Doc = Pick<Document, "createElement" | "body" | "activeElement" | "execCommand">;

/** Copies `text` by selecting it in a temporary, invisible textarea. True when the browser copied it. */
export function legacyCopy(text: string, doc: Doc = document): boolean {
  // Inside an open modal (focus-trapped), the textarea must live in that dialog to be selectable.
  const active = doc.activeElement as (Element & { closest?: (s: string) => Element | null }) | null;
  const host = (active?.closest?.('[role="dialog"]') as HTMLElement | null) ?? doc.body;
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  host.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    return !!doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
    (active as HTMLElement | null)?.focus?.();
  }
}

/** Gives navigator a clipboard.writeText when the browser does not (insecure context). Idempotent. */
export function installClipboardFallback(nav: Navigator = navigator, doc: Doc = document): boolean {
  if (nav.clipboard && typeof nav.clipboard.writeText === "function") return false;
  const fallback = {
    writeText: (text: string) =>
      legacyCopy(String(text ?? ""), doc) ? Promise.resolve() : Promise.reject(new Error("Copy to clipboard is not available in this browser")),
  };
  Object.defineProperty(nav, "clipboard", { value: fallback, configurable: true });
  return true;
}

/** Copy with a definite outcome for callers that report it: true copied, false not (never throws). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return typeof document !== "undefined" ? legacyCopy(text) : false;
  } catch {
    return typeof document !== "undefined" ? legacyCopy(text) : false;
  }
}
