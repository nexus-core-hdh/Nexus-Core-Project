"use client";

import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from "@/components/ui/input-group";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldLabel, spanClass, type FormFieldSpan } from "@/components/forms/form-field";
import { LookupDialog } from "./lookup-dialog";

interface LookupFieldProps<T> {
  label: string;
  displayValue: string;
  onSelect: (item: T) => void;
  fetchOptions: (search: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  getValue: (item: T) => string | number;
  span?: FormFieldSpan;
}

export function LookupField<T>({ label, displayValue, onSelect, fetchOptions, getLabel, getValue, span = "normal" }: LookupFieldProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("space-y-2", spanClass(span))}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <InputGroup className="h-9 cursor-pointer" onClick={() => setOpen(true)}>
        <InputGroupInput readOnly value={displayValue ?? ""} placeholder="Search..." className="cursor-pointer" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={`Search ${label}`}>
            <Search className="h-3.5 w-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <LookupDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        fetchOptions={fetchOptions}
        getLabel={getLabel}
        getValue={getValue}
        onSelect={onSelect}
      />
    </div>
  );
}
