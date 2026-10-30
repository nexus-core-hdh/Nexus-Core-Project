// Order Manufacturing Entry's Process dropdown options (from orderManufacturing.processes).

type Proc = { code: string | null; name: string | null };
type Allowed = {
  restricted: boolean;
  processes: (Proc & { id: number })[];
  routeProcesses: { routeProcess: { id: string; code: string; name: string }; legacy: (Proc & { id: number }) | null; problem: string | null }[];
  diagnostics: string[];
};
export type ProcessOption = { id: number | string; code: string | null; name: string; unavailable?: string; unavailableDetail?: string };

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
    // The position on the Route (before any search filter) keeps an unlinked option's id stable while typing.
    .map((r, routeIndex) => ({ r, routeIndex }))
    .filter(({ r }) => !q || [r.routeProcess.code, r.routeProcess.name, r.legacy?.code, r.legacy?.name].some((v) => (v ?? "").toLowerCase().includes(q)))
    .map(({ r, routeIndex }) => r.legacy && !r.problem
      ? { id: r.legacy.id, code: r.legacy.code, name: label(r.legacy) }
      : {
          // The process name once; a short reason on the row, the backend's full explanation on hover.
          id: `route:${r.routeProcess.id}:${routeIndex}`, code: r.routeProcess.code, name: label(r.routeProcess),
          unavailable: r.problem === "linked-process-missing" ? "Link broken" : "Not linked",
          unavailableDetail: allowed.diagnostics.find((d) => d.includes(label(r.routeProcess))) ?? `${label(r.routeProcess)} cannot be recorded here yet.`,
        });
}
