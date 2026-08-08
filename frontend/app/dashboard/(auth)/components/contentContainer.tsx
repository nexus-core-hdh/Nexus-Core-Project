"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { isWorkspaceRoute } from "@/lib/workspace/registry";
import { WorkspaceContentStack } from "@/components/layout/workspace/workspace-content-stack";

const FULL_WIDTH_PATHS = new Set<string>(["/dashboard/crm/deals/dashboards/create"]);

export function ContentContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidth = pathname ? FULL_WIDTH_PATHS.has(pathname) : false;
  // Workspace-registered routes render exclusively through the keep-mounted
  // WorkspaceContentStack (see lib/workspace/registry.tsx) instead of the real
  // Next.js page tree, so a screen never ends up mounted twice at once.
  const workspaceRoute = pathname ? isWorkspaceRoute(pathname) : false;

  // `min-w-0`: this is a flex item of the column wrapper in layout.tsx — without
  // it, wide content rendered inside (a screen's table, the Workspace stack)
  // would resist shrinking and push the whole application shell past the
  // viewport width instead of staying within it.
  //
  // `flex-1 min-h-0 overflow-y-auto`: this is what makes ContentContainer the
  // single, global scroll region for the entire app. The shell above it
  // (SidebarProvider/SidebarInset, see sidebar.tsx) is now clamped to exactly
  // the viewport height, so without a scroll container somewhere inside it,
  // tall pages would have nowhere to go. This one change gives every screen
  // — workspace or not — correct "viewport minus header minus tabs" sizing
  // and scrolling automatically, with no per-screen opt-in required.
  const className = fullWidth
    ? "@container/main min-w-0 flex-1 min-h-0 overflow-y-auto p-[var(--content-padding)] w-full max-w-none mx-0"
    : "@container/main min-w-0 flex-1 min-h-0 overflow-y-auto p-[var(--content-padding)] xl:group-data-[theme-content-layout=centered]/layout:container xl:group-data-[theme-content-layout=centered]/layout:mx-auto";

  return <div className={className}>{workspaceRoute ? <WorkspaceContentStack /> : children}</div>;
}

