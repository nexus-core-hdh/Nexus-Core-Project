// Centralized, generic camelCase-column -> business-friendly label formatter. NOT a per-document
// mapping table — every audited entity across the app (Purchase Order today, any future screen
// tomorrow) shares this one function instead of each screen/dialog hand-rolling its own labels.
// Splits camelCase/PascalCase into words, then title-cases each word, upper-casing the handful of
// real acronyms this ERP's own column names actually contain (confirmed against HEADER_COLUMNS/
// ITEM_COLUMNS across purchase-order.service.ts, inventory-receipt.service.ts, work-order.
// service.ts — VAT/ID/PO/GSM/UUID/QC/BOM are the only ones that appear).
const ACRONYMS = new Set(["vat", "id", "po", "ir", "wo", "gsm", "uuid", "qc", "bom", "sku"]);

function titleCaseWord(word: string): string {
  if (!word) return word;
  return ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * "subTotal" -> "Sub Total", "vatAmount" -> "VAT Amount", "currentAccountId" -> "Current Account ID".
 * Pass `isResolvedRef: true` when the field's VALUE is a resolved {id,code,name} display ref
 * (see isDisplayRef in log-details-dialog.tsx) — a raw FK id column showing Code/Name no longer
 * needs its own "...ID" suffix, so it's dropped: "currentAccountId" -> "Current Account".
 */
export function formatFieldLabel(key: string, isResolvedRef = false): string {
  let k = key;
  if (isResolvedRef) k = k.replace(/Id$/, "");
  const words = k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
  return words.map(titleCaseWord).join(" ");
}
