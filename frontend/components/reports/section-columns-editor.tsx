"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { ReportSectionColumnConfig, ReportSectionColumnDef } from "@/lib/nexuscore-api";

const AUTO = "auto";

/** The columns a section prints when the report has no settings for it (the catalog's defaults). */
export const defaultSectionColumns = (defs: ReportSectionColumnDef[]): ReportSectionColumnConfig[] =>
  defs.filter((d) => d.defaultVisible).map((d) => ({ key: d.key }));

/**
 * The columns of one document section (e.g. the Order Form's Fabric Recipe Detail): which to
 * print and in which order, each with its own label, width (characters), alignment, decimals
 * (number columns) and visibility. `value` undefined = the section's default columns; the first
 * change saves an explicit list. Only columns in the section's catalog (`defs`) can be added.
 */
export function SectionColumnsEditor({ defs, value, onChange }: {
  defs: ReportSectionColumnDef[];
  value: ReportSectionColumnConfig[] | undefined;
  onChange: (next: ReportSectionColumnConfig[] | undefined) => void;
}) {
  const list = value ?? defaultSectionColumns(defs);
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const available = defs.filter((d) => !list.some((x) => x.key === d.key));
  const set = (next: ReportSectionColumnConfig[]) => onChange(next);
  const update = (i: number, patch: Partial<ReportSectionColumnConfig>) =>
    set(list.map((x, idx) => {
      if (idx !== i) return x;
      const merged: ReportSectionColumnConfig = { ...x, ...patch };
      // Blank settings are stored as absent, so the saved JSON only carries real choices.
      (Object.keys(merged) as (keyof ReportSectionColumnConfig)[]).forEach((k) => {
        if (k !== "key" && (merged[k] === undefined || merged[k] === "" || merged[k] === false)) delete merged[k];
      });
      return merged;
    }));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set(next);
  };
  const visibleCount = list.filter((x) => !x.hidden).length;

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {value ? `${visibleCount} of ${list.length} columns visible` : "Default columns"} · printed left to right in this order
        </p>
        <div className="flex items-center gap-1.5">
          <AddColumn available={available} onAdd={(key) => set([...list, { key }])} />
          {value && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(undefined)} title="Back to the section's default columns">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />Default
            </Button>
          )}
        </div>
      </div>
      <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_6rem_5rem_auto] gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
        <span /><span>Column / label</span><span>Width</span><span>Align</span><span>Decimals</span><span />
      </div>
      {list.map((x, i) => {
        const def = defByKey.get(x.key);
        if (!def) return null;
        const isNumber = def.type === "number";
        return (
          <div key={x.key} className={cn("grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-1.5 rounded border bg-background px-1 py-1 md:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_6rem_5rem_auto]", x.hidden && "opacity-60")}>
            <Button
              variant="ghost" size="icon" className="h-6 w-6" onClick={() => update(i, { hidden: !x.hidden })}
              aria-label={x.hidden ? "Show column" : "Hide column"} title={x.hidden ? "Hidden — click to show" : "Visible — click to hide"}
              disabled={!x.hidden && visibleCount <= 1}
            >
              {x.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <div className="min-w-0">
              <Input
                value={x.label ?? ""} placeholder={def.label} disabled={def.labelEditable === false}
                onChange={(e) => update(i, { label: e.target.value })} className="h-7 text-xs"
                title={def.labelEditable === false ? "Headings come from the Work Order's sizes" : undefined}
              />
            </div>
            <Input
              type="number" min={3} max={80} value={x.width ?? ""} placeholder="Auto" className="h-7 text-xs" title="Width in characters (blank = automatic)"
              onChange={(e) => update(i, { width: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
            <Select value={x.align ?? AUTO} onValueChange={(v) => update(i, { align: v === AUTO ? undefined : (v as ReportSectionColumnConfig["align"]) })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Auto</SelectItem>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
            {isNumber ? (
              <Select value={x.decimals != null ? String(x.decimals) : AUTO} onValueChange={(v) => update(i, { decimals: v === AUTO ? undefined : Number(v) })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Auto</SelectItem>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <span className="text-center text-[11px] text-muted-foreground">—</span>}
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move column up"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move column down"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6" aria-label="Remove column"
                disabled={!x.hidden && visibleCount <= 1} onClick={() => set(list.filter((_, idx) => idx !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { string: "Text", number: "Number", date: "Date", boolean: "Yes/No" };

/** Searchable list of the section's columns not in it yet (hidden ones count as in it). */
function AddColumn({ available, onAdd }: { available: ReportSectionColumnDef[]; onAdd: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!available.length} title={available.length ? undefined : "Every column of this section is already in the list"}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add column{available.length ? ` (${available.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList className="max-h-72">
            <CommandEmpty>No column matches.</CommandEmpty>
            <CommandGroup heading="Available columns">
              {available.map((d) => (
                <CommandItem key={d.key} value={`${d.label} ${d.key}`} onSelect={() => { onAdd(d.key); setOpen(false); }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{d.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{d.key}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{TYPE_LABEL[d.type] ?? d.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
