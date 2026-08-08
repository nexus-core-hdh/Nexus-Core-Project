"use client";

import type { ReactNode } from "react";
import { FileQuestion } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DetailEditorPanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** e.g. Save/Delete buttons, rendered top-right next to the title. */
  actions?: ReactNode;
  /** True when nothing is selected in the master list — shows `emptyState` instead of `children`. */
  isEmpty?: boolean;
  emptyState?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * The reusable right-hand "detail editor" chrome: consistent header
 * (title/subtitle/actions), a scrollable body, and a shared empty state for
 * when no record is selected. The screen provides its own form fields as
 * `children` — this component has no knowledge of what's being edited.
 */
export function DetailEditorPanel({
  title,
  subtitle,
  actions,
  isEmpty = false,
  emptyState,
  className,
  children,
}: DetailEditorPanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      {(title || actions) && !isEmpty && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            {title && <div className="truncate text-sm font-semibold">{title}</div>}
            {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            {emptyState ?? (
              <>
                <FileQuestion className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Select a record to view its details</p>
              </>
            )}
          </div>
        ) : (
          <div className="p-5">{children}</div>
        )}
      </div>
    </div>
  );
}
