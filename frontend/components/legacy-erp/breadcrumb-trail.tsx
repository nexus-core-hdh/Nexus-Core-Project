"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";

export interface BreadcrumbSegment {
  label: string;
  /** Present only on a clickable parent segment — omit for "Legacy ERP" (no home screen) and
   *  for the trailing current-record segment. */
  href?: string;
}

// Shared Legacy ERP breadcrumb trail — same "Legacy ERP / Screen / Record" markup and styling
// every New/Edit screen already hand-rolled inline (`text-xs text-muted-foreground` row,
// ChevronRight separators, `font-medium text-foreground` on the current segment), now in one
// place so a parent segment can be made clickable everywhere at once instead of per-screen.
// Navigation goes through the same navigateOrOpenTab the list screens' own row-click/View
// buttons already use (see purchase-orders-list/page.tsx), not a plain <Link>, so clicking a
// parent segment reuses (or opens) that screen's Workspace tab exactly like every other
// in-app navigation already does.
export function LegacyErpBreadcrumb({ trail }: { trail: BreadcrumbSegment[] }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {trail.map((seg, i) => {
        const isLast = i === trail.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            {seg.href ? (
              <button
                type="button"
                onClick={() => navigateOrOpenTab(router, seg.href!)}
                className="cursor-pointer rounded-sm hover:text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {seg.label}
              </button>
            ) : (
              <span className={isLast ? "font-medium text-foreground" : undefined}>{seg.label}</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
