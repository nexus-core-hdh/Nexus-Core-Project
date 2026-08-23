"use client";

import { useEffect } from "react";
import type { RowAction } from "@/components/legacy-erp/row-actions";

// Centralized keyboard shortcuts for the Universal Action Menu (see use-universal-actions.ts).
// No shortcuts existed anywhere in this app before this hook (confirmed via full-repo search),
// so these are a fresh, deliberately conflict-avoiding set — every binding below calls the
// exact same RowAction.onSelect the right-click menu already uses, never a second code path.
//
//   Ctrl+S       Save
//   Ctrl+Alt+A   Approve
//   Ctrl+Alt+R   Disapprove (Reject)
//   Ctrl+Alt+P   Pending Orders
//   Ctrl+Alt+X   Delete            (Ctrl+Alt+Delete itself is reserved by the OS)
//
// Typing in a text input/textarea/select is left alone except for Ctrl+S (an app-wide "save
// this record" convention users expect to work anywhere on the screen); every other combo
// requires focus to be outside a text field so normal typing (e.g. Alt-based IME input) is
// never intercepted.
const KEY_MAP: Record<string, string> = {
  "ctrl+s": "save",
  "ctrl+alt+a": "approve",
  "ctrl+alt+r": "disapprove",
  "ctrl+alt+p": "pending-orders",
  "ctrl+alt+x": "delete",
};

function comboFor(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  if (["control", "alt", "shift", "meta"].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useUniversalActionShortcuts(actions: RowAction[]) {
  useEffect(() => {
    const byKey = new Map(actions.map((a) => [a.key, a]));

    const onKeyDown = (e: KeyboardEvent) => {
      const combo = comboFor(e);
      if (!combo) return;
      const actionKey = KEY_MAP[combo];
      if (!actionKey) return;
      if (combo !== "ctrl+s" && isTextEntry(e.target)) return;

      const action = byKey.get(actionKey);
      if (!action || action.hidden || action.disabled) return;

      e.preventDefault();
      e.stopPropagation();
      action.onSelect();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);
}
