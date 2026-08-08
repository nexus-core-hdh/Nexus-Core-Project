import { create } from "zustand";

import { menuItemsApi, permissionSettingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { transformMenuItem, type NavGroup, type NavItem } from "@/components/layout/sidebar/nav-main";
import { flattenMenuTree, type ScreenEntry } from "@/lib/search/screen-index";

// Matches the normalization `usePermissionCheck`/`usePermission` apply before
// calling the backend, so a batched check here resolves the exact same
// resourcePath keys a single-item check would.
function normalizeResourcePath(href: string): string {
  return href.startsWith("/dashboard/")
    ? href.replace("/dashboard/", "").replace(/\//g, ".")
    : href.replace(/\//g, ".");
}

// Prunes the raw menu tree down to only items the user is permitted to open
// (by href) — keeping a parent/section node iff it's directly permitted or at
// least one descendant is. Used by the Module Launcher, which needs the tree
// shape (sections + screens), not the flat list `entries` already provides.
function filterGroupTree(groups: NavGroup[], allowedHrefs: Set<string>): NavGroup[] {
  const filterItems = (items: NavItem[]): NavItem[] => {
    const result: NavItem[] = [];
    for (const item of items) {
      const filteredChildren = item.items ? filterItems(item.items) : undefined;
      const selfAllowed = item.href !== "#" && allowedHrefs.has(item.href);
      const hasVisibleChildren = !!filteredChildren && filteredChildren.length > 0;
      if (!selfAllowed && !hasVisibleChildren) continue;
      result.push({ ...item, items: filteredChildren });
    }
    return result;
  };
  return groups
    .map((g) => ({ ...g, items: filterItems(g.items) }))
    .filter((g) => g.items.length > 0);
}

interface ScreenIndexState {
  entries: ScreenEntry[];
  groups: NavGroup[];
  loading: boolean;
  hasLoaded: boolean;
  load: () => Promise<void>;
  invalidate: () => void;

  // The raw (not permission-filtered) flattened menu — one cheap GET /menu-items
  // call, no per-screen permission checks. A tab is only ever opened after access
  // was already confirmed (at click time, or via the permission-filtered search
  // palette), so re-verifying every screen's permission just to resolve a tab's
  // title/icon would be pure overhead — and doing it on every page load is what
  // previously saturated the connection pool. Only use this for display metadata
  // of already-open tabs, never to decide whether something is shown/authorized.
  rawEntries: ScreenEntry[];
  rawGroups: NavGroup[];
  rawLoading: boolean;
  rawLoaded: boolean;
  loadRaw: () => Promise<void>;
}

/**
 * The single shared, permission-filtered index of every screen in the ERP the
 * current user can access — the live menu tree (`GET /menu-items`, via the
 * same `transformMenuItem` the sidebar uses), both flattened (`entries`, for
 * the search palette / My Menu) and as a tree (`groups`, for the Module
 * Launcher's section grouping). Backed by Zustand (not per-component
 * `useState`) so every consumer shares one cache instead of each firing its
 * own round of checks. Use the `useGlobalScreenSearch()` hook
 * (hooks/use-global-screen-search.ts) rather than this store directly.
 *
 * Permission filtering goes through one batched `check-batch` request (not
 * one request per screen) — the backend's global rate limiter (100 req/60s,
 * shared across every endpoint) made the previous one-request-per-screen
 * design fail outright once combined with the rest of a page's normal
 * traffic, on top of it being needless network overhead for a check that's
 * currently answered the same way for every path anyway.
 */
export const useScreenIndexStore = create<ScreenIndexState>((set, get) => ({
  entries: [],
  groups: [],
  loading: false,
  hasLoaded: false,

  load: async () => {
    if (get().hasLoaded || get().loading) return;
    set({ loading: true });
    try {
      const user = getCurrentUser();
      if (!user) {
        set({ entries: [], groups: [] });
        return;
      }

      await get().loadRaw();
      const candidates = get().rawEntries;

      if (user.role === "admin") {
        set({ entries: candidates, groups: get().rawGroups, hasLoaded: true });
        return;
      }

      const pathByResource = new Map(candidates.map((c) => [normalizeResourcePath(c.href), c.href]));
      const resourcePaths = Array.from(pathByResource.keys());
      const response = resourcePaths.length
        ? await permissionSettingsApi.checkResourcePermissionsBatch(resourcePaths)
        : { permissions: {} };
      const permissions: Record<string, boolean> = response?.permissions ?? {};
      const allowedHrefs = new Set(candidates.filter((c) => permissions[normalizeResourcePath(c.href)]).map((c) => c.href));

      set({
        entries: candidates.filter((c) => allowedHrefs.has(c.href)),
        groups: filterGroupTree(get().rawGroups, allowedHrefs),
        hasLoaded: true,
      });
    } catch (error) {
      console.error("Failed to load global screen index:", error);
      set({ entries: [], groups: [] });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ hasLoaded: false }),

  rawEntries: [],
  rawGroups: [],
  rawLoading: false,
  rawLoaded: false,

  loadRaw: async () => {
    if (get().rawLoaded || get().rawLoading) return;
    set({ rawLoading: true });
    try {
      const user = getCurrentUser();
      if (!user) {
        set({ rawEntries: [], rawGroups: [] });
        return;
      }

      const menuData = await menuItemsApi.getMenuItems(user.companyId || undefined, user.branchId || undefined);
      const groups: NavGroup[] = Array.isArray(menuData)
        ? menuData.map((group: any) => ({ title: group.title, items: group.items.map(transformMenuItem) }))
        : [];

      set({ rawEntries: flattenMenuTree(groups), rawGroups: groups, rawLoaded: true });
    } catch (error) {
      console.error("Failed to load raw screen index:", error);
      set({ rawEntries: [], rawGroups: [] });
    } finally {
      set({ rawLoading: false });
    }
  },
}));
