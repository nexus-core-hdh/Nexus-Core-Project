"use client";

import * as React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseDealQuery, tokenizeDealQuery } from "@/lib/deal-advanced-query";

export type DealQuerySuggestion = {
  value: string;
  kind: "field" | "op" | "keyword" | "value";
};

const OPERATORS: DealQuerySuggestion[] = [
  { value: "=", kind: "op" },
  { value: "!=", kind: "op" },
  { value: ">", kind: "op" },
  { value: ">=", kind: "op" },
  { value: "<", kind: "op" },
  { value: "<=", kind: "op" },
  { value: "IN", kind: "op" },
  { value: "CONTAINS", kind: "op" },
];

const KEYWORDS: DealQuerySuggestion[] = [
  { value: "AND", kind: "keyword" },
  { value: "OR", kind: "keyword" },
  { value: "(", kind: "keyword" },
  { value: ")", kind: "keyword" },
  { value: "IS NULL", kind: "keyword" },
  { value: "IS NOT NULL", kind: "keyword" },
];

function kindBadge(kind: DealQuerySuggestion["kind"]) {
  if (kind === "field") return "Field";
  if (kind === "op") return "Op";
  if (kind === "value") return "Val";
  return "Key";
}

function insertAtCursor(input: HTMLInputElement, insert: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);

  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before) && insert !== ")" && insert !== ",";
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after) && insert !== "(";

  const next = `${before}${needsSpaceBefore ? " " : ""}${insert}${needsSpaceAfter ? " " : ""}${after}`;
  const caret = (before + (needsSpaceBefore ? " " : "") + insert + (needsSpaceAfter ? " " : "")).length;

  input.value = next;
  input.setSelectionRange(caret, caret);
}

function replaceTokenAtCursor(input: HTMLInputElement, insert: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  const beforeFull = input.value.slice(0, start);
  const afterFull = input.value.slice(end);

  // Replace the current "token" fragment at the caret (e.g. "em" -> "email")
  const tokenMatch = beforeFull.match(/([A-Za-z0-9_.\-"]+)$/);
  const tokenStart = tokenMatch ? beforeFull.length - tokenMatch[1].length : beforeFull.length;

  const before = input.value.slice(0, tokenStart);
  const after = afterFull;

  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before) && insert !== ")" && insert !== ",";
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after) && insert !== "(";

  const next = `${before}${needsSpaceBefore ? " " : ""}${insert}${needsSpaceAfter ? " " : ""}${after}`;
  const caret = (before + (needsSpaceBefore ? " " : "") + insert + (needsSpaceAfter ? " " : "")).length;

  input.value = next;
  input.setSelectionRange(caret, caret);
}

export function DealFilterQueryInput({
  value,
  onChange,
  fieldNames,
  valueSuggestionsByField,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  fieldNames: string[];
  valueSuggestionsByField?: Record<string, Array<string | number>>;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [suggestMode, setSuggestMode] = React.useState<"typing" | "afterSpace">("typing");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const updateSearchFromCursor = React.useCallback((nextValue: string, cursor: number) => {
    const before = nextValue.slice(0, cursor);
    if (/\s$/.test(before)) {
      setSearch("");
      return;
    }
    // Grab the "current token" segment near the caret, used to filter suggestions while typing
    const m = before.match(/([A-Za-z0-9_.\-"]+)\s*$/);
    setSearch((m?.[1] || "").replaceAll('"', ""));
  }, []);

  const fieldSuggestions: DealQuerySuggestion[] = React.useMemo(
    () => (fieldNames || []).map((f) => ({ value: f, kind: "field" as const })),
    [fieldNames]
  );

  const guessContext = React.useCallback(() => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? (value || "").length;
    const before = (value || "").slice(0, cursor);
    const tokens = tokenizeDealQuery(before);
    const last = tokens[tokens.length - 1];

    // Determine what we should suggest next.
    // After a field -> operators. After operator/IN/CONTAINS -> values. After AND/OR/( -> fields.
    if (!last) return { expect: "field" as const, field: null as string | null };
    if (last.type === "keyword" && (last.value === "AND" || last.value === "OR")) {
      return { expect: "field" as const, field: null };
    }
    if (last.type === "lparen") return { expect: "field" as const, field: null };

    // If we have "... <field>" then suggest operator
    if (last.type === "ident") {
      return { expect: "op" as const, field: last.value };
    }

    // If last token is an operator, suggest values
    if (last.type === "op") {
      // try to find nearest field before it
      const prevField = [...tokens].reverse().find((t) => t.type === "ident") as any;
      return { expect: "value" as const, field: prevField?.value || null };
    }

    if (last.type === "keyword" && (last.value === "IN" || last.value === "CONTAINS")) {
      const prevField = [...tokens].reverse().find((t) => t.type === "ident") as any;
      return { expect: "value" as const, field: prevField?.value || null };
    }

    return { expect: "any" as const, field: null };
  }, [value]);

  const all = React.useMemo(() => {
    const ctx = guessContext();
    const vals: DealQuerySuggestion[] =
      ctx.expect === "value" && ctx.field && valueSuggestionsByField?.[ctx.field]
        ? valueSuggestionsByField[ctx.field].map((v) => ({
            // Allow unquoted simple tokens in IN(...)
            value:
              typeof v === "string"
                ? /^[a-zA-Z0-9_.-]+$/.test(v)
                  ? v
                  : `"${v}"`
                : String(v),
            kind: "value" as const,
          }))
        : [];

    if (ctx.expect === "field") return [...fieldSuggestions, ...KEYWORDS];
    if (ctx.expect === "op") {
      // Only show operator suggestions after the user commits the field (space/tab),
      // otherwise keep suggesting fields while typing.
      return suggestMode === "afterSpace" ? [...OPERATORS, ...KEYWORDS] : [...fieldSuggestions, ...KEYWORDS];
    }
    if (ctx.expect === "value") return [...vals, ...KEYWORDS];
    return [...fieldSuggestions, ...OPERATORS, ...vals, ...KEYWORDS];
  }, [fieldSuggestions, guessContext, valueSuggestionsByField, suggestMode]);

  React.useEffect(() => {
    if (!value.trim()) {
      setError(null);
      return;
    }
    const parsed = parseDealQuery(value);
    setError(parsed.ok ? null : parsed.error);
  }, [value]);

  // When external value changes, keep the suggestion filter in sync
  React.useEffect(() => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? (value || "").length;
    updateSearchFromCursor(value || "", cursor);
  }, [value, updateSearchFromCursor]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              const cursor = e.target.selectionStart ?? e.target.value.length;
              const before = e.target.value.slice(0, cursor);
              setSuggestMode(/\s$/.test(before) ? "afterSpace" : "typing");
              onChange(e.target.value);
              updateSearchFromCursor(e.target.value, cursor);
              setOpen(true);
            }}
            onFocus={(e) => {
              const cursor = (e.target as HTMLInputElement).selectionStart ?? value.length;
              updateSearchFromCursor(value || "", cursor);
              // Do not open suggestions on focus; only while typing.
            }}
            onClick={(e) => {
              const el = e.target as HTMLInputElement;
              const cursor = el.selectionStart ?? el.value.length;
              updateSearchFromCursor(el.value, cursor);
              // Do not open suggestions on click; only while typing.
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Tab") {
                // Use Tab as "commit token"; keep focus in query input
                e.preventDefault();
                setSuggestMode("afterSpace");
                updateSearchFromCursor(value + " ", (inputRef.current?.selectionStart ?? value.length) + 1);
                setOpen(true);
              }
            }}
            placeholder={placeholder || "e.g. amount >= 1000 AND status = inProgress"}
            className="font-mono"
          />
          {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Suggestions:</span>
            <span className="rounded border px-1.5 py-0.5">field</span>
            <span className="rounded border px-1.5 py-0.5">= != &gt; &lt; in contains</span>
            <span className="rounded border px-1.5 py-0.5">AND OR</span>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[520px]"
        align="start"
        onOpenAutoFocus={(e) => {
          // Keep typing focus in the query input.
          // Otherwise cmdk's CommandInput can steal focus and "eat" the next character.
          e.preventDefault();
        }}
      >
        <Command
          filter={(itemValue, search) => {
            const v = itemValue.toLowerCase();
            const s = search.toLowerCase();
            return v.includes(s) ? 1 : 0;
          }}
        >
          {/* Hidden: we use cmdk's filtering but don't want this input to capture typing */}
          <CommandInput value={search} onValueChange={setSearch} className="hidden" />
          <CommandList>
            <CommandEmpty>No suggestions</CommandEmpty>
            <CommandGroup heading="Suggestions">
              {all.map((sug) => (
                <CommandItem
                  key={`${sug.kind}:${sug.value}`}
                  value={sug.value}
                  onSelect={() => {
                    const el = inputRef.current;
                    if (el) {
                      replaceTokenAtCursor(el, sug.value);
                      onChange(el.value);
                      updateSearchFromCursor(el.value, el.selectionStart ?? el.value.length);
                      el.focus();
                    }
                    setOpen(false);
                  }}
                >
                  <Badge variant="secondary" className={cn("mr-2", sug.kind === "field" && "bg-muted")}>
                    {kindBadge(sug.kind)}
                  </Badge>
                  <span className="font-mono">{sug.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

