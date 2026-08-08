"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, PinOff, Search, Star, StarOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useGlobalScreenSearch } from "@/hooks/use-global-screen-search";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";

export default function MyMenuPage() {
  const router = useRouter();
  const myMenu = useWorkspaceStore((s) => s.myMenu);
  const unpin = useWorkspaceStore((s) => s.unpin);
  const reorderMyMenu = useWorkspaceStore((s) => s.reorderMyMenu);
  const { entries, ensureLoaded } = useGlobalScreenSearch();
  const [query, setQuery] = useState("");

  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const entryByHref = useMemo(() => new Map(entries.map((e) => [e.href, e])), [entries]);

  // Permission is validated here, not just at pin-time: a favorite whose screen
  // the user has since lost access to (or that's been removed from the menu)
  // simply won't have a matching permission-filtered entry, so it's dropped
  // rather than shown.
  const items = useMemo(
    () =>
      [...myMenu]
        .sort((a, b) => a.order - b.order)
        .map((m) => ({ pin: m, entry: entryByHref.get(m.href) }))
        .filter((row): row is { pin: typeof myMenu[number]; entry: NonNullable<typeof row.entry> } => !!row.entry),
    [myMenu, entryByHref]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(({ entry }) => entry.title.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Dashboards</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">My Menu</span>
      </div>

      <div className="flex items-center gap-4 border-b pb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
          <Star className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">My Menu</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Your pinned screens, in one place</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search My Menu..."
          className="pl-9"
        />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <StarOff className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nothing pinned yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Open any screen and click the pin icon on its Workspace tab to save it here for quick access.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No pinned screens match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="divide-y rounded-xl border">
          {filtered.map(({ pin, entry }, index) => {
            const Icon = entry.icon;
            const disableUp = index === 0;
            const disableDown = index === filtered.length - 1;
            return (
              <div key={pin.key} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{entry.title}</span>
                    {entry.isNew && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">New</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{entry.moduleTitle}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Move up"
                    disabled={!!query || disableUp}
                    onClick={() => reorderMyMenu(pin.key, "up")}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Move down"
                    disabled={!!query || disableDown}
                    onClick={() => reorderMyMenu(pin.key, "down")}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Unpin"
                    onClick={() => unpin(pin.key)}
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => navigateOrOpenTab(router, entry.href)}
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
