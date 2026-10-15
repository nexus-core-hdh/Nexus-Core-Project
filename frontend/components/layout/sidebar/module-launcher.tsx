"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "@/lib/app-navigation";
import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  Calculator,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileSignature,
  FileText,
  FolderOpen,
  Hash,
  LayoutDashboard,
  ListTree,
  MessageSquare,
  Package,
  Palette,
  Receipt,
  Ruler,
  Scale,
  Scaling,
  Scissors,
  Settings,
  Shield,
  Shirt,
  ShoppingCart,
  SlidersHorizontal,
  Spool,
  Truck,
  Undo2,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useGlobalScreenSearch } from "@/hooks/use-global-screen-search";
import { searchKeywordsFor } from "@/lib/search/screen-index";
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

// Many menu rows (mostly submenu leaves) carry no icon of their own. Pick one from the screen's
// title so every launcher row gets a meaningful icon; first matching rule wins, so more specific
// keywords come before generic ones ("purchase return" before "purchase", "receipt").
const TITLE_ICON_RULES: [RegExp, LucideIcon][] = [
  [/dashboard|overview/, LayoutDashboard],
  [/return/, Undo2],
  [/transfer/, ArrowLeftRight],
  [/planning|schedule|calendar/, CalendarRange],
  [/recipe/, BookOpen],
  [/requirement|demand/, ClipboardList],
  [/yarn/, Spool],
  [/fabric|trim/, Shirt],
  [/cutting/, Scissors],
  [/costing|cost|price|pricing/, Calculator],
  [/contract/, FileSignature],
  [/manufactur|production|subcontract|outside process/, Factory],
  [/purchase|order/, ShoppingCart],
  [/receipt|invoice|bill/, Receipt],
  [/payment|account|ledger|bank|finance|cash|journal/, Banknote],
  [/warehouse/, Warehouse],
  [/inventory|stock|item/, Boxes],
  [/package|packing/, Package],
  [/shipment|delivery|logistic/, Truck],
  [/size|measurement/, Scaling],
  [/unit/, Ruler],
  [/color|colour/, Palette],
  [/serial|number/, Hash],
  [/weight|gsm/, Scale],
  [/approval|quality|inspection|check/, ClipboardCheck],
  [/customer|contact|lead|user|employee|team|people/, Users],
  [/company|branch|workplace/, Building2],
  [/permission|role|security/, Shield],
  [/report|statement|analytics|chart/, BarChart3],
  [/parameter|setting|config/, SlidersHorizontal],
  [/master|lookup|type|category/, ListTree],
  [/message|chat|mail/, MessageSquare],
  [/file|document|docket/, FolderOpen],
  [/\bai\b|assistant/, Bot],
  [/admin/, Settings],
];

function inferIcon(title: string): LucideIcon | undefined {
  const t = title.toLowerCase();
  return TITLE_ICON_RULES.find(([pattern]) => pattern.test(t))?.[1];
}

function buildSections(group: NavGroup): LauncherSection[] {
  const sections: LauncherSection[] = [];
  const general: LauncherRow[] = [];

  // Icon resolution: the menu row's own icon, else one inferred from its title, else the nearest
  // parent's icon, else a generic document icon — never an empty or placeholder icon.
  const flattenRows = (items: NavItem[], prefix: string, parentIcon?: NavItem["icon"]): LauncherRow[] => {
    const rows: LauncherRow[] = [];
    for (const item of items) {
      const icon = item.icon ?? inferIcon(item.title) ?? parentIcon ?? FileText;
      if (item.href && item.href !== "#" && !item.isComing) {
        rows.push({
          key: item.href,
          title: prefix ? `${prefix}${item.title}` : item.title,
          href: item.href,
          icon,
          isNew: item.isNew,
          isDataBadge: item.isDataBadge,
        });
      }
      if (item.items?.length) {
        rows.push(...flattenRows(item.items, `${prefix}${item.title} / `, item.icon ?? parentIcon));
      }
    }
    return rows;
  };

  for (const item of group.items) {
    if (item.isComing) continue;
    if (item.items?.length) {
      const rows = dedupeByHref(flattenRows(item.items, "", item.icon));
      if (rows.length > 0) sections.push({ key: item.title, title: item.title, rows });
    } else if (item.href && item.href !== "#") {
      const icon = item.icon ?? inferIcon(item.title) ?? FileText;
      general.push({ key: item.href, title: item.title, href: item.href, icon, isNew: item.isNew, isDataBadge: item.isDataBadge });
    }
  }

  if (general.length > 0) sections.unshift({ key: "__general", title: null, rows: dedupeByHref(general) });
  return sections;
}

/**
 * Whether a menu href is the screen currently open. Several screens share one path and differ
 * only by query (e.g. inventory receipts `?type=2`, `?type=122`), so every query param in the
 * href must also match the current URL, not just the path.
 */
function isCurrentRoute(href: string, pathname: string, search: string): boolean {
  const [path, query] = href.split("?");
  if (path !== pathname) return false;
  if (!query) return true;
  const current = new URLSearchParams(search);
  for (const [key, value] of new URLSearchParams(query)) {
    if (current.get(key) !== value) return false;
  }
  return true;
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
  const { groups, refresh } = useGlobalScreenSearch();

  // Re-read the menu each time the launcher opens (previous rows stay listed meanwhile), so a
  // screen added to the menu since the page loaded shows up without a full reload.
  useEffect(() => {
    if (open) refresh();
    else setQuery("");
  }, [open, refresh]);

  // Read when the dialog opens: workspace tabs update the URL via history.replaceState, which
  // usePathname tracks but this component does not otherwise re-render for.
  const currentSearch = useMemo(
    () => (open && typeof window !== "undefined" ? window.location.search : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, pathname]
  );

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
        className="top-[10%] max-h-[80vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-5xl"
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
          <CommandList className="max-h-[65vh] px-1 py-2">
            <CommandEmpty>No matching screens found.</CommandEmpty>
            {sections.map((section) => (
              <CommandGroup
                key={section.key}
                heading={section.title ?? undefined}
                className="pb-4 [&_[cmdk-group-heading]]:pb-2.5 [&_[cmdk-group-heading]]:text-primary/70 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
              >
                {/* A thin left connector under a titled (submodule) section only — makes the
                    parent-heading -> child-rows relationship visible without extra markup depth;
                    the unlabeled "general" section (standalone screens, no submodule) stays flush.
                    Rows flow into 2 columns (3 on wide screens) so the dialog's width is used. */}
                <div className={cn("grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3", section.title && "ml-2 border-l pl-2")}>
                  {section.rows.map((row) => {
                    const RowIcon = row.icon;
                    const isActive = isCurrentRoute(row.href, pathname, currentSearch);
                    return (
                      <CommandItem
                        key={row.key}
                        value={row.title}
                        keywords={searchKeywordsFor(row.href)}
                        onSelect={() => select(row)}
                        onDoubleClick={() => select(row)}
                        className={cn("min-w-0 py-2.5", isActive && "bg-primary/8 text-foreground font-medium")}
                      >
                        {RowIcon && <RowIcon className={cn("text-muted-foreground/70", isActive && "text-primary")} />}
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
