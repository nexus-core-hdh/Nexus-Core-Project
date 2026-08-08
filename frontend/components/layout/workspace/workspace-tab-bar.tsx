"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pin, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkspaceStore, type WorkspaceTab } from "@/lib/store/workspace-store";
import { useScreenIndexStore } from "@/lib/store/screen-index-store";

// Hides the scroller's native scrollbar across engines. `scrollbar-width` (a
// real CSS property, applied inline so it never depends on Tailwind's
// arbitrary-value scanning) covers Firefox; `::-webkit-scrollbar` can only be
// targeted via a stylesheet rule, hence this one scoped class + <style> tag —
// still no browser-visible scrollbar, on any engine, ever.
const SCROLLER_CLASS = "workspace-tab-scroller";

// One arrow click scrolls by most (not all) of a viewport, so the tab that
// was at the edge stays partially visible as a scan anchor — the same
// convention VS Code's and most browsers' tab strips use.
const SCROLL_STEP_RATIO = 0.8;

export function WorkspaceTabBar() {
  const router = useRouter();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeKey = useWorkspaceStore((s) => s.activeKey);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const myMenu = useWorkspaceStore((s) => s.myMenu);
  const pin = useWorkspaceStore((s) => s.pin);
  const unpin = useWorkspaceStore((s) => s.unpin);
  const saveHandlers = useWorkspaceStore((s) => s.saveHandlers);
  // Raw (not permission-filtered) menu index — just title/icon lookup for tabs
  // that are already open, so this doesn't fire the ~100-request permission-check
  // batch (that stays lazy, only for the search palette / My Menu).
  const rawEntries = useScreenIndexStore((s) => s.rawEntries);
  const loadRaw = useScreenIndexStore((s) => s.loadRaw);
  const [pendingClose, setPendingClose] = useState<WorkspaceTab | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabElRef = useRef(new Map<string, HTMLDivElement>());
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => { void loadRaw(); }, [loadRaw]);

  // Exposes this bar's real, dynamic height (0 when no tabs are open, h-10
  // when they are) as a CSS custom property on the document root. The shared
  // `--content-full-height` variable (app/dashboard/(auth)/layout.tsx) that
  // every fixed-height screen (Mail, Unit Sets, ...) sizes itself against
  // subtracts this — without it, those screens under-subtract whenever tabs
  // are open, claim more height than actually remains, and the surrounding
  // page (not just this component) ends up with extra scrollable space below
  // its real content. Setting it here — where the true value is known — beats
  // hardcoding a guessed height in the shared layout.
  useEffect(() => {
    document.documentElement.style.setProperty("--workspace-tab-bar-height", tabs.length > 0 ? "2.5rem" : "0px");
  }, [tabs.length]);

  // Title/icon are never duplicated in the workspace registry — they're looked
  // up live from the same menu data the sidebar renders, keyed by href (a tab's
  // key is always its module's path).
  const entryByHref = useMemo(() => new Map(rawEntries.map((e) => [e.href, e])), [rawEntries]);
  const pinnedKeys = useMemo(() => new Set(myMenu.map((m) => m.key)), [myMenu]);

  // Keeps the overflow arrows' visible/disabled state in sync with the actual
  // scroll position — re-measured on scroll, on resize (sidebar collapse,
  // window resize), and whenever the tab list or its labels change size.
  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setHasOverflow(maxScroll > 1);
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [updateScrollState, tabs, rawEntries]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [updateScrollState]);

  // Auto-scroll the active tab into view whenever it changes — opening a new
  // screen, activating an existing tab, and a search result opening a screen
  // all funnel through the same `activeKey` state, so this one effect covers
  // all three. `scrollIntoView({ inline: "nearest" })` is a no-op once the tab
  // is already fully visible, so switching between two on-screen tabs leaves
  // the scroll position untouched.
  useEffect(() => {
    if (!activeKey) return;
    tabElRef.current.get(activeKey)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeKey]);

  const scrollByStep = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * scrollerRef.current.clientWidth * SCROLL_STEP_RATIO, behavior: "smooth" });
  };

  // Mouse wheels report vertical movement as deltaY (and horizontal/shift+wheel
  // as deltaX, where the OS/browser supports it) — route whichever is non-zero
  // into horizontal scroll so a plain wheel already scrolls the tab strip
  // without requiring Shift.
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (!el || delta === 0) return;
    el.scrollLeft += delta;
    e.preventDefault();
  };

  if (tabs.length === 0) return null;

  const goTo = (tab: WorkspaceTab) => {
    activateTab(tab.key);
    router.replace(tab.href, { scroll: false });
  };

  const requestClose = (tab: WorkspaceTab) => {
    if (tab.dirty) {
      setPendingClose(tab);
      return;
    }
    finishClose(tab);
  };

  const finishClose = (tab: WorkspaceTab) => {
    closeTab(tab.key);
    if (tab.key === activeKey) {
      const remaining = tabs.filter((t) => t.key !== tab.key);
      const next = remaining[0];
      if (next) router.replace(next.href, { scroll: false });
    }
  };

  return (
    <>
      {/* `::-webkit-scrollbar` can only be reached via a stylesheet rule, not
          an inline style — this is the one place that's true, and it's scoped
          to this single class so it can't leak into any other scroll container
          in the app. */}
      <style>{`.${SCROLLER_CLASS}::-webkit-scrollbar { display: none; width: 0; height: 0; }`}</style>
      <div className="flex h-10 min-w-0 items-stretch border-b bg-muted/30">
        {hasOverflow && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous tabs"
            disabled={!canScrollLeft}
            onClick={() => scrollByStep(-1)}
            className="h-10 w-8 shrink-0 rounded-none border-r text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        <div
          ref={scrollerRef}
          onScroll={updateScrollState}
          onWheel={handleWheel}
          role="tablist"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          className={cn(SCROLLER_CLASS, "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-smooth px-2")}
        >
          {tabs.map((tab) => {
            const entry = entryByHref.get(tab.key);
            const Icon = entry?.icon;
            const isActive = tab.key === activeKey;
            const pinned = pinnedKeys.has(tab.key);
            return (
              <div
                key={tab.key}
                ref={(el) => {
                  if (el) tabElRef.current.set(tab.key, el);
                  else tabElRef.current.delete(tab.key);
                }}
                role="tab"
                aria-selected={isActive}
                onClick={() => goTo(tab)}
                className={cn(
                  "group/tab flex h-8 min-w-[130px] max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 text-sm transition-colors duration-150",
                  isActive
                    ? "border-border bg-background font-medium text-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span title={entry?.title ?? tab.href} className="min-w-0 flex-1 truncate">{entry?.title ?? tab.href}</span>
                <button
                  type="button"
                  title={pinned ? "Unpin from My Menu" : "Pin to My Menu"}
                  onClick={(e) => { e.stopPropagation(); pinned ? unpin(tab.key) : pin(tab.key, tab.href); }}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
                    pinned ? "text-primary" : "text-muted-foreground/50 opacity-0 hover:text-foreground group-hover/tab:opacity-100"
                  )}
                >
                  <Pin className={cn("h-3 w-3", pinned && "fill-current")} />
                </button>
                <button
                  type="button"
                  title="Close"
                  onClick={(e) => { e.stopPropagation(); requestClose(tab); }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/50 opacity-0 transition-colors hover:bg-muted hover:text-foreground group-hover/tab:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {hasOverflow && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next tabs"
            disabled={!canScrollRight}
            onClick={() => scrollByStep(1)}
            className="h-10 w-8 shrink-0 rounded-none border-l text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="All open tabs"
                className="h-10 w-8 shrink-0 rounded-none border-l text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[60vh] w-64 overflow-y-auto">
              {tabs.map((tab) => {
                const entry = entryByHref.get(tab.key);
                const Icon = entry?.icon;
                const isActive = tab.key === activeKey;
                return (
                  <DropdownMenuItem key={tab.key} onSelect={() => goTo(tab)} className="gap-2">
                    {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <span className="w-3.5 shrink-0" />}
                    <span title={entry?.title ?? tab.href} className="min-w-0 flex-1 truncate">{entry?.title ?? tab.href}</span>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={!!pendingClose} onOpenChange={(open) => !open && setPendingClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to close this screen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingClose(null)}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (pendingClose) finishClose(pendingClose);
                setPendingClose(null);
              }}
            >
              Close Without Saving
            </Button>
            <AlertDialogAction
              onClick={async () => {
                if (pendingClose) {
                  await saveHandlers[pendingClose.key]?.();
                  finishClose(pendingClose);
                }
                setPendingClose(null);
              }}
            >
              Save &amp; Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
