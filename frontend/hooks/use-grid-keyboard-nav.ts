"use client";

import { useCallback } from "react";

// Excel-style keyboard movement for grids whose cells are always-live inputs (no separate
// view/edit mode — e.g. the Costing sheet grids). Works purely from the rendered DOM, so it
// automatically follows the user's current column order / hidden columns (useGridColumns):
//
//   <tbody onKeyDown={nav.onKeyDown}> ... <td data-nav="text|number|lookup"><input/></td>
//
// Only cells marked data-nav take part; read-only cells (no data-nav) are skipped.
//   Tab / Shift+Tab   next / previous editable cell (across rows); leaves the grid at either end
//   Enter             commit and move to the same column in the next row (else the next cell)
//   ArrowUp / Down    same column, previous / next row
//   ArrowLeft / Right previous / next cell when the caret is at the start / end (or the whole
//                     value is selected, as it is right after moving into a cell)
// "lookup" cells (searchable pickers such as AutocompleteTextCell) keep Enter and the arrow keys
// for their own suggestion list; only Tab / Shift+Tab move out of them.
// The target cell's input is focused and fully selected, so typing replaces its value.
export function useGridKeyboardNav() {
  const focusCell = useCallback((td: Element | null | undefined) => {
    const input = td?.querySelector<HTMLInputElement>("input:not([disabled])");
    if (!input) return false;
    // After the current key's own handlers (and the re-render they trigger) have run, so a
    // cell committing on blur sees its final value.
    requestAnimationFrame(() => {
      input.focus();
      try { input.select(); } catch { /* not a text input */ }
    });
    return true;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    const td = target.closest<HTMLElement>("td[data-nav]");
    if (!td || !e.currentTarget.contains(td)) return;
    const kind = td.dataset.nav;
    const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("td[data-nav]"));
    const idx = cells.indexOf(td);
    const tr = td.parentElement as HTMLElement;
    const colIdx = Array.from(tr.children).indexOf(td);
    const vertical = (dir: 1 | -1) => {
      let row = (dir > 0 ? tr.nextElementSibling : tr.previousElementSibling) as HTMLElement | null;
      while (row) {
        const cell = row.children[colIdx] as HTMLElement | undefined;
        if (cell?.matches("td[data-nav]")) return cell;
        row = (dir > 0 ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      }
      return null;
    };
    const move = (next: Element | null | undefined) => { if (next && focusCell(next)) e.preventDefault(); };
    const input = target as HTMLInputElement;

    switch (e.key) {
      case "Tab":
        move(cells[idx + (e.shiftKey ? -1 : 1)]);
        return;
      case "Enter":
        if (kind === "lookup") return;
        e.preventDefault();
        move(vertical(1) ?? cells[idx + 1]);
        return;
      case "ArrowDown":
      case "ArrowUp":
        if (kind === "lookup") return;
        e.preventDefault(); // never let the key change a value
        move(vertical(e.key === "ArrowDown" ? 1 : -1));
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        if (kind === "lookup") return;
        const len = input.value.length;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const wholeSelected = len > 0 && start === 0 && end === len;
        const atEdge = e.key === "ArrowLeft" ? start === 0 && end === 0 : start === len && end === len;
        if (wholeSelected || atEdge) move(cells[idx + (e.key === "ArrowLeft" ? -1 : 1)]);
        return;
      }
    }
  }, [focusCell]);

  return { onKeyDown };
}
