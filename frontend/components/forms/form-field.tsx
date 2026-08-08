import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Search, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// Mandatory Form Grid Standard: every field occupies exactly one of the three
// standard columns ("normal") unless it holds a genuinely long value — name,
// description, address, remarks, notes, explanation, or other long text — in
// which case it may span two of the three columns ("wide"). There is no other
// size. A screen never invents its own width; it only decides whether a given
// field belongs to that short whitelist.
export type FormFieldSpan = "normal" | "wide";

export function spanClass(span: FormFieldSpan) {
  return span === "wide" ? "md:col-span-2" : "";
}

// The label slot is a FIXED height (enough for up to two lines) regardless of
// how much text it holds — this is what makes every input in a row start at
// the same Y position. Without this, a field whose label happens to wrap
// ("Trading Group", "Current Account Type") grows taller than its neighbors
// and pushes its own input down relative to them, which is exactly the "some
// inputs sit higher than others" bug. Text bottom-aligns within the slot so a
// short one-line label still sits immediately above its input, just like a
// wrapped two-line one does.
const LABEL_SLOT_HEIGHT = "h-8";
// Every control (Input, Select trigger, InputGroup, Switch row) is this same
// fixed height — the actual baseline every row aligns to.
const CONTROL_HEIGHT = "h-9";
const fieldInputClass = cn(CONTROL_HEIGHT, "text-sm");

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    // overflow-hidden on the fixed-height wrapper (not the Label itself — the base
    // Label component is `display: flex`, which can't be combined with line-clamp's
    // `-webkit-box` display) guarantees the slot can never grow past two lines even
    // in a pathological long-label case, with zero risk of layout shift.
    <div className={cn(LABEL_SLOT_HEIGHT, "flex items-end overflow-hidden")}>
      <Label className="text-[11px] font-semibold uppercase tracking-wide leading-tight text-muted-foreground/80">
        {children}
      </Label>
    </div>
  );
}

export function FormTextField({
  label, value, onChange, lookup, type = "text", span = "normal",
}: {
  label: string; value: any; onChange: (v: any) => void; lookup?: boolean; type?: string; span?: FormFieldSpan;
}) {
  if (lookup) {
    return (
      <div className={cn("space-y-2", spanClass(span))}>
        <FieldLabel>{label}</FieldLabel>
        <InputGroup className={CONTROL_HEIGHT}>
          <InputGroupInput type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="text-sm" />
          <InputGroupAddon align="inline-end">
            <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
          </InputGroupAddon>
        </InputGroup>
      </div>
    );
  }
  return (
    <div className={cn("space-y-2", spanClass(span))}>
      <FieldLabel>{label}</FieldLabel>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={fieldInputClass} />
    </div>
  );
}

export function FormSwitchField({
  label, checked, onChange, span = "normal",
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; span?: FormFieldSpan;
}) {
  return (
    <div className={cn("space-y-2", spanClass(span))}>
      {/* Empty spacer matching FieldLabel's fixed height — a switch has no label
          above it, but still needs to push its control down to the same Y as
          every text/select field's input in the row. */}
      <div className={LABEL_SLOT_HEIGHT} aria-hidden="true" />
      <label className={cn(CONTROL_HEIGHT, "flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-3 transition-colors hover:border-border hover:bg-muted/40")}>
        <Switch checked={!!checked} onCheckedChange={onChange} />
        <span className="text-sm text-foreground/90">{label}</span>
      </label>
    </div>
  );
}

export function FormSelectField({
  label, value, onChange, options, span = "normal",
}: {
  label: string; value: any; onChange: (v: string) => void; options: { value: string; label: string }[]; span?: FormFieldSpan;
}) {
  return (
    <div className={cn("space-y-2", spanClass(span))}>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value !== null && value !== undefined && value !== "" ? String(value) : undefined} onValueChange={onChange}>
        <SelectTrigger className={cn(fieldInputClass, "w-full")}><SelectValue placeholder="Select..." /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// Shared "Factor / Divisor" compound field — two number boxes separated by a slash under
// one label (e.g. Withholding > Purchase: "12 / 100"). First built as a Yarn Card-local
// helper; promoted here so Fabric Card (and any future IM_Item-based card screen with the
// same Withholding shape) can reuse it instead of redefining it per screen. Yarn Card's own
// local copy is left as-is — not worth touching working code to dedupe retroactively.
export function FormFactorDivisorField({
  label, factor, divisor, onFactorChange, onDivisorChange, span = "normal",
}: {
  label: string; factor: any; divisor: any; onFactorChange: (v: string) => void; onDivisorChange: (v: string) => void; span?: FormFieldSpan;
}) {
  return (
    <div className={cn("space-y-2", spanClass(span))}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={factor ?? ""}
          onChange={(e) => onFactorChange(e.target.value)}
          className={cn(CONTROL_HEIGHT, "w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50")}
        />
        <span className="text-muted-foreground">/</span>
        <input
          type="number"
          value={divisor ?? ""}
          onChange={(e) => onDivisorChange(e.target.value)}
          className={cn(CONTROL_HEIGHT, "w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50")}
        />
      </div>
    </div>
  );
}

// Standard numeric stepper field — integer-only, with a floor (default 1) and no ceiling
// unless a caller supplies one. No such component existed anywhere in the codebase before
// this (verified); built here, next to FormTextField/FormSelectField, so any future screen
// needing a bounded quantity/count field reuses this instead of a one-off per screen.
export function FormNumberStepperField({
  label, value, onChange, min = 1, step = 1, span = "normal", errorMessage,
}: {
  label: string; value: any; onChange: (v: string) => void; min?: number; step?: number; span?: FormFieldSpan; errorMessage?: string;
}) {
  const invalid = !!errorMessage;

  const bump = (delta: number) => {
    const current = value === "" || value === null || value === undefined || Number.isNaN(Number(value)) ? min - delta : Math.trunc(Number(value));
    onChange(String(Math.max(min, current + delta)));
  };

  return (
    <div className={cn("space-y-2", spanClass(span))}>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup className={cn(CONTROL_HEIGHT, invalid && "border-destructive ring-destructive/20")}>
        <InputGroupAddon>
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={`Decrease ${label}`}
            onClick={() => bump(-step)}
          >
            <Minus className="h-3.5 w-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          // Blocks the keystrokes that would otherwise let a plain type="number" input hold a
          // decimal point, a sign, or scientific notation ("e"/"E") — min/step alone only
          // affect the browser's own spinner buttons and :invalid state, not what can be typed.
          onKeyDown={(e) => { if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault(); }}
          onPaste={(e) => {
            e.preventDefault();
            const digits = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
            if (digits) onChange(digits);
          }}
          className="text-center text-sm"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={`Increase ${label}`}
            onClick={() => bump(step)}
          >
            <Plus className="h-3.5 w-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
  );
}
