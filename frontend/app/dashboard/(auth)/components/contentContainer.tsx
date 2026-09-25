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
  //
  // `overflow-x-hidden`: explicit, deliberate — only `overflow-y` was ever meant to be
  // scrollable here. Without an explicit overflow-x, the CSS spec's own overflow-x/y
  // coupling rule ("if one axis is a value other than visible and the other is visible, the
  // visible one computes to auto") silently turns THIS axis into `auto` too, purely as a
  // side effect of setting overflow-y-auto — meaning ANY inner content that ever loses its
  // own width containment (a resized grid column, a future screen that forgets its own
  // overflow-x-auto wrapper) surfaces as a horizontal scrollbar on this single global region,
  // which reads to a user as "the whole page scrolls sideways." Every grid in this app
  // (ReportGrid, WorklistTable, PlmCrudTable, every shared <Table> primitive, every Kanban
  // board) already owns its own overflow-x-auto boundary and scrolls internally — verified
  // across the codebase — so this container never legitimately needs to scroll horizontally
  // itself. Making that explicit turns an accidental fallback into a real boundary: genuine
  // horizontal overflow now scrolls where it belongs (inside the grid), and anything that
  // still doesn't contain itself is a real bug to fix at its own source, not something this
  // shared region should silently paper over with a page-wide scrollbar.
  const className = fullWidth
    ? "@container/main min-w-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-[var(--content-padding)] w-full max-w-none mx-0"
    : "@container/main min-w-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-[var(--content-padding)] xl:group-data-[theme-content-layout=centered]/layout:container xl:group-data-[theme-content-layout=centered]/layout:mx-auto";

  return <div className={className}>{workspaceRoute ? <WorkspaceContentStack /> : children}</div>;
}

