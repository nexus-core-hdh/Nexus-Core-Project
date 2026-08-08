import type { useRouter } from "next/navigation";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findWorkspaceModule } from "@/lib/workspace/registry";

type Router = ReturnType<typeof useRouter>;

/**
 * Single call-in point used by both the sidebar (nav-main.tsx) and the global
 * search command palette (search.tsx): if `href` belongs to a registered
 * workspace module, open/activate its tab instead of letting Next.js unmount the
 * current page and mount a new one. Anything not registered falls back to a
 * normal `router.push`, so every other screen in the app is unaffected.
 */
export function navigateOrOpenTab(router: Router, href: string) {
  const [pathname] = href.split("?");
  const mod = findWorkspaceModule(pathname);
  if (!mod) {
    router.push(href);
    return;
  }
  useWorkspaceStore.getState().openTab({ key: mod.path, href });
  router.replace(href, { scroll: false });
}
