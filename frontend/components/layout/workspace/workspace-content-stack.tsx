"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "@/lib/app-navigation";

import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findWorkspaceModule, isWorkspaceRoute } from "@/lib/workspace/registry";
import { syncModuleRouteTab } from "@/lib/workspace/navigate";
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

  // Landing directly on a workspace route (deep link, bookmark, browser refresh, a list row,
  // Back/Forward) with no matching tab already open — auto-open/activate it, same as clicking
  // it from the sidebar would.
  useEffect(() => {
    syncModuleRouteTab(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  if (!isWorkspaceRoute(pathname) || tabs.length === 0) return null;

  return (
    <div className="relative h-full min-h-0">
      {tabs.map((tab) => {
        const mod = findWorkspaceModule(tab.key);
        if (!mod) return null;
        // A tab re-keyed in place (replaceTab) keeps the instance it was mounted as — see WorkspaceTab.mount.
        const mount = tab.mount ?? { key: tab.key, href: tab.href };
        const [, query] = mount.href.split("?");
        const Component = mod.Component;
        return (
          <div key={mount.key} className={cn("absolute inset-0", tab.key === activeKey ? "block" : "hidden")}>
            <WorkspaceTabContext.Provider
              key={`${mount.key}:${mount.href}`}
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
