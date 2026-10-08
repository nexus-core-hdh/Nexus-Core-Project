import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { settingsApi } from "@/lib/api";
import { tabKeyForHref } from "@/lib/workspace/registry";

export interface WorkspaceTab {
  key: string;
  href: string;
  dirty: boolean;
  /** Optional explicit, already-fully-formatted display title, set by the
   *  screen that owns this tab — an escape hatch for a screen whose title
   *  needs a shape resolveWorkspaceTabTitle's own "{Screen} [{Record}]"
   *  composition can't produce (e.g. Inventory Receipt's own receipt-type +
   *  status format). Takes priority over everything else. See
   *  lib/workspace/resolve-tab-title.ts and hooks/use-workspace-tab-title.ts.
   *  Undefined means "resolve it". */
  title?: string;
  /** Just the loaded record's own display identity (its Name, or Code if it
   *  has no Name) — NOT a full title. resolveWorkspaceTabTitle combines this
   *  with the screen's own resolved name into "{Screen} [{recordLabel}]", so
   *  a screen only ever needs to report the one piece of data unique to it.
   *  See hooks/use-workspace-tab-title.ts's useWorkspaceRecordLabel. Absent/
   *  undefined on a create route falls through to the existing "New {Screen}"
   *  resolution. */
  recordLabel?: string;
  /** The key/href this tab's screen instance was mounted with, kept when the tab is re-keyed in
   *  place (replaceTab — a create form saving as a real record) so WorkspaceContentStack doesn't
   *  remount a screen mid-save. Cleared whenever the tab is re-pointed (openTab/updateTabHref),
   *  which is a deliberate remount. Never persisted: a reload mounts fresh from `href`. */
  mount?: { key: string; href: string };
}

interface OpenTabInput {
  key: string;
  href: string;
  title?: string;
}

/** A screen saved into My Menu. A tab is "pinned" iff its key appears here — there is no separate per-tab flag, so pin state can never drift out of sync with My Menu. */
export interface MyMenuItem {
  key: string;
  href: string;
  order: number;
}

type SaveHandler = () => void | Promise<void>;

interface WorkspacePersisted {
  tabs: WorkspaceTab[];
  activeKey: string | null;
  myMenu: MyMenuItem[];
}

interface WorkspaceState extends WorkspacePersisted {
  // Per-tab save callbacks (screen-registered, never persisted — see partialize below).
  // Lets the tab bar's "Save & Close" button invoke the hosted screen's own save logic
  // without the tab bar knowing anything about that screen.
  saveHandlers: Record<string, SaveHandler | undefined>;
  openTab: (tab: OpenTabInput) => void;
  updateTabHref: (key: string, href: string) => void;
  replaceTab: (oldKey: string, tab: OpenTabInput) => void;
  closeTab: (key: string) => void;
  closeTabs: (keys: string[]) => void;
  activateTab: (key: string) => void;
  pin: (key: string, href: string) => void;
  unpin: (key: string) => void;
  isPinned: (key: string) => boolean;
  reorderMyMenu: (key: string, direction: "up" | "down") => void;
  setDirty: (key: string, dirty: boolean) => void;
  registerSaveHandler: (key: string, handler: SaveHandler | null) => void;
  setTabTitle: (key: string, title: string | undefined) => void;
  setTabRecordLabel: (key: string, recordLabel: string | undefined) => void;
}

// Debounced so rapid tab switching / pinning doesn't fire a PATCH per click — the
// in-memory Zustand state (and therefore the UI) updates instantly regardless;
// only the backend write is throttled.
const PERSIST_DEBOUNCE_MS = 600;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingValue: StorageValue<WorkspacePersisted> | null = null;

function flushPendingWrite() {
  const value = pendingValue;
  pendingValue = null;
  debounceTimer = null;
  if (!value) return;
  void settingsApi
    .updateCurrentSettings({
      tablePreferences: {
        workspace: { tabs: value.state.tabs, activeKey: value.state.activeKey },
        myMenu: value.state.myMenu,
      },
    })
    .catch((error) => console.error("Failed to persist workspace settings:", error));
}

// Backs the Workspace store's persistence with the database (UserSettings.tablePreferences)
// instead of sessionStorage, so open tabs and My Menu survive logout/login and aren't tied
// to a single browser tab. Implements Zustand's StorageValue-based PersistStorage directly
// (rather than createJSONStorage) since the backend column is already JSON — no need to
// stringify/parse a string in between.
const backendStorage: PersistStorage<WorkspacePersisted> = {
  getItem: async () => {
    try {
      const settings = await settingsApi.getCurrentSettings();
      const tablePreferences = (settings?.tablePreferences ?? {}) as {
        workspace?: { tabs?: WorkspaceTab[]; activeKey?: string | null };
        myMenu?: MyMenuItem[];
      };
      const state: WorkspacePersisted = {
        tabs: tablePreferences.workspace?.tabs ?? [],
        activeKey: tablePreferences.workspace?.activeKey ?? null,
        myMenu: tablePreferences.myMenu ?? [],
      };
      return { state, version: 0 };
    } catch (error) {
      console.error("Failed to load workspace settings:", error);
      return null;
    }
  },
  setItem: (_name, value) => {
    pendingValue = value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushPendingWrite, PERSIST_DEBOUNCE_MS);
  },
  removeItem: () => {
    // Workspace state is never explicitly cleared client-side.
  },
};

// A fresh screen instance for a tab (re)pointed at `href`. Normally none is needed (the stack keys
// the instance by the tab's own key), unless another tab re-keyed by replaceTab still holds that key
// as its instance key — then this one gets a distinct instance key so the two never collide.
let instanceCounter = 0;
function freshMount(key: string, href: string, others: WorkspaceTab[]): WorkspaceTab["mount"] {
  return others.some((t) => (t.mount?.key ?? t.key) === key) ? { key: `${key}#${++instanceCounter}`, href } : undefined;
}

// Single global store for the Workspace Tab Bar — every screen or record opened from the
// sidebar/search/a list/a related-record link becomes an entry here, keyed by
// tabKeyForHref (lib/workspace/registry.tsx): one tab per list screen, one per opened
// record (`form?id=6`, or a dynamic `[id]` route's own pathname), so opening another
// record of the same entity adds a tab instead of re-pointing the current one.
// A tab's key is always the canonical key of its href — every action below keeps it so.
// Persisted to the database (not sessionStorage) so tabs and My Menu restore after
// logout/login and aren't lost when the browser tab closes.
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeKey: null,
      myMenu: [],
      saveHandlers: {},

      openTab: (tab) => {
        const existing = get().tabs.find((t) => t.key === tab.key);
        if (existing) {
          set({
            // A reopen without an explicit title keeps whatever title the tab
            // already had (e.g. one set by useWorkspaceTabTitle) rather than
            // wiping it back to "resolve automatically".
            tabs: get().tabs.map((t) =>
              t.key === tab.key
                ? {
                    ...t,
                    href: tab.href,
                    title: tab.title ?? t.title,
                    mount: t.href === tab.href ? t.mount : freshMount(t.key, tab.href, get().tabs.filter((o) => o !== t)),
                  }
                : t
            ),
            activeKey: tab.key,
          });
          return;
        }
        set({
          tabs: [...get().tabs, { ...tab, dirty: false, mount: freshMount(tab.key, tab.href, get().tabs) }],
          activeKey: tab.key,
        });
      },

      // Patches one tab's own href IN PLACE — unlike openTab, never activates a tab. For a
      // background/inactive tab that self-corrects its own stale state (e.g. a "New Work Order"
      // tab dropping a styleCardId that no longer resolves), this must not steal focus or touch
      // the live browser URL, which openTab's "reopen" branch does as a side effect. When the new
      // href names a different record the tab is re-keyed to match (staying active if it was);
      // if that record already has its own tab, this one folds into it.
      updateTabHref: (key, href) =>
        set((state) => {
          const current = state.tabs.find((t) => t.key === key);
          if (!current || current.href === href) return state;
          const nextKey = tabKeyForHref(href) ?? key;
          const activeKey = state.activeKey === key ? nextKey : state.activeKey;
          if (nextKey !== key && state.tabs.some((t) => t.key === nextKey)) {
            return { tabs: state.tabs.filter((t) => t.key !== key), activeKey };
          }
          const mount = freshMount(nextKey, href, state.tabs.filter((t) => t !== current));
          const repointed = nextKey === key
            ? { ...current, href, mount }
            : { ...current, key: nextKey, href, mount, title: undefined, recordLabel: undefined };
          return { tabs: state.tabs.map((t) => (t.key === key ? repointed : t)), activeKey };
        }),

      // Re-keys one tab in place (same position) WITHOUT remounting its screen — for a tab whose
      // record identity is established under it: a create form saving as a real record (by URL, or
      // reported via useWorkspaceRecordId). Stays active if it was. Drops any other tab already
      // holding the new key, so a record never ends up with two tabs.
      replaceTab: (oldKey, tab) =>
        set((state) => ({
          tabs: state.tabs
            .filter((t) => t.key === oldKey || t.key !== tab.key)
            .map((t) => (t.key === oldKey
              ? { ...t, key: tab.key, href: tab.href, title: tab.title ?? t.title, mount: t.mount ?? { key: t.key, href: t.href } }
              : t)),
          activeKey: state.activeKey === oldKey ? tab.key : state.activeKey,
        })),

      closeTab: (key) => {
        const { tabs, activeKey } = get();
        const remaining = tabs.filter((t) => t.key !== key);
        let nextActive = activeKey;
        if (activeKey === key) {
          const closedIndex = tabs.findIndex((t) => t.key === key);
          nextActive = remaining[Math.max(0, closedIndex - 1)]?.key ?? remaining[0]?.key ?? null;
        }
        set({ tabs: remaining, activeKey: nextActive });
      },

      // Batched sibling of closeTab, for Close All / Close Others / Close Tabs to the Right —
      // one set() for the whole group instead of one per tab, so a bulk close doesn't re-render
      // (and re-debounce-persist) once per closed tab. Active-tab fallback mirrors closeTab's
      // own "closed tab's previous neighbor" rule; callers that need a specific tab to end up
      // active regardless (e.g. Close Others always activates the tab that was kept) call
      // activateTab right after.
      closeTabs: (keys) => {
        const { tabs, activeKey } = get();
        const keySet = new Set(keys);
        const remaining = tabs.filter((t) => !keySet.has(t.key));
        let nextActive = activeKey;
        if (activeKey && keySet.has(activeKey)) {
          const closedIndex = tabs.findIndex((t) => t.key === activeKey);
          nextActive = remaining[Math.max(0, closedIndex - 1)]?.key ?? remaining[0]?.key ?? null;
        }
        set({ tabs: remaining, activeKey: nextActive });
      },

      activateTab: (key) => set({ activeKey: key }),

      pin: (key, href) => {
        const { myMenu } = get();
        if (myMenu.some((m) => m.key === key)) return;
        const maxOrder = myMenu.reduce((max, m) => Math.max(max, m.order), -1);
        set({ myMenu: [...myMenu, { key, href, order: maxOrder + 1 }] });
      },

      // Removes the screen from My Menu and its saved preference, but leaves an
      // already-open Workspace tab (if any) untouched — pin state and open-tab
      // state are intentionally independent.
      unpin: (key) => set({ myMenu: get().myMenu.filter((m) => m.key !== key) }),

      isPinned: (key) => get().myMenu.some((m) => m.key === key),

      reorderMyMenu: (key, direction) => {
        const items = [...get().myMenu].sort((a, b) => a.order - b.order);
        const index = items.findIndex((m) => m.key === key);
        const swapWith = direction === "up" ? index - 1 : index + 1;
        if (index === -1 || swapWith < 0 || swapWith >= items.length) return;
        const reordered = [...items];
        const temp = reordered[index].order;
        reordered[index] = { ...reordered[index], order: reordered[swapWith].order };
        reordered[swapWith] = { ...reordered[swapWith], order: temp };
        set({ myMenu: reordered });
      },

      setDirty: (key, dirty) =>
        set((state) => {
          const current = state.tabs.find((t) => t.key === key);
          if (!current || current.dirty === dirty) return state; // avoid redundant re-renders
          return { tabs: state.tabs.map((t) => (t.key === key ? { ...t, dirty } : t)) };
        }),

      registerSaveHandler: (key, handler) =>
        set((state) => ({ saveHandlers: { ...state.saveHandlers, [key]: handler ?? undefined } })),

      setTabTitle: (key, title) =>
        set((state) => {
          const current = state.tabs.find((t) => t.key === key);
          if (!current || current.title === title) return state;
          return { tabs: state.tabs.map((t) => (t.key === key ? { ...t, title } : t)) };
        }),

      setTabRecordLabel: (key, recordLabel) =>
        set((state) => {
          const current = state.tabs.find((t) => t.key === key);
          if (!current || current.recordLabel === recordLabel) return state;
          return { tabs: state.tabs.map((t) => (t.key === key ? { ...t, recordLabel } : t)) };
        }),
    }),
    {
      name: "nexuscore-workspace-tabs",
      storage: backendStorage,
      partialize: (state) => ({
        tabs: state.tabs.map(({ mount: _mount, ...tab }) => tab),
        activeKey: state.activeKey,
        myMenu: state.myMenu,
      }),
      // Tabs saved before records got their own tabs were keyed by bare path (`form` showing
      // `form?id=6`) — re-key them to their canonical record key, dropping duplicates.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<WorkspacePersisted>;
        const renamed = new Map<string, string>();
        const tabs: WorkspaceTab[] = [];
        for (const tab of saved.tabs ?? []) {
          const key = tabKeyForHref(tab.href) ?? tab.key;
          renamed.set(tab.key, key);
          if (!tabs.some((t) => t.key === key)) tabs.push({ ...tab, key });
        }
        const activeKey = saved.activeKey ? renamed.get(saved.activeKey) ?? saved.activeKey : null;
        return { ...current, ...saved, tabs, activeKey };
      },
    }
  )
);
