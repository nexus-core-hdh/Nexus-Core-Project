// QR Code → SVG for Serial Card labels (qrcode-generator does the encoding; this file renders it).
//
// The payload is encoded as UTF-8 in byte mode: qrcode-generator's own byte conversion keeps only
// the low 8 bits of each JS character (Latin-1), which would corrupt names with accents/symbols,
// so the text is UTF-8-encoded first and handed over as one character per byte.
import qrcode from "qrcode-generator";

export type QrLevel = "M" | "L";

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

/** The smallest QR that holds `text`: medium error correction (better on worn paper labels),
 *  low only when the text is too large for medium. Throws when it fits neither. */
export function qrMatrix(text: string): QrMatrix {
  if (!text) throw new Error("Nothing to encode.");
  const data = utf8ByteString(text);
  for (const level of ["M", "L"] as const) {
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
  throw new Error(`This card's information (${new TextEncoder().encode(text).length} bytes) is too large for a QR Code.`);
}

/** Standalone SVG: one path of dark modules, a 4-module quiet zone, 1 user unit per module. */
export function qrSvg(text: string): string {
  const m = qrMatrix(text);
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

/** The Serial No out of a scanned Serial Card QR (its JSON); null when `text` isn't one. */
export function serialNoFromQr(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t);
    return typeof v?.serialNo === "string" && v.serialNo.trim() ? v.serialNo.trim() : null;
  } catch {
    return null;
  }
}
