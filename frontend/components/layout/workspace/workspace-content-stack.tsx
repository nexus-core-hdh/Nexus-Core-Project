"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findWorkspaceModule, isWorkspaceRoute } from "@/lib/workspace/registry";
import { WorkspaceTabContext } from "./workspace-tab-context";

/**
 * Renders every open tab's registered screen component simultaneously, toggling
 * visibility with a CSS class instead of conditionally unmounting — this is what
 * makes tab switching preserve scroll position, form state, and internal tab
 * selection for free, with zero per-screen effort. Each instance is keyed by
 * `${tab.key}:${tab.href}` so navigating the *same* tab to a different record
 * (e.g. viewing a different Current Account) still does one clean remount/fresh
 * load, while switching *between* tabs never remounts anything.
 *
 * Only visible when the current route belongs to a registered workspace module —
 * on any other route this renders nothing, so unrelated pages are unaffected and
 * the real `{children}` for that route shows through normally.
 */
export function WorkspaceContentStack() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeKey = useWorkspaceStore((s) => s.activeKey);
  const openTab = useWorkspaceStore((s) => s.openTab);

  // Landing directly on a workspace route (deep link, bookmark, browser refresh)
  // with no matching tab already open — auto-open/activate it, same as clicking
  // it from the sidebar would.
  useEffect(() => {
    const mod = findWorkspaceModule(pathname);
    if (!mod) return;
    const alreadyOpen = useWorkspaceStore.getState().tabs.some((t) => t.key === mod.path);
    if (alreadyOpen && useWorkspaceStore.getState().activeKey === mod.path) return;
    const query = searchParams.toString();
    openTab({ key: mod.path, href: query ? `${pathname}?${query}` : pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams, openTab]);

  if (!isWorkspaceRoute(pathname) || tabs.length === 0) return null;

  return (
    <div className="relative h-full min-h-0">
      {tabs.map((tab) => {
        const mod = findWorkspaceModule(tab.key);
        if (!mod) return null;
        const [, query] = tab.href.split("?");
        const Component = mod.Component;
        return (
          <div key={tab.key} className={cn("absolute inset-0", tab.key === activeKey ? "block" : "hidden")}>
            <WorkspaceTabContext.Provider
              key={`${tab.key}:${tab.href}`}
              value={{ tabKey: tab.key, params: new URLSearchParams(query ?? "") }}
            >
              <Component />
            </WorkspaceTabContext.Provider>
          </div>
        );
      })}
    </div>
  );
}
