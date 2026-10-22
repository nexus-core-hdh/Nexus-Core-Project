// "Return to" after login (?next=…) — only a same-origin path is accepted, so a crafted login link
// can't send a user to another site after they sign in (open redirect). Used by the Serial Card
// scan page (/s/<Serial No>): not logged in → login → straight back to the scanned card.
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  // A single leading "/" and nothing that a browser would treat as another origin
  // ("//host", "/\host", schemes, control characters).
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\\]/.test(v)) return null;
  try {
    const u = new URL(v, "http://same-origin.invalid");
    if (u.origin !== "http://same-origin.invalid") return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/** The `next` path of the current page's URL (client only), or null. */
export function nextPathFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}
