"use client";

export type CsvRow = Record<string, string>;

// Basic CSV parser with support for quoted fields, escaped quotes, CRLF, and commas.
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const input = (text || "").replace(/^\uFEFF/, ""); // strip UTF-8 BOM if present
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // Avoid pushing completely empty trailing row
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = input[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\r") {
      // Handle CRLF
      const next = input[i + 1];
      if (next === "\n") i++;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  pushField();
  if (row.length > 1 || row[0] !== "" || rows.length === 0) {
    pushRow();
  }

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow || []).map((h) => (h || "").trim()).filter(Boolean);

  const out: CsvRow[] = dataRows
    .filter((r) => r.some((v) => String(v ?? "").trim() !== ""))
    .map((r) => {
      const obj: CsvRow = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").toString();
      });
      return obj;
    });

  return { headers, rows: out };
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: Array<Record<string, any>>): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const lines = rows.map((r) => headers.map((h) => escapeCsvValue(r[h])).join(","));
  return [headerLine, ...lines].join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


















