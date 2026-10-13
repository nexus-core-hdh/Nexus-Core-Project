// Shared across every Legacy ERP worklist-enabled screen so grid headers and the worklist field
// picker always agree on a given raw column key's display label.
export const humanizeColumn = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

// Default Customized Worklist label for a field. Id columns that a worklist displays as the related
// name (see worklist-rows.service.ts displayColumnSql / worklistCellValue) are labelled by what they
// show; every other key keeps its humanized column name.
const NAME_DISPLAYED_FIELDS: Record<string, string> = { CurrentAccountId: "Current Account", UnitId: "Unit" };
export const worklistFieldLabel = (key: string) => NAME_DISPLAYED_FIELDS[key] ?? humanizeColumn(key);

// Header for a field of a SAVED worklist: a label still equal to the old automatic one (e.g. "Unit
// Id") follows the current default ("Unit"), now that those columns show names; a label the user
// typed is kept as it is.
export const savedWorklistFieldLabel = (field: { key: string; label: string }) =>
  field.label === humanizeColumn(field.key) ? worklistFieldLabel(field.key) : field.label;

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
