// QR Code → SVG for Serial Card labels (qrcode-generator does the encoding; this file renders it).
//
// The text is encoded as UTF-8 in byte mode: qrcode-generator's own byte conversion keeps only
// the low 8 bits of each JS character (Latin-1), which would corrupt non-ASCII characters, so the
// text is UTF-8-encoded first and handed over as one character per byte.
import qrcode from "qrcode-generator";

export type QrLevel = "H" | "Q" | "M" | "L";

export interface QrMatrix {
  size: number;
  version: number;
  level: QrLevel;
  isDark: (row: number, col: number) => boolean;
}

/** One JS char per UTF-8 byte — what qrcode-generator's byte mode expects. */
export function utf8ByteString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** The QR for `text` at the first error-correction level (in `levels` order) it fits.
 *  Label links are short, so they get "Q" — readable even with a quarter of the code scuffed.
 *  Throws when the text fits none of the levels. */
export function qrMatrix(text: string, levels: QrLevel[] = ["Q", "M", "L"]): QrMatrix {
  if (!text) throw new Error("Nothing to encode.");
  const data = utf8ByteString(text);
  for (const level of levels) {
    try {
      const qr = qrcode(0, level);
      qr.addData(data, "Byte");
      qr.make();
      const size = qr.getModuleCount();
      return { size, version: (size - 17) / 4, level, isDark: (r, c) => qr.isDark(r, c) };
    } catch {
      // too long for this level — try the next one
    }
  }
  throw new Error(`This text (${new TextEncoder().encode(text).length} bytes) is too large for a QR Code.`);
}

/** Standalone SVG: one path of dark modules, a 4-module quiet zone, 1 user unit per module. */
export function qrSvg(text: string, levels?: QrLevel[]): string {
  const m = qrMatrix(text, levels);
  const quiet = 4;
  const total = m.size + quiet * 2;
  let d = "";
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" data-qr-version="${m.version}" data-qr-level="${m.level}"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** The Serial No from a label's offline text QR (lib/legacy-erp/serial-card-qr-text.ts, any part):
 *  its first line "SERIAL CARD: <Serial No>[ (n/N)]". A keyboard-wedge scanner sends that line on
 *  its own (Enter ends it); an input that dropped the line breaks still parses. */
export function serialNoFromQrText(text: string): string | null {
  const m = text.replace(/^﻿/, "").match(/^SERIAL CARD: (.+?)(?: \(\d{1,2}\/\d{1,2}\))?[ \t]*(?=\r|\n|NXSC\/\d+ |Summary: |-- [A-Z ]+(?: \(cont\.\))? --|$)/);
  // NXSC/2 escapes "\" in the Serial No as "\\".
  const serial = m?.[1].trim().replace(/\\(.)/g, "$1");
  return serial || null;
}

/** The Serial No out of a scanned Serial Card QR — the offline text label ("SERIAL CARD: …"), an
 *  earlier label link (…/s/<Serial No>) or an older label's JSON payload ({"serialNo": …}); null
 *  when `text` is none of these. */
export function serialNoFromQr(text: string): string | null {
  const t = text.trim();
  const fromText = serialNoFromQrText(t);
  if (fromText) return fromText;
  if (/^https?:\/\//i.test(t)) {
    try {
      const m = new URL(t).pathname.match(/\/s\/([^/]+)\/?$/);
      const serial = m ? decodeURIComponent(m[1]).trim() : "";
      return serial || null;
    } catch {
      return null;
    }
  }
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t);
    return typeof v?.serialNo === "string" && v.serialNo.trim() ? v.serialNo.trim() : null;
  } catch {
    return null;
  }
}

/** True when a QR link points at an address a phone can't reach (localhost / loopback). */
export function isLocalQrLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "::1" || h === "[::1]" || /^127\./.test(h);
  } catch {
    return false;
  }
}
