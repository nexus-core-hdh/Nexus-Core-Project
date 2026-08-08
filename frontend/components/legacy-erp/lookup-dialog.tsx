"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

// Generic, reusable "search and pick a record" popup for legacy-erp master screens
// (Customer, Style Group, Brand, Style Department, and future lookup fields). No screen-
// specific logic lives here — callers supply how to fetch/label/identify their own records.
export interface LookupDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fetchOptions: (search: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  getValue: (item: T) => string | number;
  onSelect: (item: T) => void;
}

export function LookupDialog<T>({ open, onOpenChange, title, fetchOptions, getLabel, getValue, onSelect }: LookupDialogProps<T>) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setSearch(""); setOptions([]); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetchOptions(search);
        if (!cancelled) setOptions(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title} description={`Search ${title}`}>
      <CommandInput placeholder={`Search ${title}...`} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>{loading ? "Searching..." : "No results found."}</CommandEmpty>
        <CommandGroup heading={title}>
          {options.map((item) => (
            // value drives cmdk's own client-side fuzzy match on top of our server-side
            // search — must be the searchable label, not the id, or every result gets
            // filtered out the moment the typed text doesn't literally match the id.
            <CommandItem
              key={getValue(item)}
              value={getLabel(item)}
              onSelect={() => { onSelect(item); onOpenChange(false); }}
            >
              {getLabel(item)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
