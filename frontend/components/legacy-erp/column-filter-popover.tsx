"use client";

// Shared Excel-style column-header filter — the funnel icon any ReportGrid/WorklistTable header
// renders for a `filterable` column (see hooks/use-column-filters.ts's own top comment for the
// shared state/matching logic this popover is purely a UI layer over). One implementation for
// every grid in the app, not a per-screen filter control.
//
// "select" (default) — an Excel-style searchable checkbox list over distinct values; covers text,
// code/name, and enum/status/boolean columns alike (a boolean's own filterValue just returns
// "Yes"/"No", so it renders here as a 2-option select — no separate boolean UI needed).
// "number"/"date" — a min/max range control instead of an unbounded checkbox list.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnFilterState, ColumnFilterType } from "@/hooks/use-column-filters";

interface Props {
  label: string;
  type?: ColumnFilterType;
  /** "select" type only — distinct values currently present in the loaded rows. */
  options?: string[];
  value: ColumnFilterState;
  onChange: (next: ColumnFilterState) => void;
}

function isActive(v: ColumnFilterState): boolean {
  return !!(v.values?.size || v.min || v.max);
}

export function ColumnFilterPopover({ label, type = "select", options = [], value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Local draft for the range inputs — only committed to `onChange` on Apply, so partially typing
  // "10" while aiming for "100" doesn't filter the grid mid-keystroke.
  const [draftMin, setDraftMin] = useState(value.min ?? "");
  const [draftMax, setDraftMax] = useState(value.max ?? "");

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const active = isActive(value);
  const selected = value.values ?? new Set<string>();

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange({ values: next });
  };

  const applyRange = () => onChange({ min: draftMin || undefined, max: draftMax || undefined });
  const clearRange = () => { setDraftMin(""); setDraftMax(""); onChange({}); };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) { setSearch(""); setDraftMin(value.min ?? ""); setDraftMax(value.max ?? ""); }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          title={active ? `${label} — filtered` : `Filter ${label}`}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted",
            active && "text-primary",
          )}
        >
          <Filter className="h-3 w-3" fill={active ? "currentColor" : "none"} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {type === "select" ? (
          <>
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${label}...`}
                  className="h-7 pl-7 text-xs"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => onChange({ values: new Set(options) })}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => onChange({})}>
                  Clear
                </Button>
              </div>
              {active && <Badge variant="secondary" className="h-5 text-[11px] font-normal">{selected.size}</Badge>}
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">No values found.</p>
              ) : (
                filteredOptions.map((v) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60">
                    <Checkbox checked={selected.has(v)} onCheckedChange={() => toggle(v)} />
                    <span className="truncate">{v}</span>
                  </label>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2 p-2.5">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{type === "date" ? "From" : "Min"}</label>
              <Input
                type={type === "date" ? "date" : "number"}
                value={draftMin}
                onChange={(e) => setDraftMin(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{type === "date" ? "To" : "Max"}</label>
              <Input
                type={type === "date" ? "date" : "number"}
                value={draftMax}
                onChange={(e) => setDraftMax(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={clearRange}>Clear</Button>
              <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => { applyRange(); setOpen(false); }}>Apply</Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
