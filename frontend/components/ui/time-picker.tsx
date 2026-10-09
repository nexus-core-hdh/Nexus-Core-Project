"use client";

import * as React from "react";
import { ClockIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, "0");

// "HH:mm" (24-hour, the same value shape as <input type="time">) <-> 12-hour parts for display.
function parseTime(value?: string | null): { hour12: number; minute: number; pm: boolean } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const minute = Number(m[2]);
  if (h > 23 || minute > 59) return null;
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute, pm: h >= 12 };
}
const toValue = (hour12: number, minute: number, pm: boolean) => `${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;

export interface TimePickerProps {
  /** "HH:mm" in 24-hour time, or "" for no time — the same value shape as <input type="time">. */
  value?: string | null;
  onValueChange?: (value: string) => void;
  /** Drop-in compatibility with <input type="time">: receives an event-like object whose
   *  target.value holds the new "HH:mm" value. */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called when the popup closes. */
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
}

export function TimePicker({ value, onValueChange, onChange, onBlur, disabled, placeholder = "Pick a time", className, id, name }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const parts = parseTime(value);

  const emit = (next: string) => {
    onValueChange?.(next);
    onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };
  // Picking any one column fills the others from the current value (or 12:00 AM when empty).
  const pick = (patch: Partial<{ hour12: number; minute: number; pm: boolean }>) => {
    const base = parts ?? { hour12: 12, minute: 0, pm: false };
    const next = { ...base, ...patch };
    emit(toValue(next.hour12, next.minute, next.pm));
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) onBlur?.();
  };

  const cell = (active: boolean) =>
    cn("h-8 w-full shrink-0 rounded-md px-2 text-sm tabular-nums transition-colors hover:bg-accent", active && "bg-primary text-primary-foreground hover:bg-primary");

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && handleOpenChange(o)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn("h-9 w-full min-w-0 shrink justify-start gap-2 px-3 text-left text-sm font-normal", !parts && "text-muted-foreground", className)}
        >
          <ClockIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate tabular-nums">{parts ? `${pad(parts.hour12)}:${pad(parts.minute)} ${parts.pm ? "PM" : "AM"}` : placeholder}</span>
          {parts && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear time"
              className="-mr-1 rounded-sm p-0.5 opacity-50 hover:opacity-100"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); emit(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          <div className="flex h-56 w-14 flex-col gap-0.5 overflow-y-auto pr-1">
            {HOURS.map((h) => <button key={h} type="button" className={cell(parts?.hour12 === h)} onClick={() => pick({ hour12: h })}>{pad(h)}</button>)}
          </div>
          <div className="flex h-56 w-14 flex-col gap-0.5 overflow-y-auto border-l pl-1 pr-1">
            {MINUTES.map((m) => <button key={m} type="button" className={cell(parts?.minute === m)} onClick={() => pick({ minute: m })}>{pad(m)}</button>)}
          </div>
          <div className="flex w-14 flex-col gap-0.5 border-l pl-1">
            {[false, true].map((pm) => <button key={String(pm)} type="button" className={cell(!!parts && parts.pm === pm)} onClick={() => pick({ pm })}>{pm ? "PM" : "AM"}</button>)}
          </div>
        </div>
        <div className="mt-2 flex justify-end border-t pt-2">
          <Button type="button" size="sm" className="h-7 text-xs" onClick={() => handleOpenChange(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
