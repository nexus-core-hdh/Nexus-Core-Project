"use client";

import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

// Hides the scroller's native scrollbar across engines — same technique as
// components/layout/workspace/workspace-tab-bar.tsx (the global open-tabs
// strip), which this component intentionally mirrors so every large
// tab-heavy master screen in the ERP behaves and feels identical.
const SCROLLER_CLASS = "scrollable-tabs-scroller";
const SCROLL_STEP_RATIO = 0.8;

export interface ScrollableTabsListProps {
  /** Tab labels, in display order. Each becomes a Radix TabsTrigger with this string as its value. */
  tabs: string[];
  /** The currently active tab value — only used to auto-scroll it into view on change. */
  activeTab: string;
  className?: string;
}

/**
 * The standard tab strip for every ERP master screen (Yarn Card, Fabric Card,
 * Current Account, Trim Cards, and any future screen). Each tab sizes itself
 * to its own caption — no fixed or maximum width — so a caption is NEVER
 * truncated or clipped, no matter how long ("Warehouse Parameters" etc. always
 * render in full). If the full set of tabs doesn't fit the available width,
 * the strip scrolls horizontally (mouse wheel, touchpad, or the left/right
 * arrow buttons) instead of shrinking or cutting any caption off, and the
 * active tab is always scrolled into view automatically — the same model as
 * VS Code's/Chrome's tab strips, and the same technique the global Workspace
 * Tab Bar already uses.
 * Must be rendered inside a Radix <Tabs value=... onValueChange=...> — this
 * component only renders the list/triggers, not the tab-switching logic.
 */
export function ScrollableTabsList({ tabs, activeTab, className }: ScrollableTabsListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabElRef = useRef(new Map<string, HTMLButtonElement>());
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setHasOverflow(maxScroll > 1);
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => { updateScrollState(); }, [updateScrollState, tabs]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [updateScrollState]);

  useEffect(() => {
    tabElRef.current.get(activeTab)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeTab]);

  const scrollByStep = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * scrollerRef.current.clientWidth * SCROLL_STEP_RATIO, behavior: "smooth" });
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (!el || delta === 0) return;
    el.scrollLeft += delta;
    e.preventDefault();
  };

  return (
    <div className={cn("flex min-w-0 items-stretch", className)}>
      <style>{`.${SCROLLER_CLASS}::-webkit-scrollbar { display: none; width: 0; height: 0; }`}</style>

      {hasOverflow && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous tabs"
          disabled={!canScrollLeft}
          onClick={() => scrollByStep(-1)}
          className="h-auto w-8 shrink-0 rounded-none border-b text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        onWheel={handleWheel}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        className={cn(SCROLLER_CLASS, "min-w-0 flex-1 overflow-x-auto scroll-smooth")}
      >
        <TabsList className="h-auto w-max flex-nowrap justify-start gap-6 rounded-none border-b bg-transparent px-6 pt-4 pb-0">
          {tabs.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              title={t}
              ref={(el) => {
                if (el) tabElRef.current.set(t, el);
                else tabElRef.current.delete(t);
              }}
              // The actual overlap bug lived here: the base TabsTrigger (components/ui/tabs.tsx)
              // ships `flex-1`, i.e. `flex: 1 1 0%` — every trigger starts from a ZERO width
              // basis and grows to share the row equally, regardless of its own text. That's
              // fine for a small fixed set of equal-width tabs, but fights directly against
              // "size each tab to its own content": with a zero basis, a long caption's box
              // stops growing at its equal-share width while the text itself keeps rendering
              // past that box edge, visually spilling into the next tab — exactly the reported
              // overlap. `shrink-0` alone (the previous attempt here) only cancels flex-shrink;
              // it leaves flex-grow:1 and flex-basis:0% both still active, so the bug survived.
              // `flex-none` is `flex: 0 0 auto` — the exact value requested — and because it's
              // the same Tailwind "flex" shorthand group as the base class's `flex-1`, the `cn()`
              // merge (tailwind-merge) drops `flex-1` from the output entirely instead of leaving
              // both in the cascade. Width is now purely intrinsic: text width + this padding.
              className="h-auto flex-none whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-5 pb-3 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {hasOverflow && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next tabs"
          disabled={!canScrollRight}
          onClick={() => scrollByStep(1)}
          className="h-auto w-8 shrink-0 rounded-none border-b text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
