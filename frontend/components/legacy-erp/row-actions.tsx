"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { MoreVertical } from "lucide-react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One declarative action list, two surfaces — right-click context menu (RowContextMenu) and a
// vertical "Quick Actions" trigger (RowActionsMenu) — instead of each screen hand-rolling its
// own ContextMenuItem JSX twice. Extracted from receipt-master-data/page.tsx's original inline
// menu (New/View/Update/Delete/Approval/Reject) so that same action set now has one home; other
// screens define their own RowAction[] from their own existing action handlers and get both
// surfaces for free — no new business logic, no removed right-click behavior.
export interface RowAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  hidden?: boolean;
  destructive?: boolean;
  /** Renders a separator immediately before this action — same grouping the original inline
   *  menus used (New/View/Update, then Delete/Approval/Reject). */
  separatorBefore?: boolean;
  /** When set, this action renders as a submenu (e.g. Universal Action Menu's "Return /
   *  Purchase Receipt" -> dynamically loaded related receipts) instead of a plain item;
   *  `onSelect` is ignored and each child fires its own `onSelect`. */
  subActions?: RowAction[];
  /** Display-only keyboard-shortcut hint (e.g. "Ctrl + Shift + W"), right-aligned in the menu
   *  item via ContextMenuShortcut/DropdownMenuShortcut. Purely a visual reminder — the actual
   *  key binding lives wherever it already did (a window keydown listener, etc.); this never
   *  wires up its own handler, so it can't drift into a second code path for the same action. */
  shortcut?: string;
}

function visibleActions(actions: RowAction[]) {
  return actions.filter((a) => !a.hidden);
}

/** Right-click menu — wraps `children` (typically a <TableRow>) exactly like the ContextMenu
 *  primitive it replaces, so existing row markup/handlers (onDoubleClick, cell rendering) are
 *  untouched; only the menu-item list itself becomes data-driven. */
export function RowContextMenu({ actions, children, contentClassName }: { actions: RowAction[]; children: React.ReactNode; contentClassName?: string }) {
  const items = visibleActions(actions);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={cn("w-48", contentClassName)}>
        {items.map((a) => (
          <RenderMenuItem
            key={a.key} action={a} Item={ContextMenuItem} Separator={ContextMenuSeparator}
            Sub={ContextMenuSub} SubTrigger={ContextMenuSubTrigger} SubContent={ContextMenuSubContent}
            Shortcut={ContextMenuShortcut}
          />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Quick Actions — a small "⋮" trigger opening the exact same actions as a vertical dropdown
 *  panel, for users who don't right-click (touch devices, discoverability) or want an always-
 *  visible affordance per row. Same RowAction[] as RowContextMenu — define once, use both. */
export function RowActionsMenu({ actions, className }: { actions: RowAction[]; className?: string }) {
  const items = visibleActions(actions);
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Quick Actions"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        {items.map((a) => (
          <RenderMenuItem
            key={a.key} action={a} Item={DropdownMenuItem} Separator={DropdownMenuSeparator}
            Sub={DropdownMenuSub} SubTrigger={DropdownMenuSubTrigger} SubContent={DropdownMenuSubContent}
            Shortcut={DropdownMenuShortcut}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Page-level context menu — right-click ANYWHERE inside `children` opens the same action-list
 *  chrome as RowContextMenu/RowActionsMenu, but is not tied to any one row's own DOM node. Exists
 *  because RowContextMenu is deliberately row-scoped (one trigger per `<tr>`, via `asChild`) and
 *  can't cleanly cover an entire page section (header, blank space, multiple grids) with a single
 *  trigger while still resolving "which row (if any) was actually under the cursor" — that
 *  resolution is inherently caller-specific (different pages key their rows differently), so it's
 *  left to `getActions`, which receives the raw DOM element the browser's native `contextmenu`
 *  event targeted and returns whatever RowAction[] is appropriate (the caller decides, e.g. via
 *  `event.target.closest('[data-row-id]')`, whether that target maps to a specific row or none).
 *  Same RowAction[] shape and same RenderMenuItem rendering as the other two surfaces — one
 *  declarative action list, now a third surface, not a competing menu system. */
export function PageContextMenu({ children, getActions, className }: {
  children: React.ReactNode;
  getActions: (target: HTMLElement | null) => RowAction[];
  className?: string;
}) {
  // Real state, not a ref — a ref's mutation alone never triggers a re-render, so `items` below
  // would keep reading whatever value it had at PageContextMenu's OWN last render (effectively
  // always the initial `null`) no matter how many times the contextmenu event fired; only a state
  // update forces this component to re-render and recompute `items` with the just-clicked target.
  // The state update and Radix's own internal open-state change both originate from the SAME
  // native event dispatch, so React batches them together — `items` is correct before the menu
  // ever paints.
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const items = visibleActions(getActions(target));
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={className} onContextMenu={(e) => setTarget(e.target as HTMLElement)}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {items.map((a) => (
          <RenderMenuItem
            key={a.key} action={a} Item={ContextMenuItem} Separator={ContextMenuSeparator}
            Sub={ContextMenuSub} SubTrigger={ContextMenuSubTrigger} SubContent={ContextMenuSubContent}
            Shortcut={ContextMenuShortcut}
          />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function RenderMenuItem({ action, Item, Separator, Sub, SubTrigger, SubContent, Shortcut }: {
  action: RowAction;
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
  Shortcut: typeof ContextMenuShortcut | typeof DropdownMenuShortcut;
}) {
  const Icon = action.icon;
  if (action.subActions) {
    const children = visibleActions(action.subActions);
    return (
      <>
        {action.separatorBefore && <Separator />}
        {/* @ts-expect-error — Sub/SubTrigger/SubContent are structurally identical between the
            ContextMenu and DropdownMenu primitive families; the union type just doesn't express it. */}
        <Sub>
          <SubTrigger disabled={action.disabled || !children.length}>
            <Icon className="h-3.5 w-3.5 mr-2" />{action.label}
          </SubTrigger>
          <SubContent className="w-56">
            {children.map((c) => (
              <Item
                key={c.key}
                onSelect={c.onSelect}
                disabled={c.disabled}
                className={c.destructive ? "text-destructive focus:text-destructive" : undefined}
              >
                <c.icon className="h-3.5 w-3.5 mr-2" />{c.label}
                {c.shortcut && <Shortcut>{c.shortcut}</Shortcut>}
              </Item>
            ))}
          </SubContent>
        </Sub>
      </>
    );
  }
  return (
    <>
      {action.separatorBefore && <Separator />}
      <Item
        onSelect={action.onSelect}
        disabled={action.disabled}
        className={action.destructive ? "text-destructive focus:text-destructive" : undefined}
      >
        <Icon className="h-3.5 w-3.5 mr-2" />{action.label}
        {action.shortcut && <Shortcut>{action.shortcut}</Shortcut>}
      </Item>
    </>
  );
}
