"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Radix Select reserves "" (it means "no selection"), so an <option value=""> — the usual
// "— / clear" entry — is carried internally under this stand-in value and mapped back to "".
const EMPTY = "__option-select-empty__";

interface OptionDef {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

// Collects <option> elements from children, looking through arrays and fragments, so the
// usual `<option value="">—</option>{items.map(i => <option ...>)}` markup works unchanged.
function collectOptions(children: React.ReactNode, out: OptionDef[] = []): OptionDef[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: unknown; children?: React.ReactNode; disabled?: boolean };
    if (child.type === "option") {
      const value = props.value === undefined || props.value === null ? String(props.children ?? "") : String(props.value);
      out.push({ value, label: props.children, disabled: props.disabled });
    } else if (child.type === React.Fragment || child.type === "optgroup") {
      collectOptions(props.children, out);
    }
  });
  return out;
}

export interface OptionSelectProps {
  value?: string | number | null;
  /** Called with the selected option's value ("" for the empty option). */
  onValueChange?: (value: string) => void;
  /** Drop-in compatibility with <select>: receives an event-like object whose target.value
   *  holds the selected option's value, so existing `(e) => e.target.value` handlers work. */
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  title?: string;
  children?: React.ReactNode;
}

/**
 * shadcn (Radix) Select with the same props as a native <select> and <option> children — a
 * drop-in replacement, so a native select converts by swapping the tag only.
 */
export function OptionSelect({ value, onValueChange, onChange, disabled, className, placeholder = "Select...", id, name, title, children }: OptionSelectProps) {
  const options = collectOptions(children);
  const current = value === null || value === undefined ? "" : String(value);
  const hasEmptyOption = options.some((o) => o.value === "");
  const radixValue = current === "" ? (hasEmptyOption ? EMPTY : undefined) : current;

  const handleChange = (next: string) => {
    const actual = next === EMPTY ? "" : next;
    onValueChange?.(actual);
    onChange?.({ target: { value: actual, name }, currentTarget: { value: actual, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <Select value={radixValue} onValueChange={handleChange} disabled={disabled} name={name}>
      <SelectTrigger id={id} title={title} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY} value={o.value === "" ? EMPTY : o.value} disabled={o.disabled}>
            {o.value === "" && (o.label === undefined || o.label === null || o.label === "") ? "—" : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
