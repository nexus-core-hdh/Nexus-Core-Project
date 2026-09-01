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
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Shirt, Lock } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
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
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { SatelliteGridTab } from "@/components/legacy-erp/satellite-grid-tab";
import { UnitTab } from "@/components/legacy-erp/unit-tab";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { ModuleHeader } from "@/components/legacy-erp/module-header";

// Follows the standard 3-column FormSection design system used site-wide by Current Account,
// Trim Cards, Warehouses and Unit Sets — NOT the 2-column layout that's a Product/Yarn-Card-
// specific exception scoped to that one screen only.

// IM_Item.InventoryType is a bare smallint with no CHECK constraint or seed data in the
// migrated schema (verified). Minimal convention, same footing already used for
// FI_Account.CurrentAccountType elsewhere in this module.
const INVENTORY_TYPE_OPTIONS = [
  { value: "1", label: "Product" },
  { value: "2", label: "Service" },
  { value: "3", label: "Fixed Asset" },
];

// VAT Rates/Taxes, Manufacturer Info, Detail, Explanation, Attributes, Prices and Picture
// Gallery are deliberately excluded — not rendered anywhere, including this list (which
// also drives the "Save required" placeholder tabs).
const TABS = [
  "General", "Unit", "Integration", "Warehouse Status",
  "Warehouse Parameters", "Barcode", "Variant Types", "Attachments",
];

const emptyForm: Record<string, any> = {
  inventoryCode: "", inventoryName: "", inUse: true, inventoryType: "1", accessCode: "FABRIC", specialCode: "",
  groupId: "", processId: "", fabricTypeId: "",
  uD_FabGSM: "", uD_FabDyeType: "",
  uD_FabComposition: "", uD_FabYarnCount: "", uD_FabYarnCount1: "", uD_FabYarnCount2: "", uD_FabYarnCount3: "",
  withholdingFactor: "", withholdingDivisor: "", sWithholdingFactor: "", sWithholdingDivisor: "",
  useForCommon: true, useForPurchase: true, useForSale: true,
  hasVariant: false, hasRowVariant: false, hasSeries: false, hasSeparableSeries: false,
  variant1TypeId: "", variant2TypeId: "", variant3TypeId: "", variant4TypeId: "", variant5TypeId: "",
  isoDocumentNo: "", webContent: "", seasonCode: "", genderCode: "", campaignGroup: "", priceGroup: "", planCapacityGroup: "",
};

// Root cause of the "value prop on input should not be null" / "changing a controlled input
// to be uncontrolled" React warnings on this screen: several IM_Item columns backing this
// form (UD_FabGSM, UD_FabDyeType, UD_FabComposition, ...) are nullable in the DB, and a raw
// `{ ...emptyForm, ...r }` spread let a null from the API silently overwrite emptyForm's safe
// "" default — every input/MasterAutocompleteField reading that field then received null
// instead of "". Normalizing once here, at every point a server record is merged into form
// state, means no individual field has to defend against null itself.
const sanitizeRecord = (raw: Record<string, any>): Record<string, any> => {
  const merged: Record<string, any> = { ...emptyForm, ...raw };
  for (const key of Object.keys(emptyForm)) {
    if (merged[key] === null || merged[key] === undefined) merged[key] = emptyForm[key];
  }
  return merged;
};

type LookupOption = { id: number | string; code?: string | null; name: string };
type LookupKey = "group" | "fabric" | "process" | "variant-type" | "finish-gsm" | "dye-type" | "composition";
const LOOKUP_KEYS: LookupKey[] = ["group", "fabric", "process", "variant-type", "finish-gsm", "dye-type", "composition"];

// The 8 fields that make up a Fabric Card's identity (requirement: mandatory for Create/Save,
// backend-validated — see fabric-card.service.ts's own IDENTITY_FIELDS). Mirrored here only
// for the frontend's supplementary pre-save check and the live Name preview below.
const IDENTITY_FIELDS: { key: string; label: string }[] = [
  { key: "fabricTypeId", label: "Fabric Type" },
  { key: "uD_FabGSM", label: "Finish GSM" },
  { key: "uD_FabDyeType", label: "Dye Type" },
  { key: "uD_FabComposition", label: "Composition" },
  { key: "uD_FabYarnCount", label: "Yarn Count 1" },
  { key: "uD_FabYarnCount1", label: "Yarn Count 2" },
  { key: "uD_FabYarnCount2", label: "Yarn Count 3" },
  { key: "uD_FabYarnCount3", label: "Yarn Count 4" },
];

const optionLabel = (o: LookupOption) => (o.code ? `${o.code} - ${o.name}` : o.name);
const labelFor = (list: LookupOption[], id: any) => {
  if (id === "" || id === null || id === undefined) return "";
  const found = list.find((o) => String(o.id) === String(id));
  return found ? optionLabel(found) : "";
};

// Identity's own section wrapper — same visual chrome as the shared FormSection (border/
// padding/title treatment, copied not parameterized) but a plain stacked body instead of
// FormSection's forced 3-column FormGrid, because Identity's two rows each need their own
// bespoke layout (a left/right split row, then a strict 2-up equal-width row) that a 3-column
// grid can't express.
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

export default function FabricCardPage() {
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
    group: [], fabric: [], process: [], "variant-type": [], "finish-gsm": [], "dye-type": [], composition: [],
  });
  // Yarn Count 1-4 reuse the existing Yarn Card module/table (IM_Item, AccessCode='YARN')
  // via legacyErpApi.yarnCards — not the generic lookup/tables endpoint, which has no "yarn"
  // entry (MD_Yarn, the table it used to point at, is an empty, unused reference table).
  //
  // No longer bulk-loads every Yarn Card at mount (that capped display/search at the first 50
  // rows returned by yarn-card.service.ts's own list(), same limit every other list screen
  // uses — not something this feature should raise). Instead this is a small resolved-name
  // cache, populated on demand: whenever a search returns a row (typing in the field) or a
  // saved Fabric Card is loaded (resolveYarnName below, one by-id fetch per already-selected
  // Yarn Count), never for a full unfiltered listing.
  const [yarnNames, setYarnNames] = useState<Record<string, LookupOption>>({});
  const cacheYarn = (o: LookupOption) => setYarnNames((p) => ({ ...p, [String(o.id)]: o }));

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  const { clearDraft } = useDraftForm({ storageKey: "fabricCardDraft", enabled: itemId == null, form, setForm });

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(LOOKUP_KEYS.map((k) => legacyErpApi.lookupTable(k).catch(() => [])));
      setLookups(Object.fromEntries(LOOKUP_KEYS.map((k, i) => [k, entries[i] as LookupOption[]])) as any);
    })();
  }, []);

  const searchYarnCards = async (term: string) => {
    const r: any = await legacyErpApi.yarnCards.list(term || undefined);
    const opts = (Array.isArray(r) ? r : []).map((y: any) => ({ id: y.id, code: y.inventoryCode, name: y.inventoryName }));
    opts.forEach(cacheYarn);
    return opts;
  };

  // Resolves one already-selected Yarn Count id's display name via the existing single-record
  // Yarn Card endpoint (legacyErpApi.yarnCards.get) — the same reuse-first pattern this page
  // already applies for Fabric Card's own by-id load. A no-op once cached (from a prior search
  // or a previous resolve), so re-rendering never re-fetches the same id twice.
  const resolveYarnName = async (id: any) => {
    if (id === "" || id === null || id === undefined) return;
    const key = String(id);
    if (yarnNames[key]) return;
    try {
      const y: any = await legacyErpApi.yarnCards.get(Number(id));
      cacheYarn({ id: y.id, code: y.inventoryCode, name: y.inventoryName });
    } catch {
      // Referenced Yarn Card no longer resolvable (deleted) — field is left showing blank,
      // same as any other unresolved lookup id on this page.
    }
  };
  const resolveYarnNames = (f: Record<string, any>) =>
    Promise.all([f.uD_FabYarnCount, f.uD_FabYarnCount1, f.uD_FabYarnCount2, f.uD_FabYarnCount3].map(resolveYarnName));

  // Shows the code the next Save will get, before Save is ever pressed — a preview only (see
  // fabric-card.controller.ts's next-code route): the code actually assigned at Save time is
  // decided fresh there too. Mirrors yarn-cards/page.tsx's own loadPreviewCode exactly.
  const loadPreviewCode = async () => {
    try {
      const r: any = await legacyErpApi.fabricCards.previewNextCode();
      setForm((p) => ({ ...p, inventoryCode: r.code }));
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
        const r: any = await legacyErpApi.fabricCards.get(Number(initialId));
        const f = sanitizeRecord(r);
        setForm(f);
        lastSavedRef.current = f;
        setItemId(r.id);
        setCodeInput(r.inventoryCode);
        resolveYarnNames(f);
      } catch (e: any) {
        toast.error(e.message || "Could not load fabric card");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.fabricCards.getByCode(codeInput.trim());
      const f = sanitizeRecord(r);
      setForm(f);
      lastSavedRef.current = f;
      setItemId(r.id);
      setMode("edit");
      resolveYarnNames(f);
      toast.success("Loaded");
    } catch {
      toast.error("No fabric card found with that code");
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

  // Supplementary only — backend is the real authority (fabric-card.service.ts's own
  // resolveIdentity()) and returns the same message shape on a direct API call.
  const save = async () => {
    const missing = IDENTITY_FIELDS.filter((f) => !String(form[f.key] ?? "").trim()).map((f) => f.label);
    if (missing.length) return toast.error(`Missing required field(s): ${missing.join(", ")}`);
    setSaving(true);
    try {
      if (itemId) {
        const r: any = await legacyErpApi.fabricCards.update(itemId, form);
        const f = sanitizeRecord(r);
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.fabricCards.create(form);
        const f = sanitizeRecord(r);
        setForm(f);
        lastSavedRef.current = f;
        setItemId(r.id);
        setCodeInput(r.inventoryCode);
        clearDraft();
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

  // Live client-side preview of the backend's own naming convention (fabric-card.service.ts's
  // buildIdentityName) — used only while form.inventoryName is still empty, i.e. a NEW/unsaved
  // record (requirement: Name/preview updates as the 8 selections change on a new record). Once
  // saved, form.inventoryName holds the real server-computed value and this is never consulted
  // again until a fresh unsaved record starts over empty.
  const previewName = () => {
    const fab = lookups.fabric.find((o) => String(o.id) === String(form.fabricTypeId))?.name;
    const gsm = lookups["finish-gsm"].find((o) => String(o.id) === String(form.uD_FabGSM))?.name;
    const dye = lookups["dye-type"].find((o) => String(o.id) === String(form.uD_FabDyeType))?.name;
    const comp = lookups.composition.find((o) => String(o.id) === String(form.uD_FabComposition))?.name;
    const y1 = yarnNames[String(form.uD_FabYarnCount)]?.code;
    const y2 = yarnNames[String(form.uD_FabYarnCount1)]?.code;
    const y3 = yarnNames[String(form.uD_FabYarnCount2)]?.code;
    const y4 = yarnNames[String(form.uD_FabYarnCount3)]?.code;
    if (!fab || !gsm || !dye || !comp || !y1 || !y2 || !y3 || !y4) return "";
    return `${fab} | ${gsm} GSM | ${dye} | ${comp} | ${y1}/${y2}/${y3}/${y4}`;
  };

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
        <EmptyDescription>Save the fabric card first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: "Fabric Cards", href: "/dashboard/legacy-erp/fabric-cards-list" },
        ...(itemId ? [{ label: form.inventoryCode }] : []),
      ]} />

      <ModuleHeader
        icon={Shirt}
        title={itemId ? (form.inventoryName || "Fabric Card") : "New Fabric Card"}
        subtitle="Fabric Card"
        badges={
          readOnly && (
            <Badge variant="secondary" className="h-5 gap-1 text-[11px] font-normal">
              <Lock className="h-2.5 w-2.5" />View Only
            </Badge>
          )
        }
        actions={
          <>
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
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
          <ScrollableTabsList tabs={TABS} activeTab={activeTab} />

          <div className="p-6">
            <TabsContent value="General" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <IdentitySection>
                  {/* Row 1 — In Use pinned left, Operation Code pinned right, both
                      vertically centered on the same line. */}
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

                  {/* Row 2 — Code and Name, exactly equal width and height. */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Code is read-only everywhere: server-generated on Save (FABRIC-00001, ...)
                        and never user-editable, matching yarn-cards/page.tsx's own Code field. */}
                    <FieldText
                      label="Code"
                      value={form.inventoryCode || "Generating..."}
                      onChange={() => {}}
                      disabled
                    />
                    {/* Auto-generated from the 8 identity selections (Fabric Type, Finish GSM,
                        Dye Type, Composition, Yarn Count 1-4) — always read-only, same as Code.
                        Shows a live preview while unsaved; the authoritative value comes back
                        from the server on Save. */}
                    <FieldText
                      label="Name"
                      value={form.inventoryName || previewName() || "Auto-generated from selections above"}
                      onChange={() => {}}
                      disabled
                    />
                  </div>
                </IdentitySection>

                <FormSection title="General Information">
                  <FieldSelect label="Inventory Type" value={form.inventoryType} onChange={(v) => set("inventoryType", v)} options={INVENTORY_TYPE_OPTIONS} />
                  <FieldText label="Access Code" value={form.accessCode} onChange={(v) => set("accessCode", v)} />
                  <FieldText label="Special Code" value={form.specialCode} onChange={(v) => set("specialCode", v)} />
                  <MasterAutocompleteField
                    label="FabType"
                    masterKey="fabric"
                    // Name only — the field never shows "Code - Name" (requirement #10);
                    // fabricTypeId (the real FK) is what's actually stored via onSelect.
                    displayValue={lookups.fabric.find((o) => String(o.id) === String(form.fabricTypeId))?.name ?? ""}
                    onSelect={(o) => set("fabricTypeId", String(o.id))}
                    onClear={() => set("fabricTypeId", "")}
                  />
                  <MasterAutocompleteField
                    label="Group Code"
                    masterKey="group"
                    displayValue={lookups.group.find((o) => String(o.id) === String(form.groupId))?.name ?? ""}
                    onSelect={(o) => set("groupId", String(o.id))}
                    onClear={() => set("groupId", "")}
                  />
                  <MasterAutocompleteField
                    label="Finish GSM"
                    masterKey="finish-gsm"
                    displayValue={lookups["finish-gsm"].find((o) => String(o.id) === String(form.uD_FabGSM))?.name ?? ""}
                    onSelect={(o) => set("uD_FabGSM", String(o.id))}
                    onClear={() => set("uD_FabGSM", "")}
                  />
                  <MasterAutocompleteField
                    label="Dye Type"
                    masterKey="dye-type"
                    displayValue={lookups["dye-type"].find((o) => String(o.id) === String(form.uD_FabDyeType))?.name ?? ""}
                    onSelect={(o) => set("uD_FabDyeType", String(o.id))}
                    onClear={() => set("uD_FabDyeType", "")}
                  />
                </FormSection>

                <FormSection title="Composition &amp; Yarn Counts">
                  <MasterAutocompleteField
                    label="Composition"
                    masterKey="composition"
                    displayValue={lookups.composition.find((o) => String(o.id) === String(form.uD_FabComposition))?.name ?? ""}
                    onSelect={(o) => set("uD_FabComposition", String(o.id))}
                    onClear={() => set("uD_FabComposition", "")}
                  />
                  <MasterAutocompleteField
                    label="Yarn Count 1"
                    masterKey="yarn"
                    displayValue={yarnNames[String(form.uD_FabYarnCount)]?.name ?? ""}
                    onSelect={(o) => { cacheYarn(o); set("uD_FabYarnCount", String(o.id)); }}
                    onClear={() => set("uD_FabYarnCount", "")}
                    fetchOptions={searchYarnCards}
                    lookupPath="/dashboard/legacy-erp/yarn-cards-list"
                  />
                  <MasterAutocompleteField
                    label="Yarn Count 2"
                    masterKey="yarn"
                    displayValue={yarnNames[String(form.uD_FabYarnCount1)]?.name ?? ""}
                    onSelect={(o) => { cacheYarn(o); set("uD_FabYarnCount1", String(o.id)); }}
                    onClear={() => set("uD_FabYarnCount1", "")}
                    fetchOptions={searchYarnCards}
                    lookupPath="/dashboard/legacy-erp/yarn-cards-list"
                  />
                  <MasterAutocompleteField
                    label="Yarn Count 3"
                    masterKey="yarn"
                    displayValue={yarnNames[String(form.uD_FabYarnCount2)]?.name ?? ""}
                    onSelect={(o) => { cacheYarn(o); set("uD_FabYarnCount2", String(o.id)); }}
                    onClear={() => set("uD_FabYarnCount2", "")}
                    fetchOptions={searchYarnCards}
                    lookupPath="/dashboard/legacy-erp/yarn-cards-list"
                  />
                  <MasterAutocompleteField
                    label="Yarn Count 4"
                    masterKey="yarn"
                    displayValue={yarnNames[String(form.uD_FabYarnCount3)]?.name ?? ""}
                    onSelect={(o) => { cacheYarn(o); set("uD_FabYarnCount3", String(o.id)); }}
                    onClear={() => set("uD_FabYarnCount3", "")}
                    fetchOptions={searchYarnCards}
                    lookupPath="/dashboard/legacy-erp/yarn-cards-list"
                  />
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

            {/* Same 3-column FormSection standard as General — every field here is "normal"
                width (no "wide" overrides), so all controls stay identical width/height and
                every row stays perfectly aligned. */}
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
                  <UnitTab itemId={itemId} readOnly={readOnly} api={legacyErpApi.fabricCards} />
                </TabsContent>

                {/* Read-only view of the same per-warehouse rows Warehouse Parameters edits —
                    there is no separate live-stock-quantity table in the migrated schema, so
                    Status and Parameters share IM_ItemWarehouse instead of risking duplicate
                    rows per warehouse from two independent CRUD tabs (same reasoning as Yarn Card). */}
                <TabsContent value="Warehouse Status">
                  <SatelliteGridTab itemId={itemId} readOnly tab="warehouse-parameters" columnsKey="warehouse-status" api={legacyErpApi.fabricCards} fields={[
                    { key: "warehouseId", label: "Warehouse", type: "number" },
                    { key: "minimumQuantity", label: "Min Qty", type: "number" },
                    { key: "optimumQuantity", label: "Optimum Qty", type: "number" },
                  ]} />
                </TabsContent>

                <TabsContent value="Warehouse Parameters">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="warehouse-parameters" addLabel="Add Warehouse Parameter" api={legacyErpApi.fabricCards} fields={[
                    { key: "warehouseId", label: "Warehouse", type: "number" },
                    { key: "minimumQuantity", label: "Min Qty", type: "number" },
                    { key: "optimumQuantity", label: "Optimum Qty", type: "number" },
                    { key: "controlType", label: "Control Type", type: "number" },
                    { key: "mControlType", label: "M Control Type", type: "number" },
                    { key: "isAction", label: "Is Action", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Barcode">
                  <SatelliteGridTab itemId={itemId} readOnly={readOnly} tab="barcode" addLabel="Add Barcode" api={legacyErpApi.fabricCards} fields={[
                    { key: "barcode", label: "Barcode" },
                    { key: "barcodeType", label: "Type", type: "number" },
                    { key: "pluCode", label: "PLU Code" },
                    { key: "unitSetItemId", label: "Unit", type: "number" },
                    { key: "quantity", label: "Quantity", type: "number" },
                    { key: "inUse", label: "In Use", type: "checkbox" },
                  ]} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={itemId} readOnly={readOnly} api={legacyErpApi.fabricCards} />
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
