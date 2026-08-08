"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MasterDetailLayout, MasterListPanel, DetailEditorPanel } from "@/components/shared/master-detail";
import {
  UnitItemDetailGrid, FieldCell, FormRow, GridSection,
  type UnitOption, type UnitItem, type UnitItemForm,
  toItemForm,
} from "@/components/legacy-erp/unit-item-detail-grid";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Save, Ruler } from "lucide-react";

const TAB = "unit";

type FabricUnitForm = UnitItemForm & {
  inUse: boolean;
  useForCommon: boolean;
  useForPurchase: boolean;
  useForSale: boolean;
};

interface RowMeta {
  id: number;
  unitItemId: number;
  unitCode: string;
  unitName: string;
}

interface UnitSetHeader {
  id: number;
  setCode: string;
  setName: string;
}

/** The subset of a card's legacyErpApi client this component needs — legacyErpApi.fabricCards,
 *  .trimInventoryCards, etc. all already satisfy this shape as-is. Unit Sets themselves
 *  (legacyErpApi.unitSets) are genuinely shared read-only master data, not per-card, so those
 *  calls stay hardcoded below rather than being threaded through this prop too. */
export interface UnitTabApi {
  listTab: (id: number, tab: string) => Promise<any>;
  createTabRow: (id: number, tab: string, d: any) => Promise<any>;
  updateTabRow: (id: number, tab: string, lineId: number, d: any) => Promise<any>;
  removeTabRow: (id: number, tab: string, lineId: number) => Promise<any>;
}

interface Props {
  itemId: number;
  readOnly?: boolean;
  /** Which card's API this instance reads/writes through — Fabric Card, Trim Card, ... */
  api: UnitTabApi;
}

// A card's Unit tab embeds the Unit Set screen's own layout directly — no modal, no popup,
// no separate editor. A dropdown at top picks which Unit Set to copy from; the Units list
// (left) and detail editor (right) below it are the exact same MasterDetailLayout/
// MasterListPanel/DetailEditorPanel shell and UnitItemDetailGrid the Unit Set screen itself
// uses. Selecting a Unit Set immediately copies every one of its units into the card's own
// IM_ItemUnitItemSize rows (independent data — MD_UnitSetItem is never written to from here);
// editing a unit afterward and clicking "Update Units" only ever touches that copy. Shared by
// every IM_Item-based card (Fabric, Trim; Yarn Card keeps its own separate, pre-existing Unit
// tab UI, untouched) via the `api` prop instead of a hardcoded legacyErpApi.<card> reference.
export function UnitTab({ itemId, readOnly = false, api }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [headers, setHeaders] = useState<UnitSetHeader[]>([]);
  const [allItemsFull, setAllItemsFull] = useState<UnitItem[]>([]);
  const allUnits: UnitOption[] = allItemsFull.map((i) => ({ id: i.id, code: i.unitCode, name: i.unitName }));

  const [unitSetId, setUnitSetId] = useState<string>("");
  const [rawRows, setRawRows] = useState<any[]>([]);
  const rows: RowMeta[] = rawRows.map((r) => {
    const src = allItemsFull.find((i) => String(i.id) === String(r.unitItemId));
    return { id: r.id, unitItemId: r.unitItemId, unitCode: src?.unitCode ?? "", unitName: src?.unitName ?? "" };
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rowForm, setRowForm] = useState<FabricUnitForm | null>(null);
  const rowLastSavedRef = useRef<FabricUnitForm | null>(null);

  const [pendingSelectRow, setPendingSelectRow] = useState<RowMeta | null>(null);
  const [pendingUnitSetId, setPendingUnitSetId] = useState<string | null>(null);

  const selectRow = (row: RowMeta) => {
    const raw = rawRows.find((r) => r.id === row.id);
    if (!raw) return;
    selectRowFromRaw(raw);
  };

  const isRowDirty = !!rowForm && !!rowLastSavedRef.current && JSON.stringify(rowForm) !== JSON.stringify(rowLastSavedRef.current);

  const requestSelectRow = (row: RowMeta) => {
    if (row.id === selectedId) return;
    if (isRowDirty) { setPendingSelectRow(row); return; }
    selectRow(row);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rowsRes, setsRes] = await Promise.all([
          api.listTab(itemId, TAB),
          legacyErpApi.unitSets.list(),
        ]);
        const activeSets: UnitSetHeader[] = (Array.isArray(setsRes) ? setsRes : []).filter((h: any) => !!h.inUse);
        setHeaders(activeSets);
        const itemLists = await Promise.all(activeSets.map((h) => legacyErpApi.unitSets.listItems(h.id).catch(() => [])));
        const flat: UnitItem[] = (itemLists as any[]).flat();
        setAllItemsFull(flat);

        const existingRows = Array.isArray(rowsRes) ? rowsRes : [];
        setRawRows(existingRows);
        if (existingRows.length) {
          const originSet = flat.find((i) => String(i.id) === String(existingRows[0].unitItemId))?.unitSetId;
          if (originSet != null) setUnitSetId(String(originSet));
          const f = toFabricFormWith(existingRows[0], flat);
          setSelectedId(existingRows[0].id);
          setRowForm(f);
          rowLastSavedRef.current = f;
        }
      } catch {
        setHeaders([]);
        setAllItemsFull([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Same mapping as toFabricForm, but usable before allItemsFull state has committed (initial load).
  function toFabricFormWith(r: any, items: UnitItem[]): FabricUnitForm {
    const src = items.find((i) => String(i.id) === String(r.unitItemId));
    return {
      ...toItemForm({
        unitCode: src?.unitCode ?? "", unitName: src?.unitName ?? "", universalCode: "",
        unitFactor: r.unitFactor, unitDivisor: r.unitDivisor,
        unitWidth: r.unitWidth, unitWidthUnitId: r.unitWidthUnitId,
        unitLength: r.unitLength, unitLengthUnitId: r.unitLengthUnitId,
        unitHeight: r.unitHeight, unitHeightUnitId: r.unitHeightUnitId,
        unitArea: r.unitArea, unitAreaUnitId: r.unitAreaUnitId,
        unitVolume: r.unitVolume, unitVolumeUnitId: r.unitVolumeUnitId,
        unitWeight: r.unitWeight, unitWeightUnitId: r.unitWeightUnitId,
        isDivisible: r.isDivisible, useForRecipe: r.useForRecipe,
      }),
      inUse: !!r.inUse,
      useForCommon: !!r.useForCommon,
      useForPurchase: !!r.useForPurchase,
      useForSale: !!r.useForSale,
    };
  }

  const setRowField = (k: string, v: any) => setRowForm((p) => (p ? { ...p, [k]: v } : p));

  const buildCopyDto = (item: UnitItem) => {
    const n = (v: any) => (v === null || v === undefined ? undefined : Number(v));
    return {
      unitItemId: item.id,
      unitFactor: n(item.unitFactor), unitDivisor: n(item.unitDivisor),
      unitWidth: n(item.unitWidth), unitWidthUnitId: n(item.unitWidthUnitId),
      unitLength: n(item.unitLength), unitLengthUnitId: n(item.unitLengthUnitId),
      unitHeight: n(item.unitHeight), unitHeightUnitId: n(item.unitHeightUnitId),
      unitArea: n(item.unitArea), unitAreaUnitId: n(item.unitAreaUnitId),
      unitVolume: n(item.unitVolume), unitVolumeUnitId: n(item.unitVolumeUnitId),
      unitWeight: n(item.unitWeight), unitWeightUnitId: n(item.unitWeightUnitId),
      isDivisible: !!item.isDivisible, useForRecipe: !!item.useForRecipe,
      isMainUnit: !!item.isMainUnit,
      useForCommon: true, useForPurchase: true, useForSale: true,
      inUse: true,
    };
  };

  const applyUnitSetChange = async (newUnitSetId: string) => {
    setBusy(true);
    try {
      await Promise.all(rawRows.map((r) => api.removeTabRow(itemId, TAB, r.id)));
      const items: any = await legacyErpApi.unitSets.listItems(Number(newUnitSetId));
      const list: UnitItem[] = Array.isArray(items) ? items : [];
      const created = await Promise.all(list.map((it) => api.createTabRow(itemId, TAB, buildCopyDto(it))));
      setUnitSetId(newUnitSetId);
      setRawRows(created);
      if (created.length) {
        selectRowFromRaw(created[0]);
      } else {
        setSelectedId(null);
        setRowForm(null);
        rowLastSavedRef.current = null;
      }
      toast.success("Unit configuration replaced");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const selectRowFromRaw = (raw: any) => {
    const f = toFabricFormWith(raw, allItemsFull);
    setSelectedId(raw.id);
    setRowForm(f);
    rowLastSavedRef.current = f;
  };

  const handleUnitSetChange = (value: string) => {
    if (value === unitSetId) return;
    if (isRowDirty) { setPendingUnitSetId(value); return; }
    applyUnitSetChange(value);
  };

  const confirmUnitSetChange = () => {
    const id = pendingUnitSetId;
    setPendingUnitSetId(null);
    if (id) applyUnitSetChange(id);
  };

  const confirmSelectRow = () => {
    if (pendingSelectRow) selectRow(pendingSelectRow);
    setPendingSelectRow(null);
  };

  const validate = (f: FabricUnitForm): string | null => {
    const numericFields: [string, string][] = [
      ["Conversion Quantity", f.unitFactor], ["Conversion Equals", f.unitDivisor],
      ["Width", f.unitWidth], ["Length", f.unitLength], ["Height", f.unitHeight],
      ["Area", f.unitArea], ["Volume", f.unitVolume], ["Weight", f.unitWeight],
    ];
    for (const [label, value] of numericFields) {
      if (value !== "" && Number.isNaN(Number(value))) return `${label} must be a number`;
    }
    if (f.unitFactor !== "" && Number(f.unitFactor) <= 0) return "Conversion Quantity must be greater than 0";
    if (f.unitDivisor !== "" && Number(f.unitDivisor) <= 0) return "Conversion Equals value must be greater than 0";
    return null;
  };

  const buildEditDto = (f: FabricUnitForm) => {
    const num = (v: string) => (v === "" ? undefined : Number(v));
    return {
      unitFactor: num(f.unitFactor), unitDivisor: num(f.unitDivisor),
      unitWidth: num(f.unitWidth), unitWidthUnitId: num(f.unitWidthUnitId),
      unitLength: num(f.unitLength), unitLengthUnitId: num(f.unitLengthUnitId),
      unitHeight: num(f.unitHeight), unitHeightUnitId: num(f.unitHeightUnitId),
      unitArea: num(f.unitArea), unitAreaUnitId: num(f.unitAreaUnitId),
      unitVolume: num(f.unitVolume), unitVolumeUnitId: num(f.unitVolumeUnitId),
      unitWeight: num(f.unitWeight), unitWeightUnitId: num(f.unitWeightUnitId),
      isDivisible: f.isDivisible, useForRecipe: f.useForRecipe,
      inUse: f.inUse, useForCommon: f.useForCommon, useForPurchase: f.useForPurchase, useForSale: f.useForSale,
    };
  };

  const save = async () => {
    if (!rowForm || selectedId == null) return;
    const error = validate(rowForm);
    if (error) return toast.error(error);
    setSaving(true);
    try {
      const dto = buildEditDto(rowForm);
      const saved = await api.updateTabRow(itemId, TAB, selectedId, dto);
      setRawRows((prev) => prev.map((r) => (r.id === selectedId ? saved : r)));
      rowLastSavedRef.current = rowForm;
      toast.success("Unit updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: RowMeta) => {
    try {
      await api.removeTabRow(itemId, TAB, row.id);
      const remaining = rawRows.filter((r) => r.id !== row.id);
      setRawRows(remaining);
      if (selectedId === row.id) {
        if (remaining.length) selectRowFromRaw(remaining[0]);
        else { setSelectedId(null); setRowForm(null); rowLastSavedRef.current = null; }
      }
      if (!remaining.length) setUnitSetId("");
      toast.success("Unit removed");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="flex h-[70vh] min-h-[520px] flex-col gap-3">
      <GridSection title="Unit Set">
        <div className="p-3">
          <Select value={unitSetId} onValueChange={handleUnitSetChange} disabled={readOnly || busy}>
            <SelectTrigger className="h-8 w-72 text-xs">
              <SelectValue placeholder="Select a Unit Set..." />
            </SelectTrigger>
            <SelectContent>
              {headers.map((h) => (
                <SelectItem key={h.id} value={String(h.id)}>{h.setCode} - {h.setName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GridSection>

      <div className="min-h-0 flex-1">
        <MasterDetailLayout
          persistenceKey="legacy-erp.card-unit"
          defaultLeftSize={30}
          minLeftSize={25}
          maxLeftSize={40}
          left={
            <MasterListPanel<RowMeta>
              title="Units"
              items={rows}
              selectedId={selectedId}
              onSelect={requestSelectRow}
              getId={(r) => r.id}
              getLabel={(r) => r.unitName}
              getSubLabel={(r) => r.unitCode}
              loading={busy}
              emptyMessage={unitSetId ? "No units in this set." : "Select a Unit Set above."}
              onDelete={!readOnly ? deleteRow : undefined}
              deleteLabel="Delete Unit"
              searchPlaceholder="Search units..."
            />
          }
          right={
            <DetailEditorPanel
              isEmpty={selectedId == null || !rowForm}
              actions={
                selectedId != null && !readOnly ? (
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={saving || !isRowDirty}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving..." : "Update Units"}
                  </Button>
                ) : undefined
              }
              emptyState={
                <>
                  <Ruler className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Select a Unit Set, then a unit, to view its details</p>
                </>
              }
            >
              {rowForm && (
                <>
                  <UnitItemDetailGrid
                    itemForm={rowForm}
                    setItemField={setRowField}
                    readOnly={readOnly}
                    allUnits={allUnits}
                    lockedIdentity
                    identityExtra={
                      <FormRow>
                        <FieldCell label="In Use">
                          <div className="flex h-full items-center">
                            <Switch checked={rowForm.inUse} onCheckedChange={(v) => setRowField("inUse", v)} />
                          </div>
                        </FieldCell>
                        <div />
                        <div />
                      </FormRow>
                    }
                  />
                  <div className="mt-3">
                    <GridSection title="Using For">
                      <FormRow>
                        <FieldCell label="Common">
                          <div className="flex h-full items-center">
                            <Switch checked={rowForm.useForCommon} onCheckedChange={(v) => setRowField("useForCommon", v)} />
                          </div>
                        </FieldCell>
                        <FieldCell label="Purchase">
                          <div className="flex h-full items-center">
                            <Switch checked={rowForm.useForPurchase} onCheckedChange={(v) => setRowField("useForPurchase", v)} />
                          </div>
                        </FieldCell>
                        <FieldCell label="Sale">
                          <div className="flex h-full items-center">
                            <Switch checked={rowForm.useForSale} onCheckedChange={(v) => setRowField("useForSale", v)} />
                          </div>
                        </FieldCell>
                      </FormRow>
                    </GridSection>
                  </div>
                </>
              )}
            </DetailEditorPanel>
          }
        />
      </div>

      <AlertDialog open={!!pendingUnitSetId} onOpenChange={(open) => !open && setPendingUnitSetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current Unit configuration?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved edits. Selecting a different Unit Set will discard them and replace the whole list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingUnitSetId(null)}>No</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnitSetChange}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingSelectRow} onOpenChange={(open) => !open && setPendingSelectRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes to this unit. Switching will discard them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSelectRow(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSelectRow}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
