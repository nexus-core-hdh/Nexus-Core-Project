"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Ribbon, Lock, ChevronRight } from "lucide-react";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { FormSection } from "@/components/forms/form-section";
import {
  FormTextField as FieldText,
  FormSwitchField as FieldCheck,
  FormSelectField as FieldSelect,
  FormFactorDivisorField as FieldFactorDivisor,
} from "@/components/forms/form-field";
import { LookupField } from "@/components/legacy-erp/lookup-field";
import { SatelliteGridTab } from "@/components/legacy-erp/satellite-grid-tab";
import { UnitTab } from "@/components/legacy-erp/unit-tab";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";

// Trim Card — the third IM_Item-based inventory card, alongside Fabric Card and Yarn Card.
// Deliberately built as a near-clone of Fabric Card's page shell (same Identity block, same
// General Information / Withholding / Using For / Follow-up Types / Variant Types /
// Integration sections, same Unit/Warehouse/Barcode/Attachments tabs via the same shared
// components) since Trim items have no material-specific attributes analogous to Fabric's
// Composition/GSM/Dye Type or Yarn's Denier/Count — General Information stays generic. Not to
// be confused with "Customer Define Trims" (app/.../trim-cards/page.tsx) — a completely
// different, untouched screen for a customer/style-scoped trim BOM, not an inventory item.
const INVENTORY_TYPE_OPTIONS = [
  { value: "1", label: "Product" },
  { value: "2", label: "Service" },
  { value: "3", label: "Fixed Asset" },
];

const TABS = [
  "General", "Unit", "Integration", "Warehouse Status",
  "Warehouse Parameters", "Barcode", "Variant Types", "Attachments",
];

const emptyForm: Record<string, any> = {
  inventoryCode: "", inventoryName: "", inUse: true, inventoryType: "1", accessCode: "TRIM", specialCode: "",
  groupId: "", processId: "",
  withholdingFactor: "", withholdingDivisor: "", sWithholdingFactor: "", sWithholdingDivisor: "",
  useForCommon: true, useForPurchase: true, useForSale: true,
  hasVariant: false, hasRowVariant: false, hasSeries: false, hasSeparableSeries: false,
  variant1TypeId: "", variant2TypeId: "", variant3TypeId: "", variant4TypeId: "", variant5TypeId: "",
  isoDocumentNo: "", webContent: "", seasonCode: "", genderCode: "", campaignGroup: "", priceGroup: "", planCapacityGroup: "",
};

// Same root-cause null-safety fix as Fabric Card (see fabric-cards/page.tsx) — a nullable DB
// column must never overwrite emptyForm's safe "" default when a record loads.
const sanitizeRecord = (raw: Record<string, any>): Record<string, any> => {
  const merged: Record<string, any> = { ...emptyForm, ...raw };
  for (const key of Object.keys(emptyForm)) {
    if (merged[key] === null || merged[key] === undefined) merged[key] = emptyForm[key];
  }
  return merged;
};

type LookupOption = { id: number | string; code?: string | null; name: string };
type LookupKey = "group" | "process" | "variant-type";
const LOOKUP_KEYS: LookupKey[] = ["group", "process", "variant-type"];

const optionLabel = (o: LookupOption) => (o.code ? `${o.code} - ${o.name}` : o.name);
const labelFor = (list: LookupOption[], id: any) => {
  if (id === "" || id === null || id === undefined) return "";
  const found = list.find((o) => String(o.id) === String(id));
  return found ? optionLabel(found) : "";
};

function IdentitySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Identity</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default function TrimInventoryCardPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");

  const [codeInput, setCodeInput] = useState("");
  const [itemId, setItemId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");

  const [lookups, setLookups] = useState<Record<LookupKey, LookupOption[]>>({
    group: [], process: [], "variant-type": [],
  });

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(LOOKUP_KEYS.map((k) => legacyErpApi.lookupTable(k).catch(() => [])));
      setLookups(Object.fromEntries(LOOKUP_KEYS.map((k, i) => [k, entries[i] as LookupOption[]])) as any);
    })();
  }, []);

  useEffect(() => {
    if (!initialId) return;
    (async () => {
      try {
        const r: any = await legacyErpApi.trimInventoryCards.get(Number(initialId));
        const f = sanitizeRecord(r);
        setForm(f);
        lastSavedRef.current = f;
        setItemId(r.id);
        setCodeInput(r.inventoryCode);
      } catch (e: any) {
        toast.error(e.message || "Could not load trim card");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.trimInventoryCards.getByCode(codeInput.trim());
      const f = sanitizeRecord(r);
      setForm(f);
      lastSavedRef.current = f;
      setItemId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error("No trim card found with that code");
      setItemId(null);
      const draft = { ...emptyForm, inventoryCode: codeInput.trim() };
      setForm(draft);
      lastSavedRef.current = draft;
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setItemId(null);
    setCodeInput("");
    setForm(emptyForm);
    lastSavedRef.current = emptyForm;
    setMode("create");
  };

  const save = async () => {
    if (!form.inventoryCode.trim() || !form.inventoryName.trim()) return toast.error("Code and Name are required");
    setSaving(true);
    try {
      if (itemId) {
        const r: any = await legacyErpApi.trimInventoryCards.update(itemId, form);
        const f = sanitizeRecord(r);
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.trimInventoryCards.create(form);
        const f = sanitizeRecord(r);
        setForm(f);
        lastSavedRef.current = f;
        setItemId(r.id);
        setCodeInput(r.inventoryCode);
        toast.success("Created");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = !readOnly && JSON.stringify(form) !== JSON.stringify(lastSavedRef.current);
  useWorkspaceDirty(isDirty, async () => { await save(); });

  const lookupField = (key: LookupKey, label: string, formKey: string, span: "normal" | "wide" = "normal") => (
    <LookupField
      label={label}
      span={span}
      displayValue={labelFor(lookups[key], form[formKey])}
      onSelect={(o: LookupOption) => set(formKey, String(o.id))}
      fetchOptions={(term: string) => legacyErpApi.lookupTable(key, term) as Promise<LookupOption[]>}
      getLabel={optionLabel}
      getValue={(o: LookupOption) => o.id}
    />
  );

  const saveRequired = (label: string) => (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>Save required</EmptyTitle>
        <EmptyDescription>Save the trim card first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Trim Cards</span>
        {itemId && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{form.inventoryCode}</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Ribbon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {itemId ? (form.inventoryName || "Trim Card") : "New Trim Card"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Trim Card</p>
              {readOnly && (
                <Badge variant="secondary" className="h-5 gap-1 text-[11px] font-normal">
                  <Lock className="h-2.5 w-2.5" />View Only
                </Badge>
              )}
            </div>
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
          {!readOnly && <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}</Button>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
          <ScrollableTabsList tabs={TABS} activeTab={activeTab} />

          <div className="p-6">
            <TabsContent value="General" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <IdentitySection>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <label className="flex h-9 cursor-pointer items-center gap-2">
                      <Switch checked={form.inUse} onCheckedChange={(v) => set("inUse", v)} />
                      <span className="text-sm font-medium text-foreground">In Use</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                        Operation Code
                      </span>
                      <div className="w-56">
                        <LookupField
                          label=""
                          displayValue={labelFor(lookups.process, form.processId)}
                          onSelect={(o: LookupOption) => set("processId", String(o.id))}
                          fetchOptions={(term: string) => legacyErpApi.lookupTable("process", term) as Promise<LookupOption[]>}
                          getLabel={optionLabel}
                          getValue={(o: LookupOption) => o.id}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FieldText label="Code" value={form.inventoryCode} onChange={(v) => set("inventoryCode", v)} />
                    <FieldText label="Name" value={form.inventoryName} onChange={(v) => set("inventoryName", v)} />
                  </div>
                </IdentitySection>

                <FormSection title="General Information">
                  <FieldSelect label="Inventory Type" value={form.inventoryType} onChange={(v) => set("inventoryType", v)} options={INVENTORY_TYPE_OPTIONS} />
                  <FieldText label="Access Code" value={form.accessCode} onChange={(v) => set("accessCode", v)} />
                  <FieldText label="Special Code" value={form.specialCode} onChange={(v) => set("specialCode", v)} />
                  {lookupField("group", "Group Code", "groupId")}
                </FormSection>

                <FormSection title="Withholding">
                  <FieldFactorDivisor
                    label="Purchase"
                    factor={form.withholdingFactor} divisor={form.withholdingDivisor}
                    onFactorChange={(v) => set("withholdingFactor", v)} onDivisorChange={(v) => set("withholdingDivisor", v)}
                  />
                  <FieldFactorDivisor
                    label="Sales - Distribution"
                    factor={form.sWithholdingFactor} divisor={form.sWithholdingDivisor}
                    onFactorChange={(v) => set("sWithholdingFactor", v)} onDivisorChange={(v) => set("sWithholdingDivisor", v)}
                  />
                </FormSection>

                <FormSection title="Using For">
                  <FieldCheck label="Inventory Management" checked={form.useForCommon} onChange={(v) => set("useForCommon", v)} />
                  <FieldCheck label="Purchase" checked={form.useForPurchase} onChange={(v) => set("useForPurchase", v)} />
                  <FieldCheck label="Sales - Distribution" checked={form.useForSale} onChange={(v) => set("useForSale", v)} />
                </FormSection>

                <FormSection title="Follow-up Types">
                  <FieldCheck label="Variants" checked={form.hasVariant} onChange={(v) => set("hasVariant", v)} />
                  <FieldCheck label="Variants (Line)" checked={form.hasRowVariant} onChange={(v) => set("hasRowVariant", v)} />
                  <FieldCheck label="Serials" checked={form.hasSeries} onChange={(v) => set("hasSeries", v)} />
                  <FieldCheck label="Separable Serials" checked={form.hasSeparableSeries} onChange={(v) => set("hasSeparableSeries", v)} />
                </FormSection>
              </fieldset>
            </TabsContent>

            <TabsContent value="Variant Types" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <FormSection title="Variant Types">
                  {lookupField("variant-type", "Variant Type 1", "variant1TypeId")}
                  {lookupField("variant-type", "Variant Type 2", "variant2TypeId")}
                  {lookupField("variant-type", "Variant Type 3", "variant3TypeId")}
                  {lookupField("variant-type", "Variant Type 4", "variant4TypeId")}
                  {lookupField("variant-type", "Variant Type 5", "variant5TypeId")}
                </FormSection>
              </fieldset>
            </TabsContent>

            <TabsContent value="Integration" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <FormSection title="Integration / Web">
                  <FieldText label="ISO Document No" value={form.isoDocumentNo} onChange={(v) => set("isoDocumentNo", v)} />
                  <FieldText label="Web Content" value={form.webContent} onChange={(v) => set("webContent", v)} />
                  <FieldText label="Season Code" value={form.seasonCode} onChange={(v) => set("seasonCode", v)} />
                  <FieldText label="Gender Code" value={form.genderCode} onChange={(v) => set("genderCode", v)} />
                  <FieldText label="Campaign Group" value={form.campaignGroup} onChange={(v) => set("campaignGroup", v)} />
                  <FieldText label="Price Group" value={form.priceGroup} onChange={(v) => set("priceGroup", v)} />
                  <FieldText label="Plan Capacity Group" value={form.planCapacityGroup} onChange={(v) => set("planCapacityGroup", v)} />
                </FormSection>
              </fieldset>
            </TabsContent>

            {!itemId ? (
              [
                "Unit", "Warehouse Status", "Warehouse Parameters", "Barcode", "Attachments",
              ].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="Unit">
                  <UnitTab itemId={itemId} readOnly={readOnly} api={legacyErpApi.trimInventoryCards} />
                </TabsContent>

                <TabsContent value="Warehouse Status">
                  <SatelliteGridTab itemId={itemId} readOnly tab="warehouse-parameters" api={legacyErpApi.trimInventoryCards} fields={[
                    { key: "warehouseId", label: "Warehouse", type: "number" },
                    { key: "minimumQuantity", label: "Min Qty", type: "number" },
                    { key: "optimumQuantity", label: "Optimum Qty", type: "number" },
                  ]} />
                </TabsContent>

                <TabsContent value="Warehouse Parameters">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="warehouse-parameters" addLabel="Add Warehouse Parameter" api={legacyErpApi.trimInventoryCards} fields={[
                    { key: "warehouseId", label: "Warehouse", type: "number" },
                    { key: "minimumQuantity", label: "Min Qty", type: "number" },
                    { key: "optimumQuantity", label: "Optimum Qty", type: "number" },
                    { key: "controlType", label: "Control Type", type: "number" },
                    { key: "mControlType", label: "M Control Type", type: "number" },
                    { key: "isAction", label: "Is Action", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Barcode">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="barcode" addLabel="Add Barcode" api={legacyErpApi.trimInventoryCards} fields={[
                    { key: "barcode", label: "Barcode" },
                    { key: "barcodeType", label: "Type", type: "number" },
                    { key: "pluCode", label: "PLU Code" },
                    { key: "unitSetItemId", label: "Unit", type: "number" },
                    { key: "quantity", label: "Quantity", type: "number" },
                    { key: "inUse", label: "In Use", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={itemId} readOnly={readOnly} api={legacyErpApi.trimInventoryCards} />
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
