"use client";

import { useEffect, useRef, useState } from "react";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Search, TriangleAlert } from "lucide-react";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useMasterLookupField } from "@/hooks/use-master-lookup-field";
import { FieldLabel, spanClass, type FormFieldSpan } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";

export interface MasterOption { id: number | string; code?: string | null; name: string }

interface Props {
  label: string;
  /** Config key from legacy-master-lookup.service.ts's TABLES map (e.g. "fabric"). */
  masterKey: string;
  /** Resolved display Name for the currently stored id — see requirement #10: the field
   *  shows only the Name, the id/code are stored internally via onSelect. */
  displayValue: string;
  onSelect: (o: MasterOption) => void;
  /** Called the instant the textbox becomes empty — the caller must clear its stored
   *  id/code (e.g. `set("fabricTypeId", "")`) so `displayValue` comes back empty too on the
   *  next render. Without this, the field's own re-sync effect (which exists to pick up
   *  externally-changed values, e.g. loading a different record) has nothing to sync FROM
   *  but the stale old value, and silently restores it — that was the bug. */
  onClear?: () => void;
  span?: FormFieldSpan;
  /** Override for the type-ahead search call — defaults to legacyErpApi.lookupTable(masterKey,
   *  term). Set when a field's data source is a dedicated existing module's own search API
   *  instead of the generic Master Lookup picker (e.g. Yarn Count reuses legacyErpApi.yarnCards.list). */
  fetchOptions?: (term: string) => Promise<MasterOption[]>;
  /** Override for which Workspace screen F2/the search icon opens — see useMasterLookupField's
   *  `path` param. Defaults to the generic Master Lookup screen. */
  lookupPath?: string;
}

/**
 * The reusable field-level integration for any Master Lookup-backed FK field (Fabric
 * Card's "FabType" today) — a professional ERP searchable combo box (SAP/Dynamics style):
 *  - Contains-match, case-insensitive autocomplete while typing (backend ILIKE %term%
 *    already does both — see legacy-master-lookup.service.ts's search()), navigable with
 *    Arrow Up/Down, and selectable via mouse click, Enter, or Tab.
 *  - Typing an exact Name match (any case) and then committing (blur/Enter/Tab) auto-binds
 *    that record even if the user never touched the dropdown.
 *  - Zero matches shows a small non-blocking inline notice instead of blocking the user.
 *  - F2 / the search icon opens the FULL "Master Lookup" Workspace screen as a real tab
 *    (never a modal) via useMasterLookupField (see hooks/use-master-lookup-field.ts) — the
 *    reusable "open + receive a selection back" behavior shared by every such field. Only
 *    the id/code are stored in form state; the field itself only ever displays the Name.
 */
export function MasterAutocompleteField({ label, masterKey, displayValue, onSelect, onClear, span = "normal", fetchOptions, lookupPath }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Internal state must always be a string — never null/undefined. displayValue is typed as
  // `string`, but callers resolve it from data that can legitimately be null (a nullable DB
  // column, an unresolved lookup) before TypeScript ever sees it, so this is the one place
  // that normalizes it before it ever reaches a controlled <input>'s value prop.
  const [query, setQuery] = useState(displayValue ?? "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MasterOption[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [searched, setSearched] = useState(false);

  useEffect(() => { if (!open) setQuery(displayValue ?? ""); }, [displayValue, open]);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const runSearch = async (term: string) => {
    try {
      const r = fetchOptions ? await fetchOptions(term) : await legacyErpApi.lookupTable(masterKey as any, term);
      setOptions(Array.isArray(r) ? (r as MasterOption[]) : []);
      setHighlight(0);
      setSearched(true);
    } catch {
      setOptions([]);
      setSearched(true);
    }
  };

  // Display Name only — the id (and code, if the table has one) are handed to onSelect for
  // the caller to store, never shown here (requirement #10).
  const choose = (o: MasterOption) => {
    onSelect(o);
    setQuery(o.name ?? "");
    setOpen(false);
  };


  const { openFullScreen } = useMasterLookupField(masterKey, (selection) => {
    choose({ id: selection.id, code: selection.code, name: selection.name });
    // Requirement #7 (Fab Type field spec): focus returns to this field on the Fabric Card.
    inputRef.current?.focus();
  }, lookupPath);

  // Typing the exact Name of a real record (any case) and then leaving the field — via
  // blur, Enter, or Tab — auto-binds it even if the dropdown was never touched. Runs
  // against whatever `options` the last search returned, so it only ever matches something
  // that's actually a valid, currently Active record.
  const tryExactMatch = (): MasterOption | undefined => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    return options.find((o) => o.name.trim().toLowerCase() === q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "F2") {
      e.preventDefault();
      setOpen(false);
      openFullScreen();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown") { setOpen(true); runSearch(query); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Exact Name match wins even over whatever happens to be highlighted — e.g. the user
      // typed the full name of a record that isn't first alphabetically.
      const picked = tryExactMatch() ?? options[highlight];
      if (picked) choose(picked);
    } else if (e.key === "Tab") {
      // Not preventDefault()'d — Tab should still move focus to the next field afterward,
      // this just makes sure a pending selection commits first, exactly like Enter.
      const picked = tryExactMatch() ?? options[highlight];
      if (picked) choose(picked);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(displayValue ?? "");
    }
  };

  const handleBlur = () => {
    // A real click on a dropdown option fires onMouseDown (and calls choose()) before this
    // blur runs; this only ever fires for "field lost focus with nothing explicitly picked"
    // — try to resolve an exact Name match, otherwise just close the dropdown and let
    // requirement #7's "keep typing or press F2" stand. An empty field is left empty (the
    // parent was already told to clear the moment the last character was deleted).
    if (!query.trim()) {
      blurTimer.current = setTimeout(() => setOpen(false), 150);
      return;
    }
    const picked = tryExactMatch();
    if (picked) choose(picked);
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const showNoMatch = open && searched && query.trim().length > 0 && options.length === 0;

  return (
    <div className={cn("relative space-y-2", spanClass(span))}>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup className="h-9">
        <InputGroupInput
          ref={inputRef}
          value={query ?? ""}
          placeholder="Type to Search"
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            runSearch(v);
            // The moment the box becomes empty, tell the caller to drop the bound id/code
            // right away — not deferred to blur — so nothing is ever left to "restore".
            if (!v.trim()) onClear?.();
          }}
          onFocus={() => { setOpen(true); runSearch(query); }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="text-sm"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs" type="button" aria-label={`Open ${label} master list`}
            onClick={() => { setOpen(false); openFullScreen(); }}
            title="Open full list (F2)"
          >
            <Search className="h-3.5 w-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      {open && options.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              // onMouseDown (not onClick) fires before the input's onBlur close-timer, so the
              // option is still mounted and its data still read before the dropdown closes.
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                i === highlight ? "bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
      )}

      {showNoMatch && (
        <div className="absolute z-50 mt-1 flex w-full items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>No matching {label} found. Keep typing, or press <kbd className="rounded border bg-muted px-1 font-mono">F2</kbd> to open the full list.</span>
        </div>
      )}
    </div>
  );
}
