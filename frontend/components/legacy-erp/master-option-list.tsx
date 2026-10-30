// The dropdown list of MasterAutocompleteField and the rules for which option a key/blur commits.
// Kept apart from the field (no API / workspace imports) so the rules and the rendering are testable
// on their own — see scripts/om-process-route.test.mjs.

import { cn } from "@/lib/utils";

/** `unavailable` (a short reason, shown on the row) marks an option that is listed but cannot be
 *  chosen, e.g. a Route process with no linked legacy process on Order Manufacturing Entry;
 *  `unavailableDetail` is the full explanation, shown on hover. */
export interface MasterOption { id: number | string; code?: string | null; name: string; unavailable?: string; unavailableDetail?: string }

const selectable = (o: MasterOption | undefined): o is MasterOption => !!o && !o.unavailable;

/** Index of the first option that can be chosen, or -1 when none can. */
export function firstSelectable(options: MasterOption[]): number {
  return options.findIndex((o) => selectable(o));
}

/** Arrow Up/Down from `from`: the next option that can be chosen in that direction, else stay put. */
export function stepHighlight(options: MasterOption[], from: number, direction: 1 | -1): number {
  for (let i = from + direction; i >= 0 && i < options.length; i += direction) if (selectable(options[i])) return i;
  return from;
}

/** An option whose Name is exactly `query` (any case) — never an unavailable one. */
export function exactMatch(options: MasterOption[], query: string): MasterOption | undefined {
  const q = query.trim().toLowerCase();
  return q ? options.find((o) => selectable(o) && o.name.trim().toLowerCase() === q) : undefined;
}

/** What Enter / Tab commits: an exact Name match, else the highlighted option — only if it can be chosen. */
export function commitCandidate(options: MasterOption[], highlight: number, query: string): MasterOption | undefined {
  const picked = exactMatch(options, query) ?? options[highlight];
  return selectable(picked) ? picked : undefined;
}

export function MasterOptionList({ options, highlight, onChoose, renderOption }: {
  options: MasterOption[];
  highlight: number;
  onChoose: (o: MasterOption) => void;
  renderOption?: (o: MasterOption) => React.ReactNode;
}) {
  return (
    <div role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
      {options.map((o, i) =>
        o.unavailable ? (
          <div
            key={`${o.id}:${i}`} role="option" aria-selected={false} aria-disabled="true"
            title={o.unavailableDetail ?? o.unavailable} aria-label={`${o.name} — ${o.unavailableDetail ?? o.unavailable}`}
            // Keeps focus in the field and the list open — nothing to choose here.
            onMouseDown={(e) => e.preventDefault()}
            className="flex w-full cursor-not-allowed items-center justify-between gap-2 px-3 py-2 text-left text-sm text-muted-foreground"
          >
            <span className="truncate">{o.name}</span>
            <span className="shrink-0 rounded border border-border px-1.5 text-[10.5px] leading-4">{o.unavailable}</span>
          </div>
        ) : (
          <button
            key={`${o.id}:${i}`} type="button" role="option" aria-selected={i === highlight}
            // onMouseDown (not onClick) fires before the input's onBlur close-timer, so the
            // option is still mounted and its data still read before the dropdown closes.
            onMouseDown={(e) => { e.preventDefault(); onChoose(o); }}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
              i === highlight ? "bg-primary/10 text-primary" : "hover:bg-muted"
            )}
          >
            {renderOption ? renderOption(o) : <span className="truncate">{o.name}</span>}
          </button>
        )
      )}
    </div>
  );
}
