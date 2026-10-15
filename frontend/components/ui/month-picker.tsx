"use client";

import * as React from "react";
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "yyyy-MM" — the same value shape as <input type="month">.
function parseMonth(value?: string | null): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(value ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

export interface MonthPickerProps {
  /** "yyyy-MM", or "" for no month. */
  value?: string | null;
  onValueChange?: (value: string) => void;
  /** Drop-in compatibility with <input type="month">: receives an event-like object whose
   *  target.value holds the new "yyyy-MM" value. */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
}

export function MonthPicker({ value, onValueChange, onChange, disabled, placeholder = "Pick a month", className, id, name }: MonthPickerProps) {
  const selected = parseMonth(value);
  const [open, setOpen] = React.useState(false);
  const [year, setYear] = React.useState(selected?.year ?? new Date().getFullYear());

  const emit = (next: string) => {
    onValueChange?.(next);
    onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const handleOpenChange = (next: boolean) => {
    // Re-open on the selected year rather than wherever the user last browsed to.
    if (next) setYear(selected?.year ?? new Date().getFullYear());
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && handleOpenChange(o)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn("h-9 w-full min-w-0 shrink justify-start gap-2 px-3 text-left text-sm font-normal", !selected && "text-muted-foreground", className)}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">{selected ? `${MONTHS[selected.month]} ${selected.year}` : placeholder}</span>
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear month"
              className="-mr-1 rounded-sm p-0.5 opacity-50 hover:opacity-100"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); emit(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-3 flex items-center justify-between">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">{year}</span>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((label, i) => {
            const active = selected?.year === year && selected.month === i;
            return (
              <Button
                key={label}
                type="button"
                variant={active ? "default" : "ghost"}
                size="sm"
                className="h-8 text-sm font-normal"
                onClick={() => { emit(`${year}-${String(i + 1).padStart(2, "0")}`); setOpen(false); }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
