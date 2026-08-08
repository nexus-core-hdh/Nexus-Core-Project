"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Layers, Lock, ChevronRight } from "lucide-react";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { cn } from "@/lib/utils";
import { FormGrid } from "@/components/forms/form-grid";
import {
  FormTextField as FieldText,
  FormSwitchField as FieldCheck,
  FormSelectField as FieldSelect,
  FormNumberStepperField as FieldStepper,
  FieldLabel,
  spanClass,
} from "@/components/forms/form-field";
import { LookupField } from "@/components/legacy-erp/lookup-field";
import { SatelliteGridTab } from "./_components/satellite-grid-tab";
import { AttachmentsTab } from "./_components/attachments-tab";
import { CustomizedFieldsTab } from "./_components/customized-fields-tab";

// Product Card's own section wrapper — deliberately NOT the shared FormSection
// (@/components/forms/form-section.tsx), which is a fixed 3-column grid used site-wide
// (Current Account, Trim Cards, Warehouses) and documented as "no screen picks its own
// column count." Product Card is an explicit, requested exception: every field row here
// is exactly 2 equal columns. Same visual chrome (border/padding/title treatment) as
// FormSection, copied rather than parameterizing the shared component, so the site-wide
// 3-column standard stays untouched for every other screen.
function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

// IM_Item.InventoryType is a bare smallint with no CHECK constraint or seed data in the
// migrated schema (verified). Minimal convention, same footing already used for
// FI_Account.CurrentAccountType elsewhere in this module.
const INVENTORY_TYPE_OPTIONS = [
  { value: "1", label: "Product" },
  { value: "2", label: "Service" },
  { value: "3", label: "Fixed Asset" },
];
// Prices, Picture Gallery and Attributes are removed per requirement — not rendered
// anywhere, including this list (which also drives the "Save required" placeholder tabs).
const TABS = [
  "General", "Detail", "Warehouse Status", "Barcode", "Unit", "Variant Types",
  "Explanation", "Attachments", "Integration", "Warehouse Parameters", "Customized Fields",
];

const emptyForm: Record<string, any> = {
  inventoryCode: "", inventoryName: "", inUse: true, inventoryType: "1", specialCode: "",
  groupId: "", shelfLife: "", shelfLifeUnit: "1", markId: "", unitId: "",
  withholdingFactor: "", withholdingDivisor: "", sWithholdingFactor: "", sWithholdingDivisor: "",
  useForCommon: true, useForPurchase: true, useForSale: true,
  hasVariant: false, hasRowVariant: false, hasSeries: false, hasSeparableSeries: false,
  currentAccountId: "", producerInventoryCode: "",
  denier: "", denierType: "", fComposition: "", density: "", isWarp: false, isFinally: false, washCare: "",
  uD_YComposition: "", uD_YCount: "", recipeQuantity: "", recipeUnitItemId: "",
  variant1TypeId: "", variant2TypeId: "", variant3TypeId: "", variant4TypeId: "", variant5TypeId: "",
  isoDocumentNo: "", webContent: "", seasonCode: "", genderCode: "", campaignGroup: "", priceGroup: "", planCapacityGroup: "",
};

type LookupOption = { id: number | string; code?: string | null; name: string };
// Access Code, Category, Yarn Count and Model are removed from the UI, so their lookup
// keys (category/yarn/model/tax — tax was only used by the removed VAT section) are no
// longer fetched at all.
type LookupKey = "group" | "mark" | "variant-type";
const LOOKUP_KEYS: LookupKey[] = ["group", "mark", "variant-type"];

const optionLabel = (o: LookupOption) => (o.code ? `${o.code} - ${o.name}` : o.name);
const labelFor = (list: LookupOption[], id: any) => {
  if (id === "" || id === null || id === undefined) return "";
  const found = list.find((o) => String(o.id) === String(id));
  return found ? optionLabel(found) : "";
};

// One compact field for the legacy "Factor / Divisor" pair shown as two boxes separated by
// a slash under a single label (Withholding > Purchase, Sales - Distribution).
function FactorDivisorField({
  label, factor, divisor, onFactorChange, onDivisorChange,
}: {
  label: string; factor: any; divisor: any; onFactorChange: (v: string) => void; onDivisorChange: (v: string) => void;
}) {
  return (
    <div className={spanClass("normal")}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={factor ?? ""}
          onChange={(e) => onFactorChange(e.target.value)}
          className="h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <span className="text-muted-foreground">/</span>
        <input
          type="number"
          value={divisor ?? ""}
          onChange={(e) => onDivisorChange(e.target.value)}
          className="h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}

export default function YarnCardPage() {
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
    group: [], mark: [], "variant-type": [],
  });
  const [nameError, setNameError] = useState("");
  const [shelfNumberError, setShelfNumberError] = useState("");
  const [leadLabel, setLeadLabel] = useState("");
  // Unit Sets — bound to the same MD_UnitSet header records the Unit Sets screen manages
  // (via legacyErpApi.unitSets.list(), no new endpoint). The dropdown shows ONLY the
  // saved Unit Set's Name (e.g. "Length Units"), never "CODE - Name" like every other
  // lookup on this screen — Code/Name here is master data the Product Card must not
  // re-label or reinterpret.
  const [unitSets, setUnitSets] = useState<{ id: number; setName: string }[]>([]);

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);

  // Prefetch the small master lists once — same "fetch all, resolve locally" pattern
  // already used by Unit Sets for its Unit picker.
  useEffect(() => {
    (async () => {
      const entries = await Promise.all(LOOKUP_KEYS.map((k) => legacyErpApi.lookupTable(k).catch(() => [])));
      setLookups(Object.fromEntries(LOOKUP_KEYS.map((k, i) => [k, entries[i] as LookupOption[]])) as any);
    })();
    legacyErpApi.unitSets.list().then((r: any) => setUnitSets(Array.isArray(r) ? r : [])).catch(() => setUnitSets([]));
  }, []);

  useEffect(() => {
    if (!form.currentAccountId) { setLeadLabel(""); return; }
    let cancelled = false;
    legacyErpApi.accounts.get(Number(form.currentAccountId))
      .then((a: any) => { if (!cancelled) setLeadLabel(`${a.currentAccountCode} - ${a.currentAccountName}`); })
      .catch(() => { if (!cancelled) setLeadLabel(""); });
    return () => { cancelled = true; };
  }, [form.currentAccountId]);

  // Shows the code the next Save will get, before Save is ever pressed — a preview only
  // (see yarn-card.controller.ts's next-code route): the code actually assigned at Save
  // time is decided fresh there too, so this can occasionally shift if someone else saves
  // a Yarn Card in between, which is expected and handled server-side, not a bug here.
  const loadPreviewCode = async () => {
    try {
      const r: any = await legacyErpApi.yarnCards.previewNextCode();
      setForm((p) => ({ ...p, inventoryCode: r.code }));
      // Also folded into the "last saved" snapshot — the preview loading in behind the
      // scenes must never by itself flip the form into a "dirty/unsaved changes" state.
      lastSavedRef.current = { ...lastSavedRef.current, inventoryCode: r.code };
    } catch {
      // Non-critical — Save still generates the real code even if this preview fails to load.
    }
  };

  useEffect(() => {
    if (initialId) return;
    loadPreviewCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialId) return;
    (async () => {
      try {
        const r: any = await legacyErpApi.yarnCards.get(Number(initialId));
        setForm({ ...emptyForm, ...r });
        lastSavedRef.current = { ...emptyForm, ...r };
        setItemId(r.id);
        setCodeInput(r.inventoryCode);
      } catch (e: any) {
        toast.error(e.message || "Could not load yarn card");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.yarnCards.getByCode(codeInput.trim());
      setForm({ ...emptyForm, ...r });
      lastSavedRef.current = { ...emptyForm, ...r };
      setItemId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error("No yarn card found with that code");
      setItemId(null);
      setForm(emptyForm);
      lastSavedRef.current = emptyForm;
      loadPreviewCode();
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
    loadPreviewCode();
  };

  // Code is server-generated (YARN-00001, ...) — never a user-editable field, so the only
  // client-side gate before Save is Name. Code/Name uniqueness itself is enforced by
  // yarn-card.service.ts (ConflictException with the exact required messages), caught below
  // and surfaced both as a toast and — when it's a Name conflict — as an inline highlight,
  // since Code has no editable field left to highlight against.
  const save = async () => {
    setNameError("");
    setShelfNumberError("");
    if (!form.inventoryName.trim()) {
      setNameError("Name is required");
      return toast.error("Name is required");
    }
    const shelfNumber = Number(form.shelfLifeUnit);
    if (form.shelfLifeUnit === "" || !Number.isInteger(shelfNumber) || shelfNumber < 1) {
      const msg = "Shelf Number must be greater than or equal to 1.";
      setShelfNumberError(msg);
      return toast.error(msg);
    }
    setSaving(true);
    try {
      if (itemId) {
        const r: any = await legacyErpApi.yarnCards.update(itemId, form);
        setForm({ ...emptyForm, ...r });
        lastSavedRef.current = { ...emptyForm, ...r };
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.yarnCards.create(form);
        setForm({ ...emptyForm, ...r });
        lastSavedRef.current = { ...emptyForm, ...r };
        setItemId(r.id);
        setCodeInput(r.inventoryCode);
        toast.success("Created");
      }
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (/name/i.test(msg)) setNameError(msg);
      toast.error(msg);
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
        <EmptyDescription>Save the yarn card first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Yarn Cards</span>
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
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {itemId ? (form.inventoryName || "Yarn Card") : "New Yarn Card"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Yarn Card</p>
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

      {/* Top section (Code / Name / In Use) — always visible regardless of active tab,
          matching the legacy screen's fixed header strip above the tab content. Code is
          read-only everywhere: it's generated by the server on Save (YARN-00001, ...) and
          never user-editable, so there's nothing here to disable in view mode either. */}
      <FormGrid>
        <div className={spanClass("normal")}>
          <FieldLabel>Code</FieldLabel>
          <input
            value={form.inventoryCode || "Generating..."}
            disabled
            readOnly
            title="Code is generated automatically and cannot be edited"
            className="h-9 w-full min-w-0 cursor-not-allowed rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground shadow-xs outline-none disabled:opacity-100"
          />
        </div>
        <fieldset disabled={readOnly} className="contents">
          <div className={spanClass("normal")}>
            <FieldLabel>Name</FieldLabel>
            <input
              value={form.inventoryName}
              onChange={(e) => { set("inventoryName", e.target.value); if (nameError) setNameError(""); }}
              className={cn(
                "h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                nameError ? "border-destructive focus-visible:ring-destructive/40" : "border-input"
              )}
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>
          <FieldCheck label="In Use" checked={form.inUse} onChange={(v) => set("inUse", v)} />
        </fieldset>
      </FormGrid>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
          <ScrollableTabsList tabs={TABS} activeTab={activeTab} />

          <div className="p-6">
            <TabsContent value="General" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <CardSection title="General Information">
                  <FieldSelect label="Inventory Type" value={form.inventoryType} onChange={(v) => set("inventoryType", v)} options={INVENTORY_TYPE_OPTIONS} />
                  <FieldText label="Special Code" value={form.specialCode} onChange={(v) => set("specialCode", v)} />
                  {lookupField("group", "Group Code", "groupId")}
                  <FieldText label="Shelf Life" value={form.shelfLife} onChange={(v) => set("shelfLife", v)} type="number" />
                  <FieldStepper
                    label="Shelf Number"
                    value={form.shelfLifeUnit}
                    onChange={(v) => { set("shelfLifeUnit", v); if (shelfNumberError) setShelfNumberError(""); }}
                    min={1}
                    errorMessage={shelfNumberError}
                  />
                  {lookupField("mark", "Brand", "markId")}
                  <LookupField
                    label="Unit"
                    displayValue={unitSets.find((u) => String(u.id) === String(form.unitId))?.setName ?? ""}
                    onSelect={(u: { id: number; setName: string }) => set("unitId", String(u.id))}
                    fetchOptions={async (term: string) => {
                      const q = term.trim().toLowerCase();
                      const pool = q ? unitSets.filter((u) => u.setName.toLowerCase().includes(q)) : unitSets;
                      return pool.slice(0, 50);
                    }}
                    getLabel={(u: { id: number; setName: string }) => u.setName}
                    getValue={(u: { id: number; setName: string }) => u.id}
                  />
                </CardSection>

                <CardSection title="Withholding">
                  <FactorDivisorField
                    label="Purchase"
                    factor={form.withholdingFactor} divisor={form.withholdingDivisor}
                    onFactorChange={(v) => set("withholdingFactor", v)} onDivisorChange={(v) => set("withholdingDivisor", v)}
                  />
                  <FactorDivisorField
                    label="Sales - Distribution"
                    factor={form.sWithholdingFactor} divisor={form.sWithholdingDivisor}
                    onFactorChange={(v) => set("sWithholdingFactor", v)} onDivisorChange={(v) => set("sWithholdingDivisor", v)}
                  />
                </CardSection>

                <CardSection title="Using For">
                  <FieldCheck label="Inventory Management" checked={form.useForCommon} onChange={(v) => set("useForCommon", v)} />
                  <FieldCheck label="Purchase" checked={form.useForPurchase} onChange={(v) => set("useForPurchase", v)} />
                  <FieldCheck label="Sales - Distribution" checked={form.useForSale} onChange={(v) => set("useForSale", v)} />
                </CardSection>

                <CardSection title="Follow-up Types">
                  <FieldCheck label="Variants" checked={form.hasVariant} onChange={(v) => set("hasVariant", v)} />
                  <FieldCheck label="Variants (Line)" checked={form.hasRowVariant} onChange={(v) => set("hasRowVariant", v)} />
                  <FieldCheck label="Serials" checked={form.hasSeries} onChange={(v) => set("hasSeries", v)} />
                  <FieldCheck label="Separable Serials" checked={form.hasSeparableSeries} onChange={(v) => set("hasSeparableSeries", v)} />
                </CardSection>

                <CardSection title="Supplier / Manufacturer Info">
                  <LookupField
                    label="Lead Code"
                    displayValue={leadLabel}
                    onSelect={(a: any) => set("currentAccountId", String(a.id))}
                    fetchOptions={(term: string) => legacyErpApi.accounts.list(term) as Promise<any[]>}
                    getLabel={(a: any) => `${a.code} - ${a.name}`}
                    getValue={(a: any) => a.id}
                  />
                  <FieldText label="Product Code" value={form.producerInventoryCode} onChange={(v) => set("producerInventoryCode", v)} />
                </CardSection>
              </fieldset>
            </TabsContent>

            <TabsContent value="Detail" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <CardSection title="Fiber &amp; Yarn Technical Details">
                  <FieldText label="Denier" value={form.denier} onChange={(v) => set("denier", v)} type="number" />
                  <FieldText label="Denier Type" value={form.denierType} onChange={(v) => set("denierType", v)} type="number" />
                  <FieldText label="Fiber Composition" value={form.fComposition} onChange={(v) => set("fComposition", v)} />
                  <FieldText label="Density" value={form.density} onChange={(v) => set("density", v)} type="number" />
                  <FieldText label="Wash Care" value={form.washCare} onChange={(v) => set("washCare", v)} />
                  <FieldText label="Yarn Composition" value={form.uD_YComposition} onChange={(v) => set("uD_YComposition", v)} />
                  <FieldText label="Yarn Count (Text)" value={form.uD_YCount} onChange={(v) => set("uD_YCount", v)} />
                  <FieldText label="Recipe Quantity" value={form.recipeQuantity} onChange={(v) => set("recipeQuantity", v)} type="number" />
                  <FieldText label="Recipe Unit" value={form.recipeUnitItemId} onChange={(v) => set("recipeUnitItemId", v)} type="number" />
                  <FieldCheck label="Is Warp" checked={form.isWarp} onChange={(v) => set("isWarp", v)} />
                  <FieldCheck label="Is Finally" checked={form.isFinally} onChange={(v) => set("isFinally", v)} />
                </CardSection>
              </fieldset>
            </TabsContent>

            <TabsContent value="Variant Types" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <CardSection title="Variant Types">
                  {lookupField("variant-type", "Variant Type 1", "variant1TypeId")}
                  {lookupField("variant-type", "Variant Type 2", "variant2TypeId")}
                  {lookupField("variant-type", "Variant Type 3", "variant3TypeId")}
                  {lookupField("variant-type", "Variant Type 4", "variant4TypeId")}
                  {lookupField("variant-type", "Variant Type 5", "variant5TypeId")}
                </CardSection>
              </fieldset>
            </TabsContent>

            <TabsContent value="Integration" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <CardSection title="Integration / Web">
                  <FieldText label="ISO Document No" value={form.isoDocumentNo} onChange={(v) => set("isoDocumentNo", v)} />
                  <FieldText label="Web Content" value={form.webContent} onChange={(v) => set("webContent", v)} />
                  <FieldText label="Season Code" value={form.seasonCode} onChange={(v) => set("seasonCode", v)} />
                  <FieldText label="Gender Code" value={form.genderCode} onChange={(v) => set("genderCode", v)} />
                  <FieldText label="Campaign Group" value={form.campaignGroup} onChange={(v) => set("campaignGroup", v)} />
                  <FieldText label="Price Group" value={form.priceGroup} onChange={(v) => set("priceGroup", v)} />
                  <FieldText label="Plan Capacity Group" value={form.planCapacityGroup} onChange={(v) => set("planCapacityGroup", v)} />
                </CardSection>
              </fieldset>
            </TabsContent>

            {!itemId ? (
              [
                "Warehouse Status", "Barcode", "Unit", "Explanation",
                "Attachments", "Warehouse Parameters", "Customized Fields",
              ].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                {/* Read-only view of the same per-warehouse rows Warehouse Parameters edits —
                    there is no separate live-stock-quantity table in the migrated schema, so
                    Status and Parameters share IM_ItemWarehouse instead of risking duplicate
                    rows per warehouse from two independent CRUD tabs. */}
                <TabsContent value="Warehouse Status">
                  <SatelliteGridTab itemId={itemId} readOnly tab="warehouse-parameters" fields={[
                    { key: "warehouseId", label: "Warehouse", type: "number" },
                    { key: "minimumQuantity", label: "Min Qty", type: "number" },
                    { key: "optimumQuantity", label: "Optimum Qty", type: "number" },
                  ]} />
                </TabsContent>

                <TabsContent value="Barcode">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="barcode" addLabel="Add Barcode" fields={[
                    { key: "barcode", label: "Barcode" },
                    { key: "barcodeType", label: "Type", type: "number" },
                    { key: "pluCode", label: "PLU Code" },
                    { key: "unitSetItemId", label: "Unit", type: "number" },
                    { key: "quantity", label: "Quantity", type: "number" },
                    { key: "inUse", label: "In Use", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Unit">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="unit" addLabel="Add Unit" fields={[
                    { key: "unitItemId", label: "Unit", type: "number" },
                    { key: "unitFactor", label: "Factor", type: "number" },
                    { key: "unitDivisor", label: "Divisor", type: "number" },
                    { key: "isMainUnit", label: "Main Unit", type: "checkbox" },
                    { key: "isDivisible", label: "Divisible", type: "checkbox" },
                    { key: "useForCommon", label: "Common", type: "checkbox" },
                    { key: "useForPurchase", label: "Purchase", type: "checkbox" },
                    { key: "useForSale", label: "Sale", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Explanation">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="explanation" addLabel="Add Explanation" fields={[
                    { key: "explanationType", label: "Type", type: "number" },
                    { key: "explanationText", label: "Text" },
                    { key: "inUse", label: "In Use", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={itemId} readOnly={readOnly} />
                </TabsContent>

                <TabsContent value="Warehouse Parameters">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="warehouse-parameters" addLabel="Add Warehouse Parameter" fields={[
                    { key: "warehouseId", label: "Warehouse", type: "number" },
                    { key: "minimumQuantity", label: "Min Qty", type: "number" },
                    { key: "optimumQuantity", label: "Optimum Qty", type: "number" },
                    { key: "controlType", label: "Control Type", type: "number" },
                    { key: "mControlType", label: "M Control Type", type: "number" },
                    { key: "isAction", label: "Is Action", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Customized Fields">
                  <CustomizedFieldsTab itemId={String(itemId)} readOnly={readOnly} />
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}

