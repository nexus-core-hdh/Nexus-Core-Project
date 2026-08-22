"use client";

import { useEffect, useState } from "react";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Extracted verbatim from purchase-order-line-grid.tsx (the original owner of this component)
// so Inventory Receipt's own Code field can reuse the EXACT same autocomplete/search
// implementation instead of a second one — see inventory-receipt-line-grid.tsx's own Code cell
// for the other consumer. Purchase Order was updated to import from here too; behavior is
// byte-for-byte unchanged, this is a pure "give the shared component its own file" move.
//
// Same style constant both grids already declare locally under the name EDITOR_CONTROL —
// duplicated here (not imported from either grid file) so this component has zero dependency
// on either screen's own module, which is what makes it safely shared in the first place.
const EDITOR_CONTROL = "h-full! w-full min-w-0 rounded-none border-0 bg-background px-3.5 text-[13px] font-medium shadow-none focus-visible:ring-0";

export interface AutocompleteOption {
  id: string;
  code?: string | null;
  name?: string | null;
}

// Generic free-text-with-suggestions editor — same primary control as the Code field (a real
// typable EditableGridInput, not a button that opens a picker), plus a lightweight suggestions
// list that appears while typing. Unlike every forced-selection lookup in these grids, the typed
// text is never rejected: closing without picking a suggestion just keeps whatever was typed.
// Built generic on purpose (options + onCommit are the only per-field pieces) so any field in
// any grid reuses this exact component — only the data source changes, never the UI or the
// interaction model.
//
// Matching CONTAINS anywhere in the string (not just a prefix) and case-insensitive throughout
// — "verify-me" matches "v", "ify", "me", "fy", "ABC"/"abc"/"AbC" all match identically, since
// both the query and the candidate text are lower-cased before the same String.includes() check.
export function AutocompleteTextCell({
  value, options, disabled, autoFocus, showDropdownIcon, startOpen = true, onChange, onCommit, onCancel, onSelectOption, onDoubleClick,
}: {
  value: string;
  options: AutocompleteOption[];
  disabled?: boolean;
  autoFocus?: boolean;
  // Purely visual — a chevron affordance so a searchable text field still reads as "this opens
  // a list" at a glance, the same way every shadcn Select in these grids already does. Opt-in
  // per field (currently just Code/"Inventory selector") rather than automatic, so it doesn't
  // silently change the look of every other field built on this same component.
  showDropdownIcon?: boolean;
  // Every existing consumer only ever mounts this component for the one cell currently being
  // edited (click-to-edit grids), so defaulting to an already-open suggestion list is correct
  // there. A consumer that mounts this permanently (no separate static/editing mode) needs the
  // list closed until the user actually interacts — startOpen={false} opts into that without
  // changing behavior for any existing caller.
  startOpen?: boolean;
  onChange: (v: string) => void;
  onCommit: (finalValue: string) => void;
  onCancel: () => void;
  // Fired instead of onCommit when the user explicitly picks a suggestion (click, or Enter/Tab
  // while a suggestion is highlighted) — hands back the full matched record (id/code/name, and
  // whatever else the caller's own datasource carries) instead of just the display string, for
  // fields whose selection needs to resolve more than one value onto the row (Code sets
  // inventoryId/sourceType/stockOnHand together, not just its own text). Fields that only ever
  // need the label text (Color, Variant) simply omit it and keep using onCommit.
  onSelectOption?: (option: AutocompleteOption) => void;
  onDoubleClick?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [highlighted, setHighlighted] = useState(0);
  const q = value.trim().toLowerCase();
  // Matches Code AND Name (not just whichever of the two happens to be non-empty) — fields
  // built on this component may bind either one as the primary searchable value (e.g. Name
  // search with a locked auto-filled Code), so both need to be searchable regardless of which
  // field's value is actually being typed into.
  const filtered = (q ? options.filter((o) => `${o.code ?? ""} ${o.name ?? ""}`.toLowerCase().includes(q)) : options).slice(0, 20);

  // Re-anchor the highlighted row whenever the candidate set changes (new keystroke narrows or
  // widens it) — an index left pointing past the new, shorter list would highlight nothing, or
  // Enter/Tab would silently pick the wrong row.
  useEffect(() => { setHighlighted(0); }, [q, options.length]);

  const selectSuggestion = (o: AutocompleteOption) => {
    const label = o.code || o.name || "";
    onChange(label);
    setOpen(false);
    if (onSelectOption) onSelectOption(o); else onCommit(label);
  };

  // Shared by Enter and Tab: if a suggestion is currently highlighted, picking it wins (matches
  // every native combobox); otherwise falls back to committing whatever was actually typed —
  // free text is never rejected just because nothing in the list matched it.
  const resolveHighlightedOrTyped = () => {
    setOpen(false);
    if (filtered.length && highlighted >= 0 && highlighted < filtered.length) selectSuggestion(filtered[highlighted]);
    else onCommit(value);
  };

  return (
    // Popover here is purely a portaling/positioning mechanism (PopoverAnchor + PopoverContent,
    // no PopoverTrigger) — the visible control is still a plain input, matching Code exactly.
    // A plain absolutely-positioned div would get silently clipped by the grid's own scrolling
    // container whenever the active row is near the bottom of the visible area; portaling the
    // suggestion list to the document root (what Popover already does for every other lookup in
    // these grids) avoids that without changing what the field looks like at rest.
    <Popover open={open && filtered.length > 0}>
      {/* No `asChild` here — EditableGridInput isn't ref-forwarding (it's a plain function
          component, same as everywhere else it's used in the app), so Radix couldn't measure
          it directly for positioning. Anchor's own default wrapper element does the measuring
          instead; the input renders as its normal child, unaffected either way. */}
      <PopoverAnchor className="relative block h-full w-full">
        <EditableGridInput
          autoFocus={autoFocus}
          value={value}
          disabled={disabled}
          onChange={(v) => { onChange(v); setOpen(true); }}
          onBlur={() => { setOpen(false); onCommit(value); }}
          onDoubleClick={onDoubleClick}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); onCancel(); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlighted((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0))); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); return; }
            // Enter/Tab resolve immediately (same net effect as blur) rather than routing
            // through the grid's shared handleEditorKeyDown — that helper calls persistRow
            // synchronously off the row's current state, but resolving a brand-new typed value
            // (or a picked suggestion) can mean an async "create the master record" call first
            // (see Color's own wiring in purchase-order-line-grid.tsx); committing here
            // guarantees the row's real FK is set before anything tries to save it.
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); resolveHighlightedOrTyped(); }
          }}
          className={cn(EDITOR_CONTROL, showDropdownIcon && "pr-7")}
        />
        {showDropdownIcon && (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        )}
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={1}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The bare `w-[--radix-popover-trigger-width]` form never actually applied under
        // Tailwind v4 — v4 treats a bracketed arbitrary value as a literal raw value, not an
        // implicit var(...) wrap (that shorthand is v3-only); an explicit var(...) is required,
        // which is why every suggestion popup used to silently ignore the trigger width and
        // just grow to fit its longest suggestion's own text width instead of matching the
        // cell it belongs to.
        className="w-[var(--radix-popover-trigger-width)] max-h-44 overflow-y-auto p-1"
      >
        <div role="listbox">
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => selectSuggestion(o)}
              className={cn("block w-full truncate rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-accent", i === highlighted && "bg-accent")}
            >
              {o.code ? `${o.code} - ${o.name}` : o.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
