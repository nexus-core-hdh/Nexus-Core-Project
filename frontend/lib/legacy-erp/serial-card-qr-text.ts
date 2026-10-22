// Serial Card label QR — ONE QR per card holding the card's complete data snapshot as compact,
// lossless, versioned text (format NXSC/2). Readable offline: no URL, server, network or login.
//
//   SERIAL CARD: 00000008            <- line 1: the Serial No (ERP scan box key; scanner preview)
//   NXSC/2 2026-10-14                <- format version + snapshot (print) date
//   WO: W/O-000211                   <- one "Key: value" line per field that has a value
//   Fabric Name: FLAT KNIT RIB 1X1 | 320 GSM | ...
//   Color: DARK DENIM
//   Color Name: =                    <- "=": same as the code line above
//   Recipe: ok common                <- recipe status [source] (+ "Recipe Note:" when there is a message)
//   Y: YARN-00008|70-DNR LYCRA||||9.94|2|0
//                                    <- yarn rows: code|name|process|variant1|variant2|%|waste %|dye waste %|note
//
// Lossless: decodeSerialCardQr(text) returns exactly serialCardSnapshot(card) — every field
// (an absent line = no value: the field list is fixed by the format version), every recipe row
// and cell, the recipe status/source/message. Values are kept verbatim; only "\" and line breaks
// (and "|" inside a yarn row) are escaped. Numbers are written in their shortest exact form;
// Product / Expiration Date are calendar dates (YYYY-MM-DD) as the ERP stores them.
//
// It is a snapshot: edits made in the ERP after printing are NOT on an existing label; reprint it.
// No secrets: only the card's own production fields (no ids, users, sessions or tokens).
import type { SerialCardRow } from "@/components/legacy-erp/serial-card-edit-dialog";
import { qrMatrix, type QrLevel, type QrMatrix } from "./qr";

export const QR_TEXT_FORMAT = "NXSC/2";
export const QR_TEXT_HEADER = "SERIAL CARD: ";

type Kind = "s" | "n" | "d";
/** Format NXSC/2 field table — order and keys are part of the format; never reorder or rename. */
export const SNAPSHOT_FIELDS = [
  ["workOrderNo", "WO", "s"],
  ["styleNumber", "Style", "s"],
  ["styleName", "Style Name", "s"],
  ["inventoryCode", "Fabric", "s"],
  ["inventoryName", "Fabric Name", "s"],
  ["fabricComposition", "Comp", "s"],
  ["fabricGsm", "GSM", "s"],
  ["fabricWidth", "Spec Width", "n"],
  ["fabricWeight", "Spec Weight", "n"],
  ["colorCode", "Color", "s"],
  ["colorName", "Color Name", "s"],
  ["variantCode", "Variant", "s"],
  ["variantName", "Variant Name", "s"],
  ["Width", "Width", "n"],
  ["Weight", "Grams", "n"],
  ["Quantity", "Qty", "n"],
  ["unitCode", "Unit", "s"],
  ["receiptNo", "Receipt", "s"],
  ["ManufacturingDate", "Prod Date", "d"],
  ["ExpirationDate", "Exp Date", "d"],
  ["ShelfLife", "Shelf Life", "n"],
  ["PartyNo", "Party", "s"],
  ["currentAccountCode", "Man C/A", "s"],
  ["currentAccountName", "Man C/A Name", "s"],
  ["qualityTypeName", "Quality", "s"],
  ["resourceCode", "Resource", "s"],
  ["ProducerSerialCode", "Mfr Serial", "s"],
  ["Explanation", "Note", "s"],
  ["QuantityMT", "Qty II", "n"],
  ["Quantity3", "Qty III", "n"],
  ["RawWidth", "Raw Width", "n"],
  ["RawWeight", "Raw Weight", "n"],
  ["RawLength", "Raw Length", "n"],
  ["ProductLength", "Prod Length", "n"],
  ["WeightM2", "M2", "n"],
  ["WeightMt", "Mtul", "n"],
  ["Pus", "Pus", "n"],
  ["Fine", "Fine", "n"],
  ["PieceCount", "Pieces", "n"],
] as const satisfies readonly (readonly [string, string, Kind])[];

/** "Name" fields written as "=" when equal to the code field right before them. */
const SAME_AS: Record<string, string> = { colorName: "colorCode", variantName: "variantCode" };
const RECIPE_CELLS = ["yarnCode", "yarnName", "process", "variant1", "variant2", "percentage", "wastePct", "dyeWastagePct", "explanation"] as const;
const RECIPE_NUM = new Set<string>(["percentage", "wastePct", "dyeWastagePct"]);

type FieldKey = (typeof SNAPSHOT_FIELDS)[number][0];
export interface SnapshotRecipeLine {
  yarnCode: string | null; yarnName: string | null; process: string | null; variant1: string | null; variant2: string | null;
  percentage: number | null; wastePct: number | null; dyeWastagePct: number | null; explanation: string | null;
}
export interface SnapshotRecipe {
  /** "unavailable" = the recipe was not loaded when the label was printed. */
  status: string;
  source: string | null;
  message: string | null;
  lines: SnapshotRecipeLine[];
}
export type SerialCardSnapshot = { format: typeof QR_TEXT_FORMAT; printedOn: string; serialNo: string; recipe: SnapshotRecipe } & Record<FieldKey, string | number | null>;

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const numv = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const datev = (v: unknown): string | null => (v ? String(v).slice(0, 10) : null);

/** The card's data exactly as the label QR carries it (the "source payload" a decode must reproduce). */
export function serialCardSnapshot(c: SerialCardRow, printedOn: string): SerialCardSnapshot {
  const snap: any = { format: QR_TEXT_FORMAT, printedOn, serialNo: String(c.SerialCode ?? "") };
  for (const [key, , kind] of SNAPSHOT_FIELDS) {
    const v = (c as any)[key];
    snap[key] = kind === "n" ? numv(v) : kind === "d" ? datev(v) : str(v);
  }
  const r = c.yarnRecipe;
  snap.recipe = r
    ? {
        status: r.status, source: str(r.source), message: str(r.message),
        lines: (r.lines ?? []).map((l: any) => Object.fromEntries(RECIPE_CELLS.map((k) => [k, RECIPE_NUM.has(k) ? numv(l[k]) : str(l[k])]))),
      }
    : { status: "unavailable", source: null, message: null, lines: [] };
  return snap;
}

// ── Escaping ────────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
const escCell = (s: string) => esc(s).replace(/\|/g, "\\|");
function unesc(s: string): string {
  return s.replace(/\\(.)/g, (_m, c) => (c === "n" ? "\n" : c === "r" ? "\r" : c));
}
/** Split a yarn row on "|" not preceded by an escaping backslash. */
function splitCells(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === "|") { out.push(cur); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}
const numText = (n: number) => String(n);

/** NXSC/2 text for a snapshot. */
export function encodeSerialCardSnapshot(s: SerialCardSnapshot): string {
  const lines = [`${QR_TEXT_HEADER}${esc(s.serialNo)}`, `${QR_TEXT_FORMAT} ${s.printedOn}`];
  for (const [key, label] of SNAPSHOT_FIELDS) {
    const v = s[key];
    if (v == null) continue;
    const text = typeof v === "number" ? numText(v) : v;
    const same = SAME_AS[key];
    if (same && s[same as FieldKey] === v) { lines.push(`${label}: =`); continue; }
    // A real value of "=" on a SAME_AS field is escaped so it can't be read as "same as".
    lines.push(`${label}: ${same && text === "=" ? "\\=" : esc(text)}`);
  }
  const r = s.recipe;
  lines.push(`Recipe: ${esc(r.status)}${r.source != null ? ` ${esc(r.source)}` : ""}`);
  if (r.message != null) lines.push(`Recipe Note: ${esc(r.message)}`);
  for (const l of r.lines) {
    const cells = RECIPE_CELLS.map((k) => (l[k] == null ? "" : escCell(typeof l[k] === "number" ? numText(l[k] as number) : (l[k] as string))));
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    lines.push(`Y: ${cells.join("|")}`);
  }
  return lines.join("\n");
}

/** Parse NXSC/2 text back into the snapshot (null when `text` is not NXSC/2). */
export function decodeSerialCardQr(text: string): SerialCardSnapshot | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (!lines[0]?.startsWith(QR_TEXT_HEADER)) return null;
  const ver = lines[1]?.match(/^NXSC\/2 (\d{4}-\d{2}-\d{2})$/);
  if (!ver) return null;
  const snap: any = { format: QR_TEXT_FORMAT, printedOn: ver[1], serialNo: unesc(lines[0].slice(QR_TEXT_HEADER.length)) };
  for (const [key] of SNAPSHOT_FIELDS) snap[key] = null;
  const byLabel = new Map<string, readonly [string, string, Kind]>(SNAPSHOT_FIELDS.map((f) => [f[1], f]));
  const recipe: SnapshotRecipe = { status: "ok", source: null, message: null, lines: [] };
  let recipeHead: string | null = null;
  for (const line of lines.slice(2)) {
    const i = line.indexOf(": ");
    if (i < 0) throw new Error(`NXSC/2: unreadable line "${line}"`);
    const label = line.slice(0, i), raw = line.slice(i + 2);
    if (label === "Y") {
      const cells = splitCells(raw).map(unesc);
      recipe.lines.push(Object.fromEntries(RECIPE_CELLS.map((k, j) => {
        const c = cells[j];
        return [k, c == null || c === "" ? null : RECIPE_NUM.has(k) ? Number(c) : c];
      })) as unknown as SnapshotRecipeLine);
      continue;
    }
    if (label === "Recipe") { recipeHead = raw; continue; }
    if (label === "Recipe Note") { recipe.message = unesc(raw); continue; }
    const f = byLabel.get(label);
    if (!f) throw new Error(`NXSC/2: unknown field "${label}"`);
    const [key, , kind] = f;
    if (raw === "=" && SAME_AS[key]) { snap[key] = snap[SAME_AS[key]]; continue; }
    const v = raw === "\\=" && SAME_AS[key] ? "=" : unesc(raw);
    snap[key] = kind === "n" ? Number(v) : v;
  }
  if (recipeHead == null) throw new Error("NXSC/2: no Recipe line");
  // "Recipe: <status>[ <source>]" — neither contains a space.
  const sp = recipeHead.indexOf(" ");
  recipe.status = unesc(sp < 0 ? recipeHead : recipeHead.slice(0, sp));
  recipe.source = sp < 0 ? null : unesc(recipeHead.slice(sp + 1));
  snap.recipe = recipe;
  return snap;
}

// ── QR ───────────────────────────────────────────────────────────────────────────────────────
/** Error-correction level of the label QR. */
export const LABEL_QR_LEVEL: QrLevel = "M";

export interface SerialCardQr {
  /** The exact text encoded in the QR. */
  text: string;
  bytes: number;
  matrix: QrMatrix;
  snapshot: SerialCardSnapshot;
}

/** The ONE QR for a card: its complete snapshot (throws only when it exceeds QR capacity at all). */
export function serialCardQr(c: SerialCardRow, opts: { printedOn: string }): SerialCardQr {
  const snapshot = serialCardSnapshot(c, opts.printedOn);
  const text = encodeSerialCardSnapshot(snapshot);
  const matrix = qrMatrix(text, [LABEL_QR_LEVEL]);
  return { text, bytes: new TextEncoder().encode(text).length, matrix, snapshot };
}

/** Today as YYYY-MM-DD in the printing computer's local time. */
export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
