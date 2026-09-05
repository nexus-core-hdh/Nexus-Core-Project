"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LookupField } from "@/components/legacy-erp/lookup-field";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { toast } from "sonner";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Search, Save, FilePlus2, Plus, Trash2, Scissors, ListX, Settings2, ListOrdered } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSwitchField } from "@/components/forms/form-field";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { cn } from "@/lib/utils";
import { GridInput, uid } from "./_components/grid-input";

interface TrimLine {
  id: string; // local uid for new rows, or the real numeric id (as string) once persisted
  savedId: number | null;
  trimCode: string; trimName: string; explanation: string;
  orderQuantity: string; unit: string; quantity: string; wastePct: string;
  forexId: string; forexPrice: string; unitPrice: string;
  // Real Trim Card (IM_Item, AccessCode='TRIM') RecId the row's Trim Code was picked from — the
  // dependency-flow anchor for Name/Unit auto-binding. Client-side only: MA_YarnTrimCardItem has
  // no FK column to IM_Item (TrimCode/TrimName/Unit are plain varchar, confirmed live against the
  // actual table), so there is nothing to persist this into — Save keeps writing TrimCode/
  // TrimName/Unit as text through the existing columns, exactly as before. On reload it's
  // re-resolved by matching the saved TrimCode against the live Trim Card list (see loadLines).
  trimInventoryId: number | null;
}

const emptyForm = {
  code: "", explanation: "", inUse: true,
  customerId: "" as string | number, customerLabel: "",
  styleGroupId: "" as string | number, styleGroupLabel: "",
  brandId: "" as string | number, brandLabel: "",
  styleDepartmentId: "" as string | number, styleDepartmentLabel: "",
};

const blankLine = (): TrimLine => ({
  id: uid(), savedId: null, trimCode: "", trimName: "", explanation: "",
  orderQuantity: "", unit: "", quantity: "", wastePct: "", forexId: "", forexPrice: "", unitPrice: "",
  trimInventoryId: null,
});

// ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns.
// storageKey "trimCardGrid" is net-new (this grid never had column customization before).
type ColKey = "trimCode" | "trimName" | "explanation" | "orderQuantity" | "unit" | "quantity" | "wastePct" | "forexId" | "forexPrice" | "unitPrice";
type ColumnDef = { key: ColKey; label: string; align?: "left" | "right" };
const COLUMNS: ColumnDef[] = [
  { key: "trimCode", label: "Trim Code" },
  { key: "trimName", label: "Trim Name" },
  { key: "explanation", label: "Explanation" },
  { key: "orderQuantity", label: "Order Qty", align: "right" },
  { key: "unit", label: "Unit" },
  { key: "quantity", label: "Quantity", align: "right" },
  { key: "wastePct", label: "Waste %", align: "right" },
  { key: "forexId", label: "Forex" },
  { key: "forexPrice", label: "Forex Price", align: "right" },
  { key: "unitPrice", label: "Unit Price", align: "right" },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
// Trim Code/Name identify the line and always stay first & visible — same rule every other
// legacy-erp line grid's own Code/Name pair follows.
const FIXED_COLS: ColKey[] = ["trimCode", "trimName"];
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  trimCode: 150, trimName: 200, explanation: 200, orderQuantity: 110, unit: 90,
  quantity: 100, wastePct: 90, forexId: 100, forexPrice: 110, unitPrice: 110,
};
const MIN_WIDTHS: Record<ColKey, number> = {
  trimCode: 110, trimName: 140, explanation: 130, orderQuantity: 80, unit: 70,
  quantity: 80, wastePct: 70, forexId: 76, forexPrice: 90, unitPrice: 90,
};
const DEL_W = 40;

export default function CustomerDefineTrimsPage() {
  const [codeInput, setCodeInput] = useState("");
  const [trimCardId, setTrimCardId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  // A brand-new, unsaved Customer Define Trim always starts with exactly one empty, ready-to-use
  // row — never an empty grid requiring "Add Row" before Trim Code can even be selected.
  const [lines, setLines] = useState<TrimLine[]>(() => [blankLine()]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("General");
  // Decimal Parameters (Settings -> Screen Parameters -> Decimal) — round-on-blur for
  // Quantity/Unit Price cells below, via the shared decimalKey mechanism.
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Real Trim Card master data (IM_Item, AccessCode='TRIM') — the SAME source
  // trim-inventory-cards/page.tsx (the Trim Card screen itself) reads and writes, via the
  // existing TrimInventoryCardService/API. Fetched once (same "one unscoped list call, filter
  // client-side while typing" convention purchase-order-line-grid.tsx already established for
  // its own Code field) — no hardcoded Trim Codes, no second/duplicate lookup.
  const [trimCardOptions, setTrimCardOptions] = useState<AutocompleteOption[]>([]);
  useEffect(() => {
    legacyErpApi.trimInventoryCards.list()
      .then((r: any) => setTrimCardOptions(Array.isArray(r) ? r.map((t: any) => ({ id: String(t.id), code: t.inventoryCode, name: t.inventoryName })) : []))
      .catch(() => {});
  }, []);

  // Per-Trim-Card valid Unit options (IM_ItemUnitItemSize), keyed by trimInventoryId — the EXACT
  // same lookupItemUnits() endpoint/table Purchase Order's own per-line Unit cell already binds
  // to (see purchase-order-line-grid.tsx's itemUnitsByInventoryId), reused as-is rather than a
  // new Unit master/lookup. Sorted IsMainUnit DESC server-side, so index 0 is always the Trim
  // Card's own configured (main) Unit.
  const [unitOptionsByTrim, setUnitOptionsByTrim] = useState<Record<string, AutocompleteOption[]>>({});
  const unitOptionsRef = useRef(unitOptionsByTrim);
  unitOptionsRef.current = unitOptionsByTrim;
  const ensureUnitOptionsLoaded = useCallback((trimInventoryId: number, onLoaded?: (opts: AutocompleteOption[]) => void) => {
    const key = String(trimInventoryId);
    const cached = unitOptionsRef.current[key];
    if (cached) { onLoaded?.(cached); return; }
    legacyErpApi.lookupItemUnits(trimInventoryId)
      .then((r: any) => {
        const opts: AutocompleteOption[] = Array.isArray(r) ? r.map((u: any) => ({ id: String(u.id), code: u.code, name: u.name })) : [];
        setUnitOptionsByTrim((prev) => ({ ...prev, [key]: opts }));
        onLoaded?.(opts);
      })
      .catch(() => setUnitOptionsByTrim((prev) => ({ ...prev, [key]: [] })));
  }, []);

  // Which single cell (row + field) currently has its searchable editor mounted — this screen's
  // other cells are permanently-mounted plain inputs (no click-to-edit), so Trim Code/Unit use
  // this minimal local gate purely to keep AutocompleteTextCell's suggestion popover closed until
  // the user actually activates the cell, matching every other lookup cell's closed-at-rest
  // behavior in the app (see autocomplete-text-cell.tsx's own startOpen comment).
  const [activeAutocomplete, setActiveAutocomplete] = useState<{ lineId: string; field: "trimCode" | "unit" } | null>(null);

  // Shows the code the next Save will get, before Save is ever pressed — a preview only (see
  // trim-card.controller.ts's next-code route). Mirrors yarn-cards/page.tsx's own
  // loadPreviewCode; Code is never user-editable here.
  const loadPreviewCode = async () => {
    try {
      const r: any = await legacyErpApi.trimCards.previewNextCode();
      set("code", r.code);
      lastSavedRef.current = { ...lastSavedRef.current, form: { ...lastSavedRef.current.form, code: r.code } };
    } catch {
      // Non-critical — Save still generates the real code even if this preview fails to load.
    }
  };

  useEffect(() => {
    loadPreviewCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracks the last loaded/saved {form, lines} snapshot so the Workspace Tab Bar
  // can warn before closing a tab with unsaved edits. Only updated at clean-state
  // moments (initial state, search, save, New) — never by `set()`/`updateLine()`,
  // which is exactly what should make the screen "dirty".
  // Seeded with the SAME `lines` array the initial useState above already produced (not a fresh
  // `[]`) — otherwise the default row would make a brand-new, untouched screen look "dirty" the
  // instant it opens, since isDirty below is a plain JSON.stringify comparison against this ref.
  const lastSavedRef = useRef<{ form: any; lines: TrimLine[] }>({ form: emptyForm, lines });
  const { clearDraft } = useDraftForm({ storageKey: "trimCardDraft", enabled: trimCardId == null, form, setForm });

  const loadLines = async (id: number) => {
    const rows: any = await legacyErpApi.trimCards.listItems(id);
    const list = Array.isArray(rows) ? rows : [];
    const mapped = list.map((r: any) => {
      // No persisted FK to re-derive from (see TrimLine's own comment) — a saved row's
      // TrimCode is matched back against the live Trim Card list on a best-effort basis, purely
      // so further edits (e.g. changing Unit) still have a resolved id to fetch valid units
      // from. An unmatched code (Trim Card since renamed/deleted) just leaves it null — the
      // saved TrimCode/TrimName/Unit text still displays exactly as before, never erased.
      const matched = trimCardOptions.find((o) => o.code === r.trimCode);
      return {
        id: String(r.id), savedId: r.id,
        trimCode: r.trimCode ?? "", trimName: r.trimName ?? "", explanation: r.explanation ?? "",
        orderQuantity: r.orderQuantity ?? "", unit: r.unit ?? "", quantity: r.quantity ?? "",
        wastePct: r.wastePct ?? "", forexId: r.forexId ?? "", forexPrice: r.forexPrice ?? "", unitPrice: r.unitPrice ?? "",
        trimInventoryId: matched ? Number(matched.id) : null,
      };
    });
    // Prefetch each resolved row's valid Unit options (no autofill — an already-saved Unit value
    // must never be overwritten just because the grid reloaded), same prefetch-on-load courtesy
    // purchase-order-line-grid.tsx already gives its own Unit cell.
    new Set(mapped.map((r) => r.trimInventoryId).filter((v): v is number => v != null)).forEach((id) => ensureUnitOptionsLoaded(id));
    // Never leaves the grid with zero rows: an existing Customer's previously-saved lines are
    // shown exactly as saved, but a record that (still) has none — brand new, or every line was
    // removed — always gets the one ready-to-use empty row back, matching what a fresh "New"
    // already shows. Add Row remains the only way to get a SECOND row.
    const withDefault = mapped.length ? mapped : [blankLine()];
    setLines(withDefault);
    return withDefault;
  };

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.trimCards.getByCode(codeInput.trim());
      // trim-card.service.ts's get()/getByCode() return the bare CustomerId FK only (no join —
      // see that file's own comment: "the Customer Define Trim form already resolves the
      // customer via its own LookupField"), so a loaded/reloaded record needs an explicit
      // resolve here, same pattern purchase-orders/page.tsx uses for its own Current Account
      // field. accounts.get() (unlike accounts.list()) returns the full FI_Account row under
      // its raw camelCase names — currentAccountCode/currentAccountName, not code/name.
      const customer = r.customerId ? await legacyErpApi.accounts.get(r.customerId).catch(() => null) : null;
      const loadedForm = {
        ...emptyForm, ...r,
        customerLabel: customer ? `${(customer as any).currentAccountCode} — ${(customer as any).currentAccountName}` : "",
      };
      setForm(loadedForm);
      setTrimCardId(r.id);
      const loadedLines = await loadLines(r.id);
      lastSavedRef.current = { form: loadedForm, lines: loadedLines };
      toast.success("Loaded");
    } catch {
      toast.error("No trim card found with that code");
      setTrimCardId(null);
      const resetLines = [blankLine()];
      setLines(resetLines);
      setForm(emptyForm);
      lastSavedRef.current = { form: emptyForm, lines: resetLines };
      loadPreviewCode();
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setTrimCardId(null);
    setCodeInput("");
    setForm(emptyForm);
    const resetLines = [blankLine()];
    setLines(resetLines);
    lastSavedRef.current = { form: emptyForm, lines: resetLines };
    loadPreviewCode();
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        code: form.code, explanation: form.explanation, inUse: form.inUse,
        customerId: form.customerId || undefined,
        styleGroupId: form.styleGroupId || undefined,
        brandId: form.brandId || undefined,
        styleDepartmentId: form.styleDepartmentId || undefined,
      };
      let id = trimCardId;
      let savedForm: any;
      if (id) {
        const r: any = await legacyErpApi.trimCards.update(id, payload);
        setForm((p: any) => { savedForm = { ...p, ...r }; return savedForm; });
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.trimCards.create(payload);
        id = r.id;
        setTrimCardId(id);
        setCodeInput(r.code);
        setForm((p: any) => { savedForm = { ...p, ...r }; return savedForm; });
        clearDraft();
        toast.success("Created");
      }

      // Persist grid rows: create new ones, update changed existing ones. Decimal Parameters
      // rounding happens HERE (not just via each cell's own GridInput decimalKey, which is
      // visual round-on-blur only) — this is the one place each line is actually sent to the
      // API. Same rationale as bom-tab.tsx's own save().
      for (const line of lines) {
        const body = {
          trimCode: line.trimCode, trimName: line.trimName, explanation: line.explanation,
          orderQuantity: line.orderQuantity ? round(line.orderQuantity, "quantity") : undefined, unit: line.unit || undefined,
          quantity: line.quantity ? round(line.quantity, "quantity") : undefined, wastePct: line.wastePct || undefined,
          forexId: line.forexId || undefined, forexPrice: line.forexPrice || undefined,
          unitPrice: line.unitPrice ? round(line.unitPrice, "unit-price") : undefined,
        };
        if (!line.trimCode && !line.trimName) continue; // skip fully-blank rows
        if (line.savedId) await legacyErpApi.trimCards.updateItem(id!, line.savedId, body);
        else await legacyErpApi.trimCards.createItem(id!, body);
      }
      const savedLines = await loadLines(id!);
      lastSavedRef.current = { form: savedForm, lines: savedLines };
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addLine = () => setLines((p) => [...p, blankLine()]);
  const updateLine = (id: string, patch: Partial<TrimLine>) => setLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Picking a real Trim Card is the ONLY way a row's dependent Name/Unit get bound — Code is
  // the source selection, Name and Unit are dependent values (see the enhancement spec's own
  // "Dependency Flow"). Unit starts blank and is filled in the moment lookupItemUnits resolves
  // this Trim Card's configured (main) Unit, without blocking the Code/Name binding on that
  // second request.
  const handleTrimCodeSelect = useCallback((lineId: string, option: AutocompleteOption) => {
    const trimInventoryId = Number(option.id);
    updateLine(lineId, { trimCode: option.code || "", trimName: option.name || "", trimInventoryId, unit: "" });
    ensureUnitOptionsLoaded(trimInventoryId, (opts) => {
      const mainUnit = opts[0];
      if (mainUnit) updateLine(lineId, { unit: mainUnit.code || mainUnit.name || "" });
    });
  }, [ensureUnitOptionsLoaded]);

  // Fires on blur/Enter when nothing was picked from the suggestion list — AutocompleteTextCell
  // never rejects free-typed text (see its own comment), but a Code that no longer matches the
  // row's currently bound Trim Card is exactly the "stale dependent value" the spec calls out:
  // clearing Code clears Name/Unit/trimInventoryId, and typing something that doesn't match the
  // existing binding does too, rather than silently keeping a Name/Unit that belongs to a
  // different (or no longer selected) Trim Card.
  const commitTrimCode = useCallback((lineId: string, typedValue: string) => {
    setLines((prev) => prev.map((l) => {
      if (l.id !== lineId) return l;
      const trimmed = typedValue.trim();
      if (!trimmed) return { ...l, trimCode: "", trimName: "", unit: "", trimInventoryId: null };
      const boundOption = l.trimInventoryId != null ? trimCardOptions.find((o) => o.id === String(l.trimInventoryId)) : null;
      if (boundOption && boundOption.code === trimmed) return { ...l, trimCode: trimmed };
      return { ...l, trimCode: trimmed, trimName: "", unit: "", trimInventoryId: null };
    }));
  }, [trimCardOptions]);

  // Unit stays user-editable (matching this screen's existing workflow), just scoped to the
  // selected Trim Card's own valid units instead of a free-for-all — picking one is the normal
  // path; typing free text is still tolerated, same as Code, rather than inventing a new
  // rejection rule the rest of this screen doesn't otherwise enforce.
  const handleUnitSelect = (lineId: string, option: AutocompleteOption) => updateLine(lineId, { unit: option.code || option.name || "" });
  const commitUnit = (lineId: string, typedValue: string) => updateLine(lineId, { unit: typedValue.trim() });

  const removeLine = async (line: TrimLine) => {
    if (line.savedId && trimCardId) {
      try {
        await legacyErpApi.trimCards.removeItem(trimCardId, line.savedId);
        // Already persisted server-side — reflect that in the clean-state snapshot
        // too, so closing the tab right after doesn't falsely warn about unsaved changes.
        lastSavedRef.current = { ...lastSavedRef.current, lines: lastSavedRef.current.lines.filter((l) => l.id !== line.id) };
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    setLines((p) => p.filter((l) => l.id !== line.id));
  };

  const isDirty = JSON.stringify({ form, lines }) !== JSON.stringify(lastSavedRef.current);
  useWorkspaceDirty(isDirty, async () => { await save(); });
  // Same identifier the breadcrumb trail below already shows as the current record segment —
  // resolveWorkspaceTabTitle composes it into "Customer Define Trim [<this>]" on the Workspace tab.
  useWorkspaceRecordLabel(trimCardId ? form.code || undefined : undefined);

  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({
    storageKey: "trimCardGrid",
    columns: gridColumnDefs,
    fixedColumns: FIXED_COLS,
  });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const colWidths = gridColumns.colWidths;
  const startResize = gridColumns.startResize;
  const resetColumnWidth = gridColumns.resetWidth;
  const totalTableWidth = gridColumns.totalWidth(DEL_W);

  // Cell content per column key — identical field bindings/editors to the original hardcoded
  // markup, just looked up by key so Manage Columns can show/hide/reorder them.
  const renderLineCell = (line: TrimLine, key: ColKey) => {
    switch (key) {
      case "trimCode":
        return activeAutocomplete?.lineId === line.id && activeAutocomplete.field === "trimCode" ? (
          <AutocompleteTextCell
            autoFocus
            startOpen={false}
            value={line.trimCode}
            options={trimCardOptions}
            showDropdownIcon
            onChange={(v) => updateLine(line.id, { trimCode: v })}
            onCommit={(v) => { commitTrimCode(line.id, v); setActiveAutocomplete(null); }}
            onCancel={() => setActiveAutocomplete(null)}
            onSelectOption={(opt) => { handleTrimCodeSelect(line.id, opt); setActiveAutocomplete(null); }}
          />
        ) : (
          <EditableGridInput
            value={line.trimCode}
            onChange={() => {}}
            onFocus={() => setActiveAutocomplete({ lineId: line.id, field: "trimCode" })}
            readOnly
            placeholder="Search Trim Code..."
          />
        );
      case "trimName":
        return <EditableGridInput value={line.trimName} onChange={() => {}} disabled placeholder="Auto-filled from Trim Code" />;
      case "explanation":
        return <GridInput value={line.explanation} onChange={(v) => updateLine(line.id, { explanation: v })} />;
      case "orderQuantity":
        return <GridInput type="number" align="right" value={line.orderQuantity} decimalKey="quantity" onChange={(v) => updateLine(line.id, { orderQuantity: v })} />;
      case "unit":
        return activeAutocomplete?.lineId === line.id && activeAutocomplete.field === "unit" ? (
          <AutocompleteTextCell
            autoFocus
            startOpen={false}
            value={line.unit}
            options={line.trimInventoryId != null ? (unitOptionsByTrim[String(line.trimInventoryId)] ?? []) : []}
            showDropdownIcon
            onChange={(v) => updateLine(line.id, { unit: v })}
            onCommit={(v) => { commitUnit(line.id, v); setActiveAutocomplete(null); }}
            onCancel={() => setActiveAutocomplete(null)}
            onSelectOption={(opt) => { handleUnitSelect(line.id, opt); setActiveAutocomplete(null); }}
          />
        ) : (
          <EditableGridInput
            value={line.unit}
            onChange={() => {}}
            onFocus={() => setActiveAutocomplete({ lineId: line.id, field: "unit" })}
            readOnly
            placeholder="Unit"
          />
        );
      case "quantity":
        return <GridInput type="number" align="right" value={line.quantity} decimalKey="quantity" onChange={(v) => updateLine(line.id, { quantity: v })} />;
      case "wastePct":
        return <GridInput type="number" align="right" value={line.wastePct} onChange={(v) => updateLine(line.id, { wastePct: v })} />;
      case "forexId":
        return <GridInput value={line.forexId} onChange={(v) => updateLine(line.id, { forexId: v })} />;
      case "forexPrice":
        return <GridInput type="number" align="right" value={line.forexPrice} onChange={(v) => updateLine(line.id, { forexPrice: v })} />;
      case "unitPrice":
        return <GridInput type="number" align="right" value={line.unitPrice} decimalKey="unit-price" onChange={(v) => updateLine(line.id, { unitPrice: v })} />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: "Inventory" },
        { label: "Customer Define Trim", href: "/dashboard/legacy-erp/trim-cards-list" },
        ...(trimCardId ? [{ label: form.code }] : []),
      ]} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {trimCardId ? (form.code || "Customer Define Trim") : "New Customer Define Trim"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Customer Define Trim</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-56 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Find by code..."
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="text-sm"
            />
            <InputGroupAddon align="inline-end">
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={search} disabled={searching} title="Search">
                <Search className="h-3.5 w-3.5" />
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <Button variant="outline" size="sm" onClick={newRecord}><FilePlus2 className="h-3.5 w-3.5 mr-2" />New</Button>
          <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>

      <div className="space-y-4">
        <FormSection title="Identification">
          {/* Code is read-only everywhere: server-generated on Save (TC-001, ...) and never
              user-editable, matching yarn-cards/page.tsx's own Code field convention. */}
          <FormTextField label="Code" value={form.code || "Generating..."} onChange={() => {}} disabled />
          <FormTextField label="Explanation" value={form.explanation} onChange={(v) => set("explanation", v)} span="wide" />
          <FormSwitchField label="In Use" checked={form.inUse} onChange={(v) => set("inUse", v)} />
        </FormSection>

        <FormSection title="Classification">
          <LookupField
            label="Customer"
            displayValue={form.customerLabel || (form.customerId ? String(form.customerId) : "")}
            fetchOptions={(s) => legacyErpApi.accounts.list(s) as any}
            // accounts.list() (this screen's own search source) returns the short "code"/"name"
            // aliases — see account.service.ts's list() — not currentAccountCode/
            // currentAccountName (that shape only comes back from accounts.get()/getByCode()).
            getLabel={(item: any) => `${item.code} — ${item.name}`}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, customerId: item.id, customerLabel: `${item.code} — ${item.name}` }))}
          />
          <LookupField
            label="Style Group"
            displayValue={form.styleGroupLabel}
            fetchOptions={(s) => legacyErpApi.lookupParameters("style-group", s) as any}
            getLabel={(item: any) => item.value}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, styleGroupId: item.id, styleGroupLabel: item.value }))}
          />
          <LookupField
            label="Brand"
            displayValue={form.brandLabel}
            fetchOptions={(s) => legacyErpApi.lookupParameters("brand", s) as any}
            getLabel={(item: any) => item.value}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, brandId: item.id, brandLabel: item.value }))}
          />
          <LookupField
            label="Style Department"
            displayValue={form.styleDepartmentLabel}
            fetchOptions={(s) => legacyErpApi.lookupParameters("style-department", s) as any}
            getLabel={(item: any) => item.value}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, styleDepartmentId: item.id, styleDepartmentLabel: item.value }))}
          />
        </FormSection>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
        <ScrollableTabsList tabs={["General", "Customized Fields"]} activeTab={activeTab} />

        <TabsContent value="General" className="p-6">
          <div className="flex items-center justify-between mb-4">
            {!trimCardId ? (
              <Badge variant="secondary" className="h-5 text-[11px] font-normal">Staged until saved</Badge>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={gridColumns.manageColumns.openModal}>
                <ListOrdered className="h-3.5 w-3.5 mr-2" />Manage Columns
              </Button>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-2" />Add Row</Button>
            </div>
          </div>
          <div className="rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
                <colgroup>
                  {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
                  <col style={{ width: DEL_W }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                    {displayColumnDefs.map((col) => {
                      const fixed = FIXED_COLS.includes(col.key);
                      return (
                        <TableHead
                          key={col.key}
                          className={cn(
                            "relative h-10 p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80",
                            gridColumns.dragOverColumn === col.key && "bg-primary/15",
                          )}
                          onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                          onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                        >
                          <span
                            title={col.label}
                            draggable={!fixed}
                            onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                            onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                            className={cn(
                              "flex h-10 w-full min-w-0 items-center truncate px-2",
                              col.align === "right" ? "justify-end" : "justify-start",
                              !fixed && "cursor-grab active:cursor-grabbing",
                            )}
                          >
                            {col.label}
                          </span>
                          <div
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                            onMouseDown={startResize(col.key)}
                            onDoubleClick={() => resetColumnWidth(col.key)}
                            title="Drag to resize · double-click to reset width"
                            aria-hidden="true"
                          />
                        </TableHead>
                      );
                    })}
                    <TableHead className="h-10 w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={displayColumnDefs.length + 1} className="py-8">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon"><ListX /></EmptyMedia>
                            <EmptyTitle className="text-sm">No trim lines</EmptyTitle>
                            <EmptyDescription>Click &quot;Add Row&quot; to add the first trim line.</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : lines.map((line) => (
                    <TableRow key={line.id} className="group">
                      {displayColumnDefs.map((col) => (
                        <TableCell key={col.key}>{renderLineCell(line, col.key)}</TableCell>
                      ))}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => removeLine(line)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="Customized Fields" className="p-6">
          <div className="rounded-lg border border-dashed bg-muted/20">
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Settings2 /></EmptyMedia>
                <EmptyTitle>No custom fields</EmptyTitle>
                <EmptyDescription>No custom fields have been defined for this screen yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </TabsContent>
        </div>
      </Tabs>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Trim Code and Trim Name are required and always stay first."
      />
    </div>
  );
}
