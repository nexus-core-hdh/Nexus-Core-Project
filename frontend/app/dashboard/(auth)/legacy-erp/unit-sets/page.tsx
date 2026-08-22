"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save, FilePlus2, Search, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { legacyErpApi } from "@/lib/nexuscore-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MasterDetailLayout, MasterListPanel, DetailEditorPanel } from "@/components/shared/master-detail";
import {
  UnitItemDetailGrid, GridSection, FormRow, FieldCell, controlClass,
  type UnitOption, type UnitItem, type UnitItemForm,
  emptyItemForm, toItemForm,
} from "@/components/legacy-erp/unit-item-detail-grid";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";

// ---------------------------------------------------------------------------
// This screen deliberately does NOT use components/forms/* (FormSection,
// FormTextField, FieldLabel, ...) — those are the exact building blocks
// Current Account Card, Customer Define Trims, and Warehouses use. It uses
// a dense, bordered property-grid instead of that shared composition — see
// components/legacy-erp/unit-item-detail-grid.tsx (FieldCell/FormRow/
// GridSection, and the item detail grid itself), which this screen and
// Fabric Card's Unit tab both share.
// ---------------------------------------------------------------------------

interface UnitSetRow {
  id: number;
  setCode: string;
  setName: string;
}

interface UnitSetForm {
  setCode: string;
  setName: string;
  accessCode: string;
  specialCode: string;
  inUse: boolean;
  systemSet: boolean;
}

const emptySetForm: UnitSetForm = { setCode: "", setName: "", accessCode: "", specialCode: "", inUse: true, systemSet: false };

const normalize = (s: string) => s.trim().toLowerCase();
// Same convention as sizes/page.tsx's own disabledDisplayClass — the visual treatment for a
// server-assigned, never-user-editable value (Code, here).
const disabledDisplayClass = "flex h-full w-full items-center rounded-sm border border-input/40 bg-muted/30 px-2 text-xs text-muted-foreground";

/**
 * The Unit Set detail/editor screen. A Master-Detail ERP workspace, not a
 * form page — permanently split into a Units list (left) and Unit Details
 * (right), both always on screen. Deliberately does not use the shared
 * FormSection/FormTextField composition (see the FieldCell/FormRow helpers
 * above); the Master-Detail shell (components/shared/master-detail) is kept
 * since it's purpose-built for exactly this screen shape and shares nothing
 * visual with a single-record form.
 */
export default function UnitSetDetailPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");

  const [codeInput, setCodeInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [unitSetId, setUnitSetId] = useState<number | null>(null);
  const [form, setForm] = useState<UnitSetForm>(emptySetForm);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const [saving, setSaving] = useState(false);
  const readOnly = mode === "view";
  const lastSavedRef = useRef<UnitSetForm>(emptySetForm);

  const [allSets, setAllSets] = useState<UnitSetRow[]>([]);
  const [items, setItems] = useState<UnitItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [itemForm, setItemForm] = useState<UnitItemForm>(emptyItemForm);
  const [itemSaving, setItemSaving] = useState(false);
  const [allUnits, setAllUnits] = useState<UnitOption[]>([]);

  const [pendingSelect, setPendingSelect] = useState<UnitItem | { isNew: true } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UnitItem | null>(null);

  const itemLastSavedRef = useRef<UnitItemForm | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const loadItems = async (setId: number) => {
    setItemsLoading(true);
    try {
      const data = await legacyErpApi.unitSets.listItems(setId);
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setItemsLoading(false);
    }
  };

  const loadLookupData = async () => {
    try {
      const sets = await legacyErpApi.unitSets.list();
      const setList: UnitSetRow[] = Array.isArray(sets) ? sets : [];
      setAllSets(setList);
      const lists = await Promise.all(setList.map((s) => legacyErpApi.unitSets.listItems(s.id)));
      const flat = lists.flat().map((u: any) => ({ id: u.id, code: u.unitCode, name: u.unitName }));
      setAllUnits(flat);
    } catch {
      setAllSets([]);
      setAllUnits([]);
    }
  };

  const loadSet = async (id: number, targetMode: "view" | "edit") => {
    const r: any = await legacyErpApi.unitSets.get(id);
    const f = { ...emptySetForm, ...r };
    setForm(f);
    lastSavedRef.current = f;
    setUnitSetId(r.id);
    setCodeInput(r.setCode);
    setMode(targetMode);
    setSelectedId(null);
    setItemForm(emptyItemForm);
    itemLastSavedRef.current = null;
    await loadItems(r.id);
  };

  // Shows the code the next Save will get, before Save is ever pressed — a preview only (see
  // unit-set.controller.ts's next-code route). Mirrors yarn-cards/page.tsx's own
  // loadPreviewCode; Code is never user-editable here.
  const loadPreviewCode = async () => {
    try {
      const r: any = await legacyErpApi.unitSets.previewNextCode();
      setForm((p) => ({ ...p, setCode: r.code }));
      lastSavedRef.current = { ...lastSavedRef.current, setCode: r.code };
    } catch {
      // Non-critical — Save still generates the real code even if this preview fails to load.
    }
  };

  useEffect(() => {
    if (!initialId) return;
    loadSet(Number(initialId), initialMode === "view" ? "view" : "edit").catch((e: any) => {
      toast.error(e.message || "Could not load unit set");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialId) return;
    loadPreviewCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadLookupData(); }, []);

  const setField = (k: keyof UnitSetForm, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const setItemField = (k: keyof UnitItemForm, v: any) => setItemForm((p) => ({ ...p, [k]: v }));

  const isDirty = !readOnly && JSON.stringify(form) !== JSON.stringify(lastSavedRef.current);
  const isItemDirty = itemLastSavedRef.current !== null && JSON.stringify(itemForm) !== JSON.stringify(itemLastSavedRef.current);

  useWorkspaceDirty(isDirty || isItemDirty, async () => { await save(); });

  const searchByCode = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.unitSets.getByCode(codeInput.trim());
      await loadSet(r.id, "edit");
      toast.success("Loaded");
    } catch {
      toast.error("No unit set found with that code");
    } finally {
      setSearching(false);
    }
  };

  const validateSetForm = (): string | null => {
    const name = form.setName.trim();
    if (!name) return "Name is required";
    const dup = allSets.find((s) => s.id !== unitSetId && normalize(s.setName) === normalize(name));
    if (dup) return "A unit set with this Name already exists";
    return null;
  };

  const save = async () => {
    const error = validateSetForm();
    if (error) return toast.error(error);
    setSaving(true);
    try {
      if (unitSetId) {
        const r: any = await legacyErpApi.unitSets.update(unitSetId, form);
        const f = { ...emptySetForm, ...r };
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.unitSets.create(form);
        const f = { ...emptySetForm, ...r };
        setForm(f);
        lastSavedRef.current = f;
        setUnitSetId(r.id);
        setCodeInput(r.setCode);
        setMode("edit");
        toast.success("Created");
      }
      loadLookupData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const newRecord = () => {
    setCodeInput("");
    setUnitSetId(null);
    setForm(emptySetForm);
    lastSavedRef.current = emptySetForm;
    setMode("create");
    setItems([]);
    setSelectedId(null);
    setItemForm(emptyItemForm);
    itemLastSavedRef.current = null;
    loadPreviewCode();
  };

  const refresh = () => {
    if (unitSetId) {
      loadSet(unitSetId, mode === "view" ? "view" : "edit").then(() => toast.success("Refreshed"));
    } else {
      newRecord();
    }
    loadLookupData();
  };

  const selectItem = (item: UnitItem) => {
    setSelectedId(item.id);
    setItemForm(toItemForm(item));
    itemLastSavedRef.current = toItemForm(item);
  };

  const requestSelect = (item: UnitItem) => {
    if (isItemDirty) { setPendingSelect(item); return; }
    selectItem(item);
  };

  const handleAddUnit = () => {
    const proceed = () => {
      setSelectedId("new");
      setItemForm(emptyItemForm);
      itemLastSavedRef.current = emptyItemForm;
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    };
    if (isItemDirty) { setPendingSelect({ isNew: true }); return; }
    proceed();
  };

  const validateItemForm = (): string | null => {
    const code = itemForm.unitCode.trim();
    const name = itemForm.unitName.trim();
    if (!code || !name) return "Unit Code and Unit Name are required";
    const dup = items.find((i) => i.id !== selectedId && (normalize(i.unitCode) === normalize(code) || normalize(i.unitName) === normalize(name)));
    if (dup) return normalize(dup.unitCode) === normalize(code) ? "A unit with this Code already exists in this set" : "A unit with this Name already exists in this set";

    const numericFields: [string, string][] = [
      ["Conversion Quantity", itemForm.unitFactor], ["Conversion Equals", itemForm.unitDivisor],
      ["Width", itemForm.unitWidth], ["Length", itemForm.unitLength], ["Height", itemForm.unitHeight],
      ["Area", itemForm.unitArea], ["Volume", itemForm.unitVolume], ["Weight", itemForm.unitWeight],
    ];
    for (const [label, value] of numericFields) {
      if (value !== "" && Number.isNaN(Number(value))) return `${label} must be a number`;
    }
    if (itemForm.unitFactor !== "" && Number(itemForm.unitFactor) <= 0) return "Conversion Quantity must be greater than 0";
    if (itemForm.unitDivisor !== "" && Number(itemForm.unitDivisor) <= 0) return "Conversion Equals value must be greater than 0";
    return null;
  };

  const handleSaveUnit = async () => {
    if (!unitSetId || selectedId == null) return;
    const error = validateItemForm();
    if (error) return toast.error(error);
    setItemSaving(true);
    try {
      const num = (v: string) => (v === "" ? undefined : Number(v));
      const str = (v: string) => v.trim() || undefined;
      const payload = {
        unitCode: itemForm.unitCode.trim(),
        unitName: itemForm.unitName.trim(),
        universalCode: str(itemForm.universalCode),
        unitFactor: num(itemForm.unitFactor),
        unitDivisor: num(itemForm.unitDivisor),
        unitWidth: num(itemForm.unitWidth), unitWidthUnitId: num(itemForm.unitWidthUnitId),
        unitLength: num(itemForm.unitLength), unitLengthUnitId: num(itemForm.unitLengthUnitId),
        unitHeight: num(itemForm.unitHeight), unitHeightUnitId: num(itemForm.unitHeightUnitId),
        unitArea: num(itemForm.unitArea), unitAreaUnitId: num(itemForm.unitAreaUnitId),
        unitVolume: num(itemForm.unitVolume), unitVolumeUnitId: num(itemForm.unitVolumeUnitId),
        unitWeight: num(itemForm.unitWeight), unitWeightUnitId: num(itemForm.unitWeightUnitId),
        isDivisible: itemForm.isDivisible,
        useForRecipe: itemForm.useForRecipe,
      };
      const saved = selectedId === "new"
        ? await legacyErpApi.unitSets.createItem(unitSetId, payload)
        : await legacyErpApi.unitSets.updateItem(unitSetId, selectedId, payload);

      const data = await legacyErpApi.unitSets.listItems(unitSetId);
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      const persisted = list.find((i: UnitItem) => i.id === saved.id) ?? saved;
      setSelectedId(persisted.id);
      setItemForm(toItemForm(persisted));
      itemLastSavedRef.current = toItemForm(persisted);
      toast.success(selectedId === "new" ? "Unit created" : "Unit saved");
      loadLookupData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save unit");
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!unitSetId || !pendingDelete) return;
    try {
      await legacyErpApi.unitSets.removeItem(unitSetId, pendingDelete.id);
      toast.success("Unit deleted");
      await loadItems(unitSetId);
      setSelectedId(null);
      setItemForm(emptyItemForm);
      itemLastSavedRef.current = null;
      loadLookupData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete unit");
    } finally {
      setPendingDelete(null);
    }
  };

  // The Base Unit is whichever item the backend marked IsMainUnit on (always the
  // first one ever created for this set, or its promoted successor — see
  // unit-set.service.ts). Every other unit's conversion is expressed against this
  // item's own Code, never against the Unit Set header's Code/Name (that's master
  // data, not a real convertible unit). The `items[0]` fallback only matters for
  // rows that predate this fix and were never assigned a base unit server-side.
  const baseUnit = useMemo(
    () => items.find((i) => !!i.isMainUnit) ?? (items.length ? [...items].sort((a, b) => a.id - b.id)[0] : null),
    [items]
  );
  const isEditingBaseUnit = selectedId !== null && selectedId !== "new" && baseUnit?.id === selectedId;

  return (
    <div className="mx-auto flex h-[var(--content-full-height)] max-w-[1600px] flex-col gap-3 p-4">
      {/* Toolbar — no icon box, no breadcrumb, no badges: a plain compact bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
        <span className="text-sm font-bold uppercase tracking-wide text-foreground/80">
          {unitSetId ? `Unit Set — ${form.setCode}` : "Unit Set — New"}
          {readOnly && <span className="ml-2 font-normal normal-case text-muted-foreground">(View Only)</span>}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-7 w-48 shrink-0">
            <InputGroupAddon>
              <Search className="h-3 w-3 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Find by code..."
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchByCode()}
              className="text-xs"
            />
          </InputGroup>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={refresh} disabled={searching} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={newRecord}>
            <FilePlus2 className="h-3.5 w-3.5" />New
          </Button>
          {!readOnly && (
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5" />{saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* Unit Set Information — bordered property grid, Row 1: Code/Name/In Use, Row 2: Access Code/Special Code */}
      <div className="shrink-0">
        <fieldset disabled={readOnly} className="contents">
          <GridSection title="Unit Set Information">
            <div className="divide-y">
              <FormRow>
                {/* Code is read-only everywhere: server-generated on Save (US-001, ...) and
                    never user-editable, matching yarn-cards/page.tsx's own Code field. */}
                <FieldCell label="Code">
                  <div className={disabledDisplayClass} title="Generated automatically">{form.setCode || "Generating..."}</div>
                </FieldCell>
                <FieldCell label="Name">
                  <Input value={form.setName} onChange={(e) => setField("setName", e.target.value)} className={controlClass} />
                </FieldCell>
                <FieldCell label="In Use">
                  <div className="flex h-full items-center">
                    <Switch checked={form.inUse} onCheckedChange={(v) => setField("inUse", v)} />
                  </div>
                </FieldCell>
              </FormRow>
              <FormRow>
                <FieldCell label="Access Code">
                  <Input value={form.accessCode} onChange={(e) => setField("accessCode", e.target.value)} className={controlClass} />
                </FieldCell>
                <FieldCell label="Special Code">
                  <Input value={form.specialCode} onChange={(e) => setField("specialCode", e.target.value)} className={controlClass} />
                </FieldCell>
                <div />
              </FormRow>
            </div>
          </GridSection>
        </fieldset>
      </div>

      {/* Permanent Master-Detail split — Units list (left, always visible) / Unit Details (right) */}
      <div className="min-h-0 flex-1">
        <MasterDetailLayout
          persistenceKey="legacy-erp.unit-sets"
          defaultLeftSize={34}
          minLeftSize={28}
          maxLeftSize={48}
          left={
            <MasterListPanel<UnitItem>
              title={
                <span className="flex items-center gap-1.5">
                  Units
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">{items.length}</Badge>
                </span>
              }
              items={items}
              selectedId={selectedId === "new" ? "new" : selectedId}
              onSelect={requestSelect}
              getId={(item) => item.id}
              getLabel={(item) => item.unitName}
              getSubLabel={(item) => item.unitCode}
              getIcon={(item) => (baseUnit?.id === item.id ? Star : undefined)}
              loading={itemsLoading}
              emptyMessage="No units have been added yet."
              onAdd={!readOnly ? handleAddUnit : undefined}
              addDisabled={!unitSetId}
              onDelete={!readOnly ? (item) => setPendingDelete(item) : undefined}
              onRefresh={() => { if (unitSetId) loadItems(unitSetId); }}
              addLabel="Add Unit"
              deleteLabel="Delete Unit"
              searchPlaceholder="Search units..."
            />
          }
          right={
            <DetailEditorPanel
              isEmpty={selectedId == null}
              actions={
                selectedId != null && !readOnly ? (
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSaveUnit} disabled={itemSaving || !isItemDirty}>
                    <Save className="h-3.5 w-3.5" />
                    {itemSaving ? "Saving..." : "Save"}
                  </Button>
                ) : undefined
              }
            >
              <UnitItemDetailGrid
                itemForm={itemForm}
                setItemField={setItemField}
                readOnly={readOnly}
                isEditingBaseUnit={isEditingBaseUnit}
                baseUnitCode={baseUnit?.unitCode}
                allUnits={allUnits}
                firstFieldRef={firstFieldRef}
              />
            </DetailEditorPanel>
          }
        />
      </div>

      <AlertDialog open={!!pendingSelect} onOpenChange={(open) => !open && setPendingSelect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes to this unit. Switching will discard them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSelect(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSelect && "isNew" in pendingSelect) {
                  setSelectedId("new");
                  setItemForm(emptyItemForm);
                  itemLastSavedRef.current = emptyItemForm;
                  requestAnimationFrame(() => firstFieldRef.current?.focus());
                } else if (pendingSelect) {
                  selectItem(pendingSelect);
                }
                setPendingSelect(null);
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete &ldquo;{pendingDelete?.unitName}&rdquo;? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteUnit}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
