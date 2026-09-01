"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SearchIcon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useGlobalScreenSearch } from "@/hooks/use-global-screen-search";
import type { NavGroup, NavItem } from "@/components/layout/sidebar/nav-main";

interface LauncherRow {
  key: string;
  title: string;
  href: string;
  icon?: NavItem["icon"];
  isNew?: boolean;
  isDataBadge?: string;
}

interface LauncherSection {
  key: string;
  title: string | null;
  rows: LauncherRow[];
}

// Turns a module's root items into launcher sections while preserving the
// existing menu hierarchy: a root item with children becomes a named section
// (its children — and anything nested further below them — become that
// section's rows, so the launcher stays exactly two visual levels deep no
// matter how deep the underlying menu tree goes); a root item with no
// children is itself a row, grouped under one shared, unlabeled section so
// standalone screens aren't lost.
// Keeps the first row for each href and drops the rest — a "hybrid" menu node (has its own
// href AND children, e.g. File Manager linking to the same URL as its own "Dashboard" child)
// otherwise produces two rows for the same destination: one for itself, one recursed from the
// child. Same URL twice in the launcher is redundant either way, not just a React key clash.
function dedupeByHref(rows: LauncherRow[]): LauncherRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.href)) return false;
    seen.add(row.href);
    return true;
  });
}

function buildSections(group: NavGroup): LauncherSection[] {
  const sections: LauncherSection[] = [];
  const general: LauncherRow[] = [];

  const flattenRows = (items: NavItem[], prefix: string): LauncherRow[] => {
    const rows: LauncherRow[] = [];
    for (const item of items) {
      if (item.href && item.href !== "#" && !item.isComing) {
        rows.push({
          key: item.href,
          title: prefix ? `${prefix}${item.title}` : item.title,
          href: item.href,
          icon: item.icon,
          isNew: item.isNew,
          isDataBadge: item.isDataBadge,
        });
      }
      if (item.items?.length) {
        rows.push(...flattenRows(item.items, `${prefix}${item.title} / `));
      }
    }
    return rows;
  };

  for (const item of group.items) {
    if (item.isComing) continue;
    if (item.items?.length) {
      const rows = dedupeByHref(flattenRows(item.items, ""));
      if (rows.length > 0) sections.push({ key: item.title, title: item.title, rows });
    } else if (item.href && item.href !== "#") {
      general.push({ key: item.href, title: item.title, href: item.href, icon: item.icon, isNew: item.isNew, isDataBadge: item.isDataBadge });
    }
  }

  if (general.length > 0) sections.unshift({ key: "__general", title: null, rows: dedupeByHref(general) });
  return sections;
}

interface ModuleLauncherProps {
  /** Title of the module (menu group) to display — looked up against the
   *  permission-filtered tree, so what's shown is always scoped to what this
   *  user can actually open, independent of whatever raw data the sidebar
   *  button list itself was built from. */
  groupTitle: string | null;
  /** The module's own icon (same one shown on its sidebar trigger button) — repeated in the
   *  dialog header purely for visual continuity between the rail and the launcher it opens. */
  icon?: LucideIcon;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The Global Module Launcher: opened from a sidebar module button, shows that
 * module's screens grouped exactly as the existing menu hierarchy defines
 * them (section = a root item with children, rows = its screens). Built on
 * the same Command/cmdk primitives as the Ctrl+K Global Screen Search palette
 * (components/search/global-screen-search.tsx) — search, keyboard nav
 * (arrows, Enter), and instant case-insensitive filtering all come from that
 * shared, already-proven implementation rather than a bespoke one.
 */
export function ModuleLauncher({ groupTitle, icon: Icon, open, onOpenChange }: ModuleLauncherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const { groups, ensureLoaded } = useGlobalScreenSearch();

  useEffect(() => {
    if (open) ensureLoaded();
    else setQuery("");
  }, [open, ensureLoaded]);

  const group = useMemo(() => groups.find((g) => g.title === groupTitle) ?? null, [groups, groupTitle]);
  const sections = useMemo(() => (group ? buildSections(group) : []), [group]);

  const select = (row: LauncherRow) => {
    onOpenChange(false);
    navigateOrOpenTab(router, row.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dismissOnEscape
        dismissOnOutside
        className="top-[15%] max-h-[70vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHeader className="flex-row items-center gap-2.5 space-y-0 border-b px-5 py-4">
          {Icon && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">{groupTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              Browse and open screens in the {groupTitle} module
            </DialogDescription>
          </div>
        </DialogHeader>

        <Command className="bg-transparent">
          <CommandInput placeholder="Search screens..." value={query} onValueChange={setQuery} className="h-11" />
          <CommandList className="max-h-[55vh] px-1 py-2">
            <CommandEmpty>No matching screens found.</CommandEmpty>
            {sections.map((section) => (
              <CommandGroup
                key={section.key}
                heading={section.title ?? undefined}
                className="[&_[cmdk-group-heading]]:text-primary/70 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
              >
                {/* A thin left connector under a titled (submodule) section only — makes the
                    parent-heading -> child-rows relationship visible without extra markup depth;
                    the unlabeled "general" section (standalone screens, no submodule) stays flush. */}
                <div className={cn(section.title && "ml-2 border-l pl-2")}>
                  {section.rows.map((row) => {
                    const RowIcon = row.icon;
                    const rowPath = row.href.split("?")[0];
                    const isActive = pathname === rowPath;
                    return (
                      <CommandItem
                        key={row.key}
                        value={row.title}
                        onSelect={() => select(row)}
                        onDoubleClick={() => select(row)}
                        className={cn(isActive && "bg-primary/8 text-foreground font-medium")}
                      >
                        {RowIcon ? (
                          <RowIcon className={cn("text-muted-foreground/70", isActive && "text-primary")} />
                        ) : (
                          <SearchIcon className="opacity-40" />
                        )}
                        <span className="flex-1 truncate">{row.title}</span>
                        {row.isNew && <Badge variant="secondary" className="h-5 text-[10px] font-normal">New</Badge>}
                        {row.isDataBadge && <Badge variant="outline" className="h-5 text-[10px] font-normal">{row.isDataBadge}</Badge>}
                      </CommandItem>
                    );
                  })}
                </div>
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
