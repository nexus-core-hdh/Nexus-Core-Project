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
import { Search, Save, FilePlus2, UserSquare2, Lock, LayoutGrid, Wallet, Users, ShieldCheck, Paperclip, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { FormSection } from "@/components/forms/form-section";
import {
  FormTextField as FieldText,
  FormSwitchField as FieldCheck,
  FormSelectField as FieldSelect,
} from "@/components/forms/form-field";
import { SatelliteGridTab } from "./_components/satellite-grid-tab";
import { TotalsTab } from "./_components/totals-tab";
import { AttachmentsTab } from "./_components/attachments-tab";

const emptyForm: Record<string, any> = {
  currentAccountCode: "", currentAccountName: "", accessCode: "", specialCode: "",
  groupId: "", sectorId: "", tradingGroupId: "", currentAccountType: "", currentAccountKind: "",
  tradeName: "", employeeId: "", sellerId: "", channelId: "", brokerId: "",
  isPotential: false, isDealer: false, isFactoring: false,
  customerGLAccountId: "", supplierGLAccountId: "", termDay: "", paymentPlanId: "",
  discountGroupCode: "", priceGroupCode: "", salesDiscountId: "", purchaseDiscountId: "",
  taxOfficeId: "", taxNo: "", forexId: "", forexRateId: "", inUse: true,
  // Detail
  parentId: "", statusId: "", isBlackList: false, isVip: false, isFrequent: false, isAgent: false,
  isSubSupplier: false, cardNo: "", isCardActive: false, warehouseId: "", costCenterId: "",
  shipmentType: "", isPartialShipment: false, minShipmentRate: "", transporterId: "", countries: "", controlCode: "",
  // Financial Info
  riskLimit: "", chequeRiskLimit: "", endorsmentChequeRiskLimit: "", noteRiskLimit: "", endorsmentNoteRiskLimit: "",
  chequeRiskFactor: "", noteRiskFactor: "", riskType: "", riskOver: "", orderRiskOver: "", dispatchRiskOver: "", chequeRiskOver: "",
  interestRate: "", paymentType: "", invoicePaymentType: "", evaluateChequeForex: false, notForPaymentPlan: false,
  paymentPlanDebit: "", factoringCompanyId: "", correspondingFactoringCompany: "", factoringLimit: "",
  factoringLimit2: "", factoringLimit3: "", factoringPeriodStart: "", factoringPeriodEnd: "", fundingLimit: "",
  isReconciled: false, reconciliationDate: "",
  // Personal
  educationType: "", maritalStatus: "", idType: "", idCardNo: "", idNo: "", idFathersName: "", idMothersName: "",
  socialSecurityNo: "", gender: "", birthDate: "", birthPlace: "", jobTitle: "", profession: "", gsmPhone: "",
  spouseName: "", spouseBirthDate: "", spouseCompany: "", spouseJobTitle: "", spouseProfession: "",
  // Manufacturing
  cuttingExtra: "", productionCertificates: "", certificatesEndDate: "", certificationId: "", aqlLevel: "",
  egovernmentUsageType: "", orderShipmentControlType: "",
};

// FI_Account.CurrentAccountType (smallint) — standard Logo/Netsis-style 3-state code.
// Not documented in the migrated schema/procedures; mapped per this ERP family's usual convention.
const CURRENT_ACCOUNT_TYPE_OPTIONS = [
  { value: "0", label: "Customer + Supplier" },
  { value: "1", label: "Customer" },
  { value: "2", label: "Supplier" },
];

function HighlightCell({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "positive" | "neutral" | "warning" }) {
  return (
    <div className="bg-card px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className={cn(
        "mt-1 truncate text-sm font-semibold text-foreground",
        tone === "positive" && "text-emerald-600 dark:text-emerald-400",
        tone === "neutral" && "text-muted-foreground font-medium",
        tone === "warning" && "text-amber-600 dark:text-amber-400"
      )}>
        {value}
      </p>
    </div>
  );
}

const TABS = [
  "General", "Detail", "Fixed Forex Rates", "Financial Info", "Monthly", "Address", "Contact",
  "Forex Balance Breakdowns", "Explanation", "Personal", "Inventory Attributes", "Guarantor",
  "Bank Info", "Attachments", "Manufacturing",
];

// Two-tier navigation: the 15 raw tabs are grouped into 5 business categories so the
// record's information architecture reads like an ERP object page instead of a flat
// CRUD tab strip. Every TabsTrigger/TabsContent value below is unchanged — this only
// changes which subset of triggers is visible at a time.
const TAB_GROUPS = [
  { key: "overview", label: "Overview", icon: LayoutGrid, tabs: ["General", "Detail"] },
  { key: "financial", label: "Financial", icon: Wallet, tabs: ["Financial Info", "Fixed Forex Rates", "Monthly", "Forex Balance Breakdowns"] },
  { key: "relations", label: "Relations", icon: Users, tabs: ["Address", "Contact", "Guarantor", "Bank Info"] },
  { key: "compliance", label: "Personal & Compliance", icon: ShieldCheck, tabs: ["Personal", "Manufacturing", "Inventory Attributes"] },
  { key: "documents", label: "Documents", icon: Paperclip, tabs: ["Explanation", "Attachments"] },
] as const;

export default function CurrentAccountCardPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");

  const [codeInput, setCodeInput] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");
  const activeGroup = TAB_GROUPS.find((g) => (g.tabs as readonly string[]).includes(activeTab)) ?? TAB_GROUPS[0];
  const typeLabel = CURRENT_ACCOUNT_TYPE_OPTIONS.find((o) => o.value === String(form.currentAccountType))?.label;

  // Tracks the last loaded/saved form snapshot so the Workspace Tab Bar can warn
  // before closing a tab with unsaved edits. Only updated at clean-state moments
  // (initial load, search, save, New) — never by the field-level `set()` updater,
  // which is exactly what should make the form "dirty".
  const lastSavedRef = useRef<Record<string, any>>(emptyForm);

  // Arrived from the Current Account List screen (?id=&mode=view|edit) — load that record
  // straight away instead of requiring a manual Code search.
  useEffect(() => {
    if (!initialId) return;
    (async () => {
      try {
        const r: any = await legacyErpApi.accounts.get(Number(initialId));
        setForm({ ...emptyForm, ...r });
        lastSavedRef.current = { ...emptyForm, ...r };
        setAccountId(r.id);
        setCodeInput(r.currentAccountCode);
      } catch (e: any) {
        toast.error(e.message || "Could not load current account");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.accounts.getByCode(codeInput.trim());
      setForm({ ...emptyForm, ...r });
      lastSavedRef.current = { ...emptyForm, ...r };
      setAccountId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error("No current account found with that code");
      setAccountId(null);
      const draft = { ...emptyForm, currentAccountCode: codeInput.trim() };
      setForm(draft);
      lastSavedRef.current = draft;
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setAccountId(null);
    setCodeInput("");
    setForm(emptyForm);
    lastSavedRef.current = emptyForm;
    setMode("create");
  };

  const save = async () => {
    if (!form.currentAccountCode || !form.currentAccountName) return toast.error("Code and Name are required");
    setSaving(true);
    try {
      if (accountId) {
        const r: any = await legacyErpApi.accounts.update(accountId, form);
        setForm({ ...emptyForm, ...r });
        lastSavedRef.current = { ...emptyForm, ...r };
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.accounts.create(form);
        setForm({ ...emptyForm, ...r });
        lastSavedRef.current = { ...emptyForm, ...r };
        setAccountId(r.id);
        setCodeInput(r.currentAccountCode);
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Current Accounts</span>
        {accountId && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{form.currentAccountCode}</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <UserSquare2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {accountId ? (form.currentAccountName || "Current Account") : "New Current Account"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Current Account Card</p>
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

      {accountId && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-sm md:grid-cols-4">
          <HighlightCell label="Code" value={form.currentAccountCode} />
          <HighlightCell label="Account Type" value={typeLabel || "—"} />
          <HighlightCell label="Trade Name" value={form.tradeName || "—"} />
          <HighlightCell label="Status" value={form.inUse ? "Active" : "Inactive"} tone={form.inUse ? "positive" : "neutral"} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {TAB_GROUPS.map((g) => {
            const GroupIcon = g.icon;
            const isActive = g.key === activeGroup.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setActiveTab(g.tabs[0])}
                className={cn(
                  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 lg:w-full",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                {g.label}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 rounded-xl border bg-card shadow-sm">
          <ScrollableTabsList tabs={[...activeGroup.tabs]} activeTab={activeTab} />

          <div className="p-6">

        <TabsContent value="General" className="space-y-4">
          <fieldset disabled={readOnly} className="contents">
          <FormSection title="Identity">
            <FieldText label="Code" value={form.currentAccountCode} onChange={(v) => set("currentAccountCode", v)} />
            <FieldText label="Name" value={form.currentAccountName} onChange={(v) => set("currentAccountName", v)} span="wide" />
            <FieldText label="Access Code" value={form.accessCode} onChange={(v) => set("accessCode", v)} />
            <FieldText label="Special Code" value={form.specialCode} onChange={(v) => set("specialCode", v)} />
            <FieldText label="Group" value={form.groupId} onChange={(v) => set("groupId", v)} lookup />
            <FieldText label="Sector" value={form.sectorId} onChange={(v) => set("sectorId", v)} lookup />
            <FieldText label="Trading Group" value={form.tradingGroupId} onChange={(v) => set("tradingGroupId", v)} lookup />
            <FieldSelect label="Current Account Type" value={form.currentAccountType} onChange={(v) => set("currentAccountType", v)} options={CURRENT_ACCOUNT_TYPE_OPTIONS} />
            <FieldText label="Current Account Kind" value={form.currentAccountKind} onChange={(v) => set("currentAccountKind", v)} type="number" />
            <FieldText label="Trade Name" value={form.tradeName} onChange={(v) => set("tradeName", v)} span="wide" />
            <FieldText label="Employee" value={form.employeeId} onChange={(v) => set("employeeId", v)} lookup />
            <FieldText label="Seller" value={form.sellerId} onChange={(v) => set("sellerId", v)} lookup />
            <FieldText label="Sales Channel" value={form.channelId} onChange={(v) => set("channelId", v)} lookup />
            <FieldText label="Broker" value={form.brokerId} onChange={(v) => set("brokerId", v)} lookup />
            <FieldCheck label="Potential" checked={form.isPotential} onChange={(v) => set("isPotential", v)} />
            <FieldCheck label="Dealer" checked={form.isDealer} onChange={(v) => set("isDealer", v)} />
            <FieldCheck label="Factoring" checked={form.isFactoring} onChange={(v) => set("isFactoring", v)} />
            <FieldCheck label="In Use" checked={form.inUse} onChange={(v) => set("inUse", v)} />
          </FormSection>

          <FormSection title="Financial Linkage">
            <FieldText label="Customer GL Account Code" value={form.customerGLAccountId} onChange={(v) => set("customerGLAccountId", v)} lookup />
            <FieldText label="Supplier GL Account Code" value={form.supplierGLAccountId} onChange={(v) => set("supplierGLAccountId", v)} lookup />
            <FieldText label="Term Date Difference Rate" value={form.termDay} onChange={(v) => set("termDay", v)} type="number" />
            <FieldText label="Payment Plan" value={form.paymentPlanId} onChange={(v) => set("paymentPlanId", v)} lookup />
            <FieldText label="Discount/Price Code" value={form.discountGroupCode} onChange={(v) => set("discountGroupCode", v)} />
            <FieldText label="Purchase Discount Code" value={form.purchaseDiscountId} onChange={(v) => set("purchaseDiscountId", v)} lookup />
            <FieldText label="Sales Discount Code" value={form.salesDiscountId} onChange={(v) => set("salesDiscountId", v)} lookup />
            <FieldText label="Tax Office/No" value={form.taxOfficeId} onChange={(v) => set("taxOfficeId", v)} lookup />
            <FieldText label="Tax No" value={form.taxNo} onChange={(v) => set("taxNo", v)} />
            <FieldText label="Forex" value={form.forexId} onChange={(v) => set("forexId", v)} lookup />
            <FieldText label="Forex Rate Type" value={form.forexRateId} onChange={(v) => set("forexRateId", v)} lookup />
          </FormSection>
          </fieldset>
        </TabsContent>

        <TabsContent value="Detail" className="space-y-4">
          <fieldset disabled={readOnly} className="contents">
          <FormSection title="Classification">
            <FieldText label="Parent Account" value={form.parentId} onChange={(v) => set("parentId", v)} lookup />
            <FieldText label="Status" value={form.statusId} onChange={(v) => set("statusId", v)} type="number" />
            <FieldText label="Card No" value={form.cardNo} onChange={(v) => set("cardNo", v)} />
            <FieldText label="Control Code" value={form.controlCode} onChange={(v) => set("controlCode", v)} type="number" />
          </FormSection>

          <FormSection title="Logistics">
            <FieldText label="Warehouse" value={form.warehouseId} onChange={(v) => set("warehouseId", v)} lookup />
            <FieldText label="Cost Center" value={form.costCenterId} onChange={(v) => set("costCenterId", v)} lookup />
            <FieldText label="Shipment Type" value={form.shipmentType} onChange={(v) => set("shipmentType", v)} type="number" />
            <FieldText label="Min Shipment Rate" value={form.minShipmentRate} onChange={(v) => set("minShipmentRate", v)} type="number" />
            <FieldText label="Transporter" value={form.transporterId} onChange={(v) => set("transporterId", v)} lookup />
            <FieldText label="Countries" value={form.countries} onChange={(v) => set("countries", v)} span="wide" />
          </FormSection>

          <FormSection title="Flags">
            <FieldCheck label="Black List" checked={form.isBlackList} onChange={(v) => set("isBlackList", v)} />
            <FieldCheck label="VIP" checked={form.isVip} onChange={(v) => set("isVip", v)} />
            <FieldCheck label="Frequent" checked={form.isFrequent} onChange={(v) => set("isFrequent", v)} />
            <FieldCheck label="Agent" checked={form.isAgent} onChange={(v) => set("isAgent", v)} />
            <FieldCheck label="Sub Supplier" checked={form.isSubSupplier} onChange={(v) => set("isSubSupplier", v)} />
            <FieldCheck label="Card Active" checked={form.isCardActive} onChange={(v) => set("isCardActive", v)} />
            <FieldCheck label="Partial Shipment" checked={form.isPartialShipment} onChange={(v) => set("isPartialShipment", v)} />
          </FormSection>
          </fieldset>
        </TabsContent>

        <TabsContent value="Financial Info" className="space-y-4">
          <fieldset disabled={readOnly} className="contents">
          <FormSection title="Risk Limits">
            <FieldText label="Risk Limit" value={form.riskLimit} onChange={(v) => set("riskLimit", v)} type="number" />
            <FieldText label="Cheque Risk Limit" value={form.chequeRiskLimit} onChange={(v) => set("chequeRiskLimit", v)} type="number" />
            <FieldText label="Endorsement Cheque Risk Limit" value={form.endorsmentChequeRiskLimit} onChange={(v) => set("endorsmentChequeRiskLimit", v)} type="number" />
            <FieldText label="Note Risk Limit" value={form.noteRiskLimit} onChange={(v) => set("noteRiskLimit", v)} type="number" />
            <FieldText label="Endorsement Note Risk Limit" value={form.endorsmentNoteRiskLimit} onChange={(v) => set("endorsmentNoteRiskLimit", v)} type="number" />
            <FieldText label="Cheque Risk Factor" value={form.chequeRiskFactor} onChange={(v) => set("chequeRiskFactor", v)} type="number" />
            <FieldText label="Note Risk Factor" value={form.noteRiskFactor} onChange={(v) => set("noteRiskFactor", v)} type="number" />
            <FieldText label="Risk Type" value={form.riskType} onChange={(v) => set("riskType", v)} type="number" />
          </FormSection>

          <FormSection title="Payment Terms">
            <FieldText label="Interest Rate" value={form.interestRate} onChange={(v) => set("interestRate", v)} type="number" />
            <FieldText label="Payment Type" value={form.paymentType} onChange={(v) => set("paymentType", v)} type="number" />
            <FieldText label="Payment Plan Debit" value={form.paymentPlanDebit} onChange={(v) => set("paymentPlanDebit", v)} type="number" />
            <FieldText label="Reconciliation Date" value={form.reconciliationDate} onChange={(v) => set("reconciliationDate", v)} type="date" />
            <FieldCheck label="Not For Payment Plan" checked={form.notForPaymentPlan} onChange={(v) => set("notForPaymentPlan", v)} />
            <FieldCheck label="Reconciled" checked={form.isReconciled} onChange={(v) => set("isReconciled", v)} />
          </FormSection>

          <FormSection title="Factoring">
            <FieldText label="Factoring Company" value={form.factoringCompanyId} onChange={(v) => set("factoringCompanyId", v)} lookup />
            <FieldText label="Corresponding Factoring Company" value={form.correspondingFactoringCompany} onChange={(v) => set("correspondingFactoringCompany", v)} />
            <FieldText label="Factoring Limit" value={form.factoringLimit} onChange={(v) => set("factoringLimit", v)} type="number" />
            <FieldText label="Factoring Limit 2" value={form.factoringLimit2} onChange={(v) => set("factoringLimit2", v)} type="number" />
            <FieldText label="Factoring Limit 3" value={form.factoringLimit3} onChange={(v) => set("factoringLimit3", v)} type="number" />
            <FieldText label="Factoring Period Start" value={form.factoringPeriodStart} onChange={(v) => set("factoringPeriodStart", v)} type="date" />
            <FieldText label="Factoring Period End" value={form.factoringPeriodEnd} onChange={(v) => set("factoringPeriodEnd", v)} type="date" />
            <FieldText label="Funding Limit" value={form.fundingLimit} onChange={(v) => set("fundingLimit", v)} type="number" />
            <FieldCheck label="Evaluate Cheque Forex" checked={form.evaluateChequeForex} onChange={(v) => set("evaluateChequeForex", v)} />
          </FormSection>
          </fieldset>
        </TabsContent>

        <TabsContent value="Personal" className="space-y-4">
          <fieldset disabled={readOnly} className="contents">
          <FormSection title="Identification">
            <FieldText label="Gender" value={form.gender} onChange={(v) => set("gender", v)} type="number" />
            <FieldText label="Birth Date" value={form.birthDate} onChange={(v) => set("birthDate", v)} type="date" />
            <FieldText label="Birth Place" value={form.birthPlace} onChange={(v) => set("birthPlace", v)} />
            <FieldText label="Marital Status" value={form.maritalStatus} onChange={(v) => set("maritalStatus", v)} type="number" />
            <FieldText label="Id Type" value={form.idType} onChange={(v) => set("idType", v)} />
            <FieldText label="Id Card No" value={form.idCardNo} onChange={(v) => set("idCardNo", v)} />
            <FieldText label="Id No" value={form.idNo} onChange={(v) => set("idNo", v)} />
            <FieldText label="Social Security No" value={form.socialSecurityNo} onChange={(v) => set("socialSecurityNo", v)} />
            <FieldText label="Father's Name" value={form.idFathersName} onChange={(v) => set("idFathersName", v)} />
            <FieldText label="Mother's Name" value={form.idMothersName} onChange={(v) => set("idMothersName", v)} />
          </FormSection>

          <FormSection title="Contact &amp; Career">
            <FieldText label="Education Type" value={form.educationType} onChange={(v) => set("educationType", v)} type="number" />
            <FieldText label="Job Title" value={form.jobTitle} onChange={(v) => set("jobTitle", v)} />
            <FieldText label="Profession" value={form.profession} onChange={(v) => set("profession", v)} />
            <FieldText label="GSM Phone" value={form.gsmPhone} onChange={(v) => set("gsmPhone", v)} />
          </FormSection>

          <FormSection title="Spouse Information">
            <FieldText label="Spouse Name" value={form.spouseName} onChange={(v) => set("spouseName", v)} />
            <FieldText label="Spouse Birth Date" value={form.spouseBirthDate} onChange={(v) => set("spouseBirthDate", v)} type="date" />
            <FieldText label="Spouse Company" value={form.spouseCompany} onChange={(v) => set("spouseCompany", v)} />
            <FieldText label="Spouse Job Title" value={form.spouseJobTitle} onChange={(v) => set("spouseJobTitle", v)} />
            <FieldText label="Spouse Profession" value={form.spouseProfession} onChange={(v) => set("spouseProfession", v)} />
          </FormSection>
          </fieldset>
        </TabsContent>

        <TabsContent value="Manufacturing">
          <fieldset disabled={readOnly} className="contents">
          <FormSection title="Certification &amp; Compliance">
            <FieldText label="Production Certificates" value={form.productionCertificates} onChange={(v) => set("productionCertificates", v)} />
            <FieldText label="Certificates End Date" value={form.certificatesEndDate} onChange={(v) => set("certificatesEndDate", v)} type="date" />
            <FieldText label="Certification" value={form.certificationId} onChange={(v) => set("certificationId", v)} lookup />
            <FieldText label="AQL Level" value={form.aqlLevel} onChange={(v) => set("aqlLevel", v)} type="number" />
            <FieldText label="Cutting Extra" value={form.cuttingExtra} onChange={(v) => set("cuttingExtra", v)} type="number" />
            <FieldText label="E-Government Usage Type" value={form.egovernmentUsageType} onChange={(v) => set("egovernmentUsageType", v)} type="number" />
            <FieldText label="Order Shipment Control Type" value={form.orderShipmentControlType} onChange={(v) => set("orderShipmentControlType", v)} type="number" />
          </FormSection>
          </fieldset>
        </TabsContent>

        {/* Attachments supports staging files locally before the account is saved, so it's
            never gated behind accountId the way the other satellite tabs are. Uploads/deletes
            are disabled in View mode, but files stay viewable/downloadable — the AttachmentsTab
            readOnly prop only hides the write actions, per the View-mode requirement. */}
        <TabsContent value="Attachments">
          <AttachmentsTab accountId={accountId} readOnly={readOnly} />
        </TabsContent>

        {!accountId ? (
          ["Fixed Forex Rates", "Address", "Contact", "Explanation", "Guarantor", "Bank Info", "Inventory Attributes", "Monthly", "Forex Balance Breakdowns"].map((t) => (
            <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Lock /></EmptyMedia>
                  <EmptyTitle>Save required</EmptyTitle>
                  <EmptyDescription>Save the current account first to manage {t.toLowerCase()}.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TabsContent>
          ))
        ) : (
          <>
            <TabsContent value="Fixed Forex Rates">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="forex-rates" addLabel="Add Forex Rate" fields={[
                { key: "startDate", label: "Start Date", type: "date" },
                { key: "endDate", label: "End Date", type: "date" },
                { key: "forexId", label: "Forex" },
                { key: "forex2Id", label: "Forex 2" },
                { key: "price", label: "Price", type: "number" },
              ]} />
            </TabsContent>

            <TabsContent value="Address">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="address" addLabel="Add Address" fields={[
                { key: "addressType", label: "Type", type: "number" },
                { key: "line1", label: "Line 1" },
                { key: "line2", label: "Line 2" },
                { key: "phone", label: "Phone" },
                { key: "eMail", label: "Email" },
                { key: "isDefault", label: "Default", type: "checkbox" },
              ]} />
            </TabsContent>

            <TabsContent value="Contact">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="contacts" addLabel="Add Contact" fields={[
                { key: "name", label: "Name" },
                { key: "surname", label: "Surname" },
                { key: "position", label: "Position" },
                { key: "eMailAddress", label: "Email" },
                { key: "phone", label: "Phone" },
                { key: "gsmNo", label: "GSM" },
                { key: "isDefault", label: "Default", type: "checkbox" },
              ]} />
            </TabsContent>

            <TabsContent value="Explanation">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="explanations" addLabel="Add Explanation" fields={[
                { key: "explanationType", label: "Type", type: "number" },
                { key: "startDate", label: "Start Date", type: "date" },
                { key: "endDate", label: "End Date", type: "date" },
                { key: "explanationText", label: "Text" },
              ]} />
            </TabsContent>

            <TabsContent value="Guarantor">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="guarantors" addLabel="Add Guarantor" fields={[
                { key: "guarantorName", label: "Name" },
                { key: "idNo", label: "Id No" },
                { key: "gsmPhone", label: "GSM Phone" },
                { key: "explanation", label: "Explanation" },
              ]} />
            </TabsContent>

            <TabsContent value="Bank Info">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="bank-accounts" addLabel="Add Bank Account" fields={[
                { key: "accountNo", label: "Account No" },
                { key: "ibanNo", label: "IBAN" },
                { key: "forexId", label: "Forex" },
                { key: "isDefault", label: "Default", type: "checkbox" },
              ]} />
            </TabsContent>

            <TabsContent value="Inventory Attributes">
              <SatelliteGridTab accountId={accountId} readOnly={readOnly} tab="inventory-attributes" addLabel="Add Attribute Set" fields={[
                { key: "attributeSetId", label: "Attribute Set" },
              ]} />
            </TabsContent>

            <TabsContent value="Monthly">
              <TotalsTab accountId={accountId} mode="monthly" />
            </TabsContent>

            <TabsContent value="Forex Balance Breakdowns">
              <TotalsTab accountId={accountId} mode="forex-balance" />
            </TabsContent>
          </>
        )}
          </div>
        </div>
      </div>
      </Tabs>
    </div>
  );
}
