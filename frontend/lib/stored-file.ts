import { API_BASE_URL } from "@/lib/api";

// Attachment/gallery entries (StyleCard.attachments, SampleCard.images, ...) store the upload API's
// relative path ("upload/<id>"). As an <img src> that path must be resolved against the API base —
// left relative, the browser resolves it against the current page URL and gets a 404. The upload
// endpoint authenticates the image request with the signed-in user's auth_token cookie.
export function storedFileUrl(url: string | null | undefined): string | null {
  const u = String(url ?? "").trim();
  if (!u) return null;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  return `${API_BASE_URL}/${u.replace(/^\//, "")}`;
}

// A card's first image attachment (entries are {url, type, ...} objects; a plain string is a URL).
export function firstImageAttachment(attachments: unknown): { url: string; name?: string } | null {
  for (const a of Array.isArray(attachments) ? attachments : []) {
    if (typeof a === "string") return { url: a };
    if (a && typeof a === "object" && String((a as any).type || "").startsWith("image/") && (a as any).url) return a as any;
  }
  return null;
}
