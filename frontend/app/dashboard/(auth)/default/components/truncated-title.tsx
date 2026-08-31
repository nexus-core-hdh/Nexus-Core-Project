"use client";

import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Shared title element for KPI/status cards: keeps the existing truncate+ellipsis
// look, and only mounts a shadcn Tooltip (Radix, portal-rendered — so it floats
// above the page and never affects this element's own box) once the text is
// actually overflowing its own width. Measured via ResizeObserver rather than a
// static heuristic, so it stays correct across breakpoints/font loads.
interface TruncatedTitleProps {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "p";
}

export function TruncatedTitle({ children, className, as = "span" }: TruncatedTitleProps) {
  const ref = React.useRef<HTMLSpanElement | HTMLParagraphElement>(null);
  const [truncated, setTruncated] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const Comp = as;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Comp ref={ref as React.Ref<any>} className={cn("truncate", className)}>
          {children}
        </Comp>
      </TooltipTrigger>
      {truncated && <TooltipContent>{children}</TooltipContent>}
    </Tooltip>
  );
}
