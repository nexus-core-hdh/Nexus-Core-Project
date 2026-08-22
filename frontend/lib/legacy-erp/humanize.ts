// Shared across every Legacy ERP worklist-enabled screen so grid headers and the worklist field
// picker always agree on a given raw column key's display label.
export const humanizeColumn = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

// Generic cell renderer for a custom worklist's dynamic columns (same rule receipt-master-data's
// own formatCell established: blank/boolean/timestamp normalization, everything else as-is).
export const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(value);
};
