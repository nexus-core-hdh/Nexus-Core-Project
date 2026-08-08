"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandIcon, SearchIcon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useGlobalScreenSearch } from "@/hooks/use-global-screen-search";
import type { ScreenEntry } from "@/lib/search/screen-index";

// Wraps the substring of `text` that matches `query` (case-insensitive) in a
// <mark> so the palette visually confirms why a result matched.
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 text-foreground">{text.slice(idx, idx + trimmed.length)}</mark>
      {text.slice(idx + trimmed.length)}
    </>
  );
}

/**
 * The Global Screen Search: a Ctrl+K / Ctrl+Shift+P command palette that
 * searches every screen the current user has permission to access, across
 * the entire ERP — not a page-specific feature. Data comes from the same
 * live menu tree the sidebar renders (see hooks/use-global-screen-search.ts),
 * so adding a future screen to the menu automatically makes it searchable
 * here with zero additional code. Navigation goes through the same
 * `navigateOrOpenTab` the sidebar uses, so results already open inside the
 * Workspace Tab Bar when the target is a registered workspace module, and
 * fall back to normal routing otherwise — no extra wiring needed here either.
 *
 * Self-contained and reusable: drop <GlobalScreenSearch /> anywhere and it
 * brings its own trigger UI, keyboard shortcuts, and dialog.
 */
export function GlobalScreenSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { entries, loading, ensureLoaded } = useGlobalScreenSearch();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.metaKey || e.ctrlKey;
      if (isCtrlOrCmd && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === "p") {
        // Optional VS Code-style alias for the same palette.
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) ensureLoaded();
    else setQuery("");
  }, [open, ensureLoaded]);

  const groups = useMemo(() => {
    const byModule = new Map<string, ScreenEntry[]>();
    for (const entry of entries) {
      const list = byModule.get(entry.moduleTitle) ?? [];
      list.push(entry);
      byModule.set(entry.moduleTitle, list);
    }
    return Array.from(byModule.entries());
  }, [entries]);

  const select = (entry: ScreenEntry) => {
    setOpen(false);
    navigateOrOpenTab(router, entry.href);
  };

  return (
    <div className="min-w-0 lg:flex-1">
      <div className="relative hidden max-w-sm flex-1 lg:block">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          className="h-9 w-full cursor-pointer rounded-md border pr-4 pl-10 text-sm shadow-xs"
          placeholder="Search screens..."
          type="search"
          onFocus={() => setOpen(true)}
          readOnly
        />
        <div className="absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-0.5 rounded-sm bg-zinc-200 p-1 font-mono text-xs font-medium sm:flex dark:bg-neutral-700">
          <CommandIcon className="size-3" />
          <span>k</span>
        </div>
      </div>
      <div className="block lg:hidden">
        <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
          <SearchIcon />
        </Button>
      </div>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Global Screen Search"
        description="Search for any screen across the ERP"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search screens across the ERP..."
        />
        <CommandList>
          {!loading && <CommandEmpty>No matching screens found.</CommandEmpty>}
          {groups.map(([moduleTitle, items], i) => (
            <Fragment key={moduleTitle}>
              <CommandGroup heading={moduleTitle}>
                {items.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <CommandItem
                      key={entry.href}
                      value={entry.title}
                      keywords={[entry.moduleTitle]}
                      onSelect={() => select(entry)}
                    >
                      {Icon ? <Icon /> : <SearchIcon className="opacity-50" />}
                      <span className="flex-1 truncate">
                        <HighlightMatch text={entry.title} query={query} />
                      </span>
                      {entry.isNew && <Badge variant="secondary" className="h-5 text-[10px] font-normal">New</Badge>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {i < groups.length - 1 && <CommandSeparator />}
            </Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </div>
  );
}

export default GlobalScreenSearch;
