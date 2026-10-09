"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const VALUE_FORMAT = "yyyy-MM-dd";
const DISPLAY_FORMAT = "dd MMM yyyy";

// Accepts the same "yyyy-MM-dd" strings a native date input uses (and tolerates a full ISO
// timestamp, which is cut to its date part).
function toDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = parse(String(value).slice(0, 10), VALUE_FORMAT, new Date());
  return isValid(d) ? d : undefined;
}

export interface DatePickerProps {
  /** "yyyy-MM-dd", or "" for no date — the same value shape as <input type="date">. */
  value?: string | null;
  /** Uncontrolled initial value, for callers that used defaultValue on a native date input. */
  defaultValue?: string | null;
  /** Called with the new "yyyy-MM-dd" value ("" when cleared). */
  onValueChange?: (value: string) => void;
  /** Drop-in compatibility with <input type="date">: receives an event-like object whose
   *  target.value holds the new "yyyy-MM-dd" value, so existing `(e) => e.target.value`
   *  handlers keep working unchanged. */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called when the calendar popup closes — lets inline grid editors commit like on input blur. */
  onBlur?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  /** Opens the calendar immediately (inline grid editors that mount focused). */
  autoFocus?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
}

export function DatePicker({
  value, defaultValue, onValueChange, onChange, onBlur, onKeyDown, autoFocus,
  min, max, disabled, readOnly, placeholder = "Pick a date", className, id, name,
}: DatePickerProps) {
  const [inner, setInner] = React.useState<string>(defaultValue ? String(defaultValue).slice(0, 10) : "");
  const current = value !== undefined ? value ?? "" : inner;
  const selected = toDate(current);
  const minDate = toDate(min);
  const maxDate = toDate(max);
  const [open, setOpen] = React.useState(!!autoFocus && !disabled && !readOnly);

  const emit = (next: string) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
    onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) onBlur?.();
  };

  const locked = disabled || readOnly;

  return (
    <Popover open={open} onOpenChange={(o) => !locked && handleOpenChange(o)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          onKeyDown={onKeyDown}
          className={cn(
            "h-9 w-full min-w-0 shrink justify-start gap-2 px-3 text-left text-sm font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">{selected ? format(selected, DISPLAY_FORMAT) : placeholder}</span>
          {selected && !locked && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              className="-mr-1 rounded-sm p-0.5 opacity-50 hover:opacity-100"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); emit(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? undefined}
          startMonth={minDate}
          endMonth={maxDate}
          disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
          onSelect={(d: Date | undefined) => {
            // Re-clicking the selected day reports undefined; keep the date (clearing is the X button).
            if (d) emit(format(d, VALUE_FORMAT));
            handleOpenChange(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
