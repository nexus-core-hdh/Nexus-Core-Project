"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { settingsApi } from "@/lib/api";

// Debounced so dragging the splitter doesn't fire a PATCH per pixel — same
// convention as the Workspace store's backend-persisted state.
const SAVE_DEBOUNCE_MS = 600;

export interface MasterDetailLayoutProps {
  /** Left panel content — typically <MasterListPanel />. */
  left: ReactNode;
  /** Right panel content — typically <DetailEditorPanel />. */
  right: ReactNode;
  /** Left panel width as a percentage of the available space. Default 30. */
  defaultLeftSize?: number;
  minLeftSize?: number;
  maxLeftSize?: number;
  /**
   * When provided, the left panel's width is remembered per-user and restored
   * on next login — reuses the existing `UserSettings.tablePreferences` JSON
   * column (the same one Workspace tabs and My Menu already persist into,
   * under its own `layoutPreferences` key) via the existing `GET/PATCH
   * /settings` endpoints. No new table or column. Give each distinct screen
   * using this layout its own key (e.g. "legacy-erp.warehouses") so their
   * saved widths don't collide. Omit to keep the layout session-only.
   */
  persistenceKey?: string;
  className?: string;
}

/**
 * The reusable two-pane shell for any ERP screen that manages parent/child or
 * list/detail records — a resizable master navigation panel on the left, a
 * detail editor on the right. Purely structural: it knows nothing about what
 * kind of records it's showing. A screen wires it up with
 * <MasterListPanel /> + <DetailEditorPanel />; both live in this same
 * `components/shared/master-detail/` folder and share no per-screen code.
 */
export function MasterDetailLayout({
  left,
  right,
  defaultLeftSize = 30,
  minLeftSize = 25,
  maxLeftSize = 40,
  persistenceKey,
  className,
}: MasterDetailLayoutProps) {
  // Panel `defaultSize` is only honored at first mount by react-resizable-panels
  // (it's uncontrolled), so the saved width — if any — has to be known *before*
  // the panel group renders at all; otherwise it would flash open at the
  // fallback default and then visibly jump to the restored width. `null` means
  // "still resolving" only when there's something to resolve.
  const [initialSize, setInitialSize] = useState<number | null>(persistenceKey ? null : defaultLeftSize);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!persistenceKey) return;
    let cancelled = false;
    settingsApi.getCurrentSettings()
      .then((settings: any) => {
        if (cancelled) return;
        const saved = settings?.tablePreferences?.layoutPreferences?.[persistenceKey];
        const size = typeof saved === "number" && saved >= minLeftSize && saved <= maxLeftSize ? saved : defaultLeftSize;
        setInitialSize(size);
      })
      .catch(() => { if (!cancelled) setInitialSize(defaultLeftSize); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistenceKey]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleLayout = useCallback((sizes: number[]) => {
    if (!persistenceKey) return;
    const leftSize = sizes[0];
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const settings: any = await settingsApi.getCurrentSettings();
        const existing = settings?.tablePreferences?.layoutPreferences ?? {};
        await settingsApi.updateCurrentSettings({
          tablePreferences: { layoutPreferences: { ...existing, [persistenceKey]: leftSize } },
        });
      } catch {
        // Non-critical — the resize already applied locally; just skip persisting this once.
      }
    }, SAVE_DEBOUNCE_MS);
  }, [persistenceKey]);

  if (initialSize == null) {
    // Briefly resolving the saved width — an empty frame here avoids rendering
    // at the wrong size and then visibly jumping, which is worse than a beat
    // of blank space (the fetch is a single fast GET).
    return <div className={cn("min-h-0 flex-1 rounded-lg border", className)} />;
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      onLayout={persistenceKey ? handleLayout : undefined}
      className={cn("min-h-0 flex-1 rounded-lg border", className)}
    >
      <ResizablePanel defaultSize={initialSize} minSize={minLeftSize} maxSize={maxLeftSize} className="min-w-0">
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize={30} className="min-w-0">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
