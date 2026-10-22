import type { LucideIcon } from "lucide-react";
import type { NavGroup, NavItem } from "@/components/layout/sidebar/nav-main";

// A single searchable, navigable screen — the flattened, framework-agnostic
// unit the Global Screen Search operates on. Deliberately decoupled from
// NavItem/NavGroup so the search framework doesn't care where its data came
// from; today it's the live MenuItem menu tree, but any future source that
// can produce ScreenEntry[] plugs in without touching the search UI.
export interface ScreenEntry {
  id: string;
  title: string;
  href: string;
  icon?: LucideIcon;
  moduleTitle: string;
  isNew?: boolean;
  isDataBadge?: string;
  /** Extra search terms (synonyms) the palette also matches — see SCREEN_SEARCH_KEYWORDS. */
  keywords?: string[];
}

/**
 * Search synonyms for screens whose menu title alone doesn't carry every term users search by.
 * Keyed by the screen's menu href (the menu itself — MenuItem / GET /menu-items — stays the only
 * registry of screens; this only adds alternative words to an existing entry, never an entry).
 */
export const SCREEN_SEARCH_KEYWORDS: Record<string, string[]> = {
  // Legacy name of the same documents (IM_PackagingList / IM_Packaging).
  "/legacy-erp/packing-lists-list": ["packing", "packing list", "packaging"],
  // Cutting Entry (./entry) opens from this screen for one Work Order + Production Color.
  "/legacy-erp/cutting-card": ["cutting", "cutting entry", "cut"],
};

export const searchKeywordsFor = (href: string): string[] => SCREEN_SEARCH_KEYWORDS[href] ?? [];

/**
 * Flattens the menu tree (the exact same NavGroup[] shape the sidebar renders,
 * produced by `transformMenuItem` from the live `GET /menu-items` response)
 * into a flat list of navigable screens. Excludes group/parent headers with no
 * real destination (`href === "#"`) and screens marked `isComing` (not yet
 * implemented, so not a real destination to search to). Every leaf keeps the
 * top-level group's title as its `moduleTitle`, matching how the menu itself
 * organizes screens into modules (Legacy ERP, PLM, CRM, ...).
 */
export function flattenMenuTree(groups: NavGroup[]): ScreenEntry[] {
  const entries: ScreenEntry[] = [];

  const visit = (items: NavItem[], moduleTitle: string) => {
    for (const item of items) {
      if (item.href && item.href !== "#" && !item.isComing) {
        entries.push({
          id: item.href,
          title: item.title,
          href: item.href,
          icon: item.icon,
          moduleTitle,
          isNew: item.isNew,
          isDataBadge: item.isDataBadge,
          keywords: searchKeywordsFor(item.href),
        });
      }
      if (item.items?.length) {
        visit(item.items, moduleTitle);
      }
    }
  };

  for (const group of groups) {
    visit(group.items, group.title);
  }

  // De-duplicate by href — the same screen can legitimately appear in more
  // than one branch of the tree (e.g. surfaced both at top level and inside a
  // sub-group); the palette should only ever list it once.
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.href) ? false : (seen.add(e.href), true)));
}
