"use client";

import { useState, type ReactNode } from "react";
import { Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LookupDialog } from "@/components/legacy-erp/lookup-dialog";
import { cn } from "@/lib/utils";

// Extracted from the Unit Set screen (app/dashboard/(auth)/legacy-erp/unit-sets/page.tsx) so
// it can be reused verbatim wherever a Unit Set item's full detail needs to be shown — today
// that's the Unit Set screen itself and Fabric Card's Unit tab (which copies one item's values
// in and lets them be edited independently). Nothing here is Unit-Set- or Fabric-Card-specific;
// callers own the data and the persistence.

export const CONTROL_H = "h-7";
export const controlClass = "h-full w-full rounded-sm border border-input/70 bg-background px-2 text-xs shadow-none outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring/40";

export function FieldCell({ label, span = 1, children }: { label: string; span?: 1 | 2 | 3; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1 px-3 py-2", span === 2 && "col-span-2", span === 3 && "col-span-3")}>
      <span className="flex h-4 items-end text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className={CONTROL_H}>{children}</div>
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 divide-x">{children}</div>;
}

export function GridSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b bg-muted/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground/80">
        {title}
      </div>
      {children}
    </div>
  );
}

function UnitPickerTrigger({ value, onClick, disabled }: { value: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(controlClass, "flex items-center justify-between gap-1 text-left disabled:cursor-not-allowed disabled:opacity-50")}
    >
      <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Search..."}</span>
      <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

export interface UnitOption {
  id: number;
  code: string;
  name: string;
}

export interface UnitItem {
  id: number;
  unitSetId: number;
  unitCode: string;
  unitName: string;
  unitFactor?: number | null;
  unitDivisor?: number | null;
  unitWidth?: number | null;
  unitWidthUnitId?: number | null;
  unitLength?: number | null;
  unitLengthUnitId?: number | null;
  unitHeight?: number | null;
  unitHeightUnitId?: number | null;
  unitArea?: number | null;
  unitAreaUnitId?: number | null;
  unitVolume?: number | null;
  unitVolumeUnitId?: number | null;
  unitWeight?: number | null;
  unitWeightUnitId?: number | null;
  isMainUnit?: boolean | number | null;
  useForRecipe?: boolean | number | null;
  isDivisible?: boolean | number | null;
  universalCode?: string | null;
}

export interface UnitItemForm {
  unitCode: string;
  unitName: string;
  universalCode: string;
  unitFactor: string;
  unitDivisor: string;
  unitWidth: string; unitWidthUnitId: string;
  unitLength: string; unitLengthUnitId: string;
  unitHeight: string; unitHeightUnitId: string;
  unitArea: string; unitAreaUnitId: string;
  unitVolume: string; unitVolumeUnitId: string;
  unitWeight: string; unitWeightUnitId: string;
  isDivisible: boolean;
  useForRecipe: boolean;
}

export const emptyItemForm: UnitItemForm = {
  unitCode: "", unitName: "", universalCode: "", unitFactor: "", unitDivisor: "",
  unitWidth: "", unitWidthUnitId: "", unitLength: "", unitLengthUnitId: "", unitHeight: "", unitHeightUnitId: "",
  unitArea: "", unitAreaUnitId: "", unitVolume: "", unitVolumeUnitId: "", unitWeight: "", unitWeightUnitId: "",
  isDivisible: false, useForRecipe: false,
};

export const toItemForm = (item: any): UnitItemForm => ({
  unitCode: item.unitCode ?? "",
  unitName: item.unitName ?? "",
  universalCode: item.universalCode ?? "",
  unitFactor: item.unitFactor != null ? String(item.unitFactor) : "",
  unitDivisor: item.unitDivisor != null ? String(item.unitDivisor) : "",
  unitWidth: item.unitWidth != null ? String(item.unitWidth) : "", unitWidthUnitId: item.unitWidthUnitId != null ? String(item.unitWidthUnitId) : "",
  unitLength: item.unitLength != null ? String(item.unitLength) : "", unitLengthUnitId: item.unitLengthUnitId != null ? String(item.unitLengthUnitId) : "",
  unitHeight: item.unitHeight != null ? String(item.unitHeight) : "", unitHeightUnitId: item.unitHeightUnitId != null ? String(item.unitHeightUnitId) : "",
  unitArea: item.unitArea != null ? String(item.unitArea) : "", unitAreaUnitId: item.unitAreaUnitId != null ? String(item.unitAreaUnitId) : "",
  unitVolume: item.unitVolume != null ? String(item.unitVolume) : "", unitVolumeUnitId: item.unitVolumeUnitId != null ? String(item.unitVolumeUnitId) : "",
  unitWeight: item.unitWeight != null ? String(item.unitWeight) : "", unitWeightUnitId: item.unitWeightUnitId != null ? String(item.unitWeightUnitId) : "",
  isDivisible: !!item.isDivisible,
  useForRecipe: !!item.useForRecipe,
});

interface UnitItemDetailGridProps {
  itemForm: UnitItemForm;
  setItemField: (k: keyof UnitItemForm, v: any) => void;
  readOnly?: boolean;
  isEditingBaseUnit?: boolean;
  baseUnitCode?: string;
  allUnits: UnitOption[];
  firstFieldRef?: React.RefObject<HTMLInputElement | null>;
  /** Identity (Code/Name) and Universal Code describe the picked Unit master itself — for a
   *  caller that copies an item's values elsewhere rather than editing the Unit Set's own
   *  item record, there's no column to persist edits to these three into, so they're shown
   *  (the copy is still visible) but locked instead of editable. */
  lockedIdentity?: boolean;
  /** Extra row rendered inside the Identity section, after Code/Name — e.g. a caller's own
   *  per-copy flag that doesn't exist on the Unit Set item itself (Fabric Card's In Use). */
  identityExtra?: ReactNode;
}

/**
 * The Unit Set item detail grid — Identity / Conversion / Options / Dimensions — exactly as
 * built for the Unit Set screen's right-hand editor panel. Reused as-is (not recreated) by
 * Fabric Card's Unit tab to show a copied item's values in the identical layout.
 */
export function UnitItemDetailGrid({
  itemForm, setItemField, readOnly, isEditingBaseUnit, baseUnitCode, allUnits, firstFieldRef, lockedIdentity, identityExtra,
}: UnitItemDetailGridProps) {
  const [activeUnitField, setActiveUnitField] = useState<keyof UnitItemForm | null>(null);
  const normalize = (s: string) => s.trim().toLowerCase();

  const unitDisplayValue = (id: string) => {
    const found = allUnits.find((u) => String(u.id) === id);
    return found ? `${found.code} - ${found.name}` : "";
  };
  const fetchUnitOptions = async (search: string): Promise<UnitOption[]> => {
    const q = normalize(search);
    const pool = q ? allUnits.filter((u) => normalize(u.code).includes(q) || normalize(u.name).includes(q)) : allUnits;
    return pool.slice(0, 50);
  };

  return (
    <>
      <fieldset disabled={readOnly} className="contents">
        <div className="space-y-3">
          <GridSection title="Identity">
            <FormRow>
              <FieldCell label="Code">
                <Input ref={firstFieldRef} disabled={lockedIdentity} value={itemForm.unitCode} onChange={(e) => setItemField("unitCode", e.target.value)} className={controlClass} />
              </FieldCell>
              <FieldCell label="Name" span={2}>
                <Input disabled={lockedIdentity} value={itemForm.unitName} onChange={(e) => setItemField("unitName", e.target.value)} className={controlClass} />
              </FieldCell>
            </FormRow>
            {identityExtra}
          </GridSection>

          <GridSection title="Conversion">
            {isEditingBaseUnit && (
              <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                <span>
                  <strong className="font-semibold text-foreground">{itemForm.unitCode}</strong> is this set&apos;s Base Unit —
                  every other unit converts to it. It has no conversion of its own.
                </span>
              </div>
            )}
            <FormRow>
              {isEditingBaseUnit ? (
                <FieldCell label="Base Unit" span={2}>
                  <div className="flex h-full items-center text-muted-foreground">No conversion — this unit is the reference.</div>
                </FieldCell>
              ) : (
                <>
                  <FieldCell label={`Quantity (${itemForm.unitCode || "Unit"})`}>
                    <Input type="number" value={itemForm.unitFactor} onChange={(e) => setItemField("unitFactor", e.target.value)} className={controlClass} />
                  </FieldCell>
                  <FieldCell label={`Equals (${baseUnitCode || "Base Unit"})`}>
                    <Input type="number" value={itemForm.unitDivisor} onChange={(e) => setItemField("unitDivisor", e.target.value)} className={controlClass} />
                  </FieldCell>
                </>
              )}
              <FieldCell label="Universal Code">
                <Input disabled={lockedIdentity} value={itemForm.universalCode} onChange={(e) => setItemField("universalCode", e.target.value)} className={controlClass} />
              </FieldCell>
            </FormRow>
          </GridSection>

          <GridSection title="Options">
            <FormRow>
              <FieldCell label="Separable">
                <div className="flex h-full items-center">
                  <Switch checked={itemForm.isDivisible} onCheckedChange={(v) => setItemField("isDivisible", v)} />
                </div>
              </FieldCell>
              <FieldCell label="Requirement Calculation" span={2}>
                <div className="flex h-full items-center">
                  <Switch checked={itemForm.useForRecipe} onCheckedChange={(v) => setItemField("useForRecipe", v)} />
                </div>
              </FieldCell>
            </FormRow>
          </GridSection>

          <GridSection title="Dimensions">
            <div className="divide-y">
              {([
                ["Width", "unitWidth", "unitWidthUnitId"],
                ["Length", "unitLength", "unitLengthUnitId"],
                ["Height", "unitHeight", "unitHeightUnitId"],
                ["Area", "unitArea", "unitAreaUnitId"],
                ["Volume", "unitVolume", "unitVolumeUnitId"],
                ["Weight", "unitWeight", "unitWeightUnitId"],
              ] as const).map(([label, valueKey, unitKey]) => (
                <FormRow key={valueKey}>
                  <FieldCell label={label}>
                    <Input type="number" value={itemForm[valueKey]} onChange={(e) => setItemField(valueKey, e.target.value)} className={controlClass} />
                  </FieldCell>
                  <FieldCell label={`${label} Unit`} span={2}>
                    <UnitPickerTrigger
                      value={unitDisplayValue(itemForm[unitKey])}
                      onClick={() => setActiveUnitField(unitKey)}
                    />
                  </FieldCell>
                </FormRow>
              ))}
            </div>
          </GridSection>
        </div>
      </fieldset>

      <LookupDialog
        open={activeUnitField !== null}
        onOpenChange={(open) => !open && setActiveUnitField(null)}
        title="Select Unit"
        fetchOptions={fetchUnitOptions}
        getLabel={(u: UnitOption) => `${u.code} - ${u.name}`}
        getValue={(u: UnitOption) => u.id}
        onSelect={(u: UnitOption) => {
          if (activeUnitField) setItemField(activeUnitField, String(u.id));
        }}
      />
    </>
  );
}
