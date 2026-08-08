"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, RefreshCw, Search, Trash2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface MasterListPanelProps<T> {
  /** Panel header title, e.g. "Units". */
  title?: ReactNode;
  items: T[];
  selectedId: string | number | null;
  onSelect: (item: T) => void;
  getId: (item: T) => string | number;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | undefined;
  getIcon?: (item: T) => LucideIcon | undefined;

  /** Omit to hide the Add Item button. */
  onAdd?: () => void;
  addLabel?: string;
  /** Keeps the Add Item button visible but inert — e.g. before a parent record has been saved. */
  addDisabled?: boolean;
  /** Omit to hide the Delete Item button entirely. */
  onDelete?: (item: T) => void;
  deleteLabel?: string;
  /** Omit to hide the Refresh button (shown next to the search box). */
  onRefresh?: () => void;

  searchable?: boolean;
  searchPlaceholder?: string;

  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

/**
 * The reusable left-hand "master navigation panel": a searchable, keyboard-
 * navigable, selectable list of records, with Add/Delete actions beneath it.
 * Generic over the item type — a screen only supplies data and small accessor
 * functions (getId/getLabel/...), never markup, so this component has no idea
 * whether it's listing Units, Warehouses, BOM lines, or anything else.
 */
export function MasterListPanel<T>({
  title,
  items,
  selectedId,
  onSelect,
  getId,
  getLabel,
  getSubLabel,
  getIcon,
  onAdd,
  addLabel = "Add Item",
  addDisabled = false,
  onDelete,
  deleteLabel = "Delete Item",
  onRefresh,
  searchable = true,
  searchPlaceholder = "Search...",
  loading = false,
  emptyMessage = "No records",
  className,
}: MasterListPanelProps<T>) {
  const [query, setQuery] = useState("");
  const rowRefs = useRef(new Map<string | number, HTMLButtonElement>());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const label = getLabel(item).toLowerCase();
      const sub = getSubLabel?.(item)?.toLowerCase() ?? "";
      return label.includes(q) || sub.includes(q);
    });
  }, [items, query, getLabel, getSubLabel]);

  const selectedItem = useMemo(
    () => items.find((item) => getId(item) === selectedId) ?? null,
    [items, selectedId, getId]
  );

  const moveSelection = (direction: 1 | -1) => {
    if (filtered.length === 0) return;
    const currentIndex = filtered.findIndex((item) => getId(item) === selectedId);
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : filtered.length - 1)
      : Math.min(Math.max(currentIndex + direction, 0), filtered.length - 1);
    const next = filtered[nextIndex];
    onSelect(next);
    rowRefs.current.get(getId(next))?.scrollIntoView({ block: "nearest" });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter" && filtered.length > 0) {
      const current = filtered.find((item) => getId(item) === selectedId) ?? filtered[0];
      onSelect(current);
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-muted/20", className)}>
      {(title || searchable || onRefresh) && (
        <div className="shrink-0 space-y-2 border-b p-3">
          {(title || onRefresh) && (
            <div className="flex items-center justify-between gap-2 px-1">
              {title && <div className="text-sm font-semibold">{title}</div>}
              {onRefresh && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={onRefresh}
                  title="Refresh"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {searchable && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="h-8 pl-8 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <div
        role="listbox"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 scroll-smooth overflow-y-auto p-2 outline-none"
      >
        {loading ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          <div className="space-y-1">
            {filtered.map((item) => {
              const id = getId(item);
              const isActive = id === selectedId;
              const Icon = getIcon?.(item);
              const sub = getSubLabel?.(item);
              return (
                <button
                  key={id}
                  type="button"
                  ref={(el) => {
                    if (el) rowRefs.current.set(id, el);
                    else rowRefs.current.delete(id);
                  }}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onSelect(item)}
                  className={cn(
                    "flex w-full min-h-[52px] items-center gap-2.5 rounded-md border-l-[3px] px-3 py-2.5 text-left text-sm transition-colors duration-100",
                    isActive
                      ? "border-l-primary bg-primary/10 font-medium text-primary shadow-xs"
                      : "border-l-transparent text-foreground hover:bg-muted"
                  )}
                >
                  {Icon && <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{getLabel(item)}</span>
                    {sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(onAdd || onDelete) && (
        <div className="flex shrink-0 items-center gap-2 border-t p-2">
          {onAdd && (
            <Button type="button" variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs" onClick={onAdd} disabled={addDisabled}>
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </Button>
          )}
          {onDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!selectedItem}
              onClick={() => selectedItem && onDelete(selectedItem)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
