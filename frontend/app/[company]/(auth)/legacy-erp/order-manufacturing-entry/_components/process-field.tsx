"use client";

// Order Manufacturing Entry's Process field: the Work Order's Route processes (lib/legacy-erp/
// process-options.ts) in a MasterAutocompleteField. A Route process with no linked legacy process is
// listed disabled with its reason and cannot be chosen. Its own module so the real browser test
// (scripts/om-process-field.browser.test.mjs) mounts exactly what the screen renders.

import { toast } from "sonner";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { processOptions } from "@/lib/legacy-erp/process-options";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";

type Process = { id: number; code: string | null; name: string | null };

export const processLabel = (p: { code: string | null; name: string | null } | null) => (p ? [p.code, p.name].filter(Boolean).join(" ") : "");

export function ProcessField({ workOrderId, process, onPick, onClear }: {
  workOrderId: number | null;
  /** The chosen process (the screen's context), or null. */
  process: Process | null;
  onPick: (processId: number) => void;
  onClear: () => void;
}) {
  const shown = processLabel(process);
  return (
    <MasterAutocompleteField
      label="" compact masterKey="process"
      displayValue={shown}
      // Existing 'process' master (MA_Process). The field shows "Code Name", e.g. "12 Sewing".
      fetchOptions={async (t) => {
        // Opening the field lists every option: the chosen process's own text is not a search term.
        const term = t.trim() === shown ? "" : t;
        // With an Order chosen: every process of its Style Card's Route, in route order (one not
        // linked to a legacy process is listed but not selectable), or every process when it has no
        // Route — re-read on every open, so a changed Order / Route shows at once. Without an
        // Order: the Process master, as before.
        if (workOrderId) return processOptions(await legacyErpApi.orderManufacturing.processes(workOrderId), term);
        const rows = (await legacyErpApi.lookupTable("process", term)) as any[];
        return (Array.isArray(rows) ? rows : []).map((r) => ({ id: r.id, code: r.code, name: [r.code, r.name].filter(Boolean).join(" ") }));
      }}
      onSelect={(o: MasterOption) => {
        // Unavailable options cannot be chosen in the list; this is a last guard should one ever
        // arrive here: explain, keep the current selection.
        if (o.unavailable) { toast.error(o.unavailableDetail ?? o.unavailable); return; }
        onPick(Number(o.id));
      }}
      onClear={onClear}
    />
  );
}
