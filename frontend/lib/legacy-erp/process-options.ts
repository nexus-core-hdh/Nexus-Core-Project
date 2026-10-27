// Order Manufacturing Entry's Process dropdown options (from orderManufacturing.processes).

type Proc = { code: string | null; name: string | null };
type Allowed = {
  restricted: boolean;
  processes: (Proc & { id: number })[];
  routeProcesses: { routeProcess: { id: string; code: string; name: string }; legacy: (Proc & { id: number }) | null; problem: string | null }[];
  diagnostics: string[];
};
export type ProcessOption = { id: number | string; code: string | null; name: string; unavailable?: string };

const label = (p: Proc) => [p.code, p.name].filter(Boolean).join(" ");

/** The typed search: code or name contains, case-insensitive (the master lookup's own matching). */
export function filterProcesses<P extends Proc>(list: P[], term?: string): P[] {
  const q = (term ?? "").trim().toLowerCase();
  return q ? list.filter((p) => [p.code, p.name].some((v) => (v ?? "").toLowerCase().includes(q))) : list;
}

/**
 * The options: with a Route, every one of its processes in route order — a linked one as the legacy
 * process it is recorded under ("12 Sewing"), one without a legacy process kept (never dropped) but
 * marked `unavailable` with its reason, so selecting it explains instead of recording. Without a
 * Route, every process (unchanged).
 */
export function processOptions(allowed: Allowed, term?: string): ProcessOption[] {
  if (!allowed.restricted) return filterProcesses(allowed.processes, term).map((p) => ({ id: p.id, code: p.code, name: label(p) }));
  const q = (term ?? "").trim().toLowerCase();
  return allowed.routeProcesses
    .filter((r) => !q || [r.routeProcess.code, r.routeProcess.name, r.legacy?.code, r.legacy?.name].some((v) => (v ?? "").toLowerCase().includes(q)))
    .map((r, i) => r.legacy && !r.problem
      ? { id: r.legacy.id, code: r.legacy.code, name: label(r.legacy) }
      : {
          id: `route:${r.routeProcess.id}:${i}`, code: r.routeProcess.code, name: `${label(r.routeProcess)} — not linked to a legacy process`,
          unavailable: allowed.diagnostics.find((d) => d.includes(label(r.routeProcess))) ?? `${label(r.routeProcess)} cannot be recorded here yet.`,
        });
}
