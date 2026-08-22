"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Landmark, Lock, BadgeCheck } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField as FieldText, FieldLabel } from "@/components/forms/form-field";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { FinancialReceiptLineGrid, type FinancialReceiptLineGridHandle } from "./_components/financial-receipt-line-grid";
import { CustomizedFieldsTab } from "./_components/customized-fields-tab";

// Financial Receipt — the editable detail screen behind Financial Receipt & Master Data's own
// New/View/Update actions, mirroring Inventory Receipt's own screen architecture (Workspace tab,
// Save-required gating, toolbar search/new/save) but built on the genuinely separate FI_Receipt /
// FI_ReceiptItem tables (see fi-receipt.service.ts's own header comment for why these are not
// the same entity as Inventory Receipt's IM_Receipt / IM_ReceiptItem). Reuses Cash/Cost Center
// (via the generic legacy-master-lookup.service.ts "cash"/"cost-center" keys) exactly as other
// screens already reuse Warehouse/Fabric — no new lookup UI.
const TABS = ["General", "Detail", "Attachments", "Customized Fields"];

const emptyForm: Record<string, any> = {
  receiptNo: "", receiptDate: new Date().toISOString().slice(0, 10),
  documentNo: "", explanation: "", specialCode: "",
  cashId: "", cashLabel: "", costCenterId: "", costCenterLabel: "",
  debit: "", credit: "",
};

const sanitizeRecord = (raw: Record<string, any>): Record<string, any> => {
  const merged: Record<string, any> = { ...emptyForm, ...raw };
  for (const key of Object.keys(emptyForm)) {
    if (merged[key] === null || merged[key] === undefined) merged[key] = emptyForm[key];
  }
  return merged;
};

function IdentitySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">General Info</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{children}</div>
    </div>
  );
}

export default function FinancialReceiptPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");
  const client = legacyErpApi.financialReceipts;

  const [codeInput, setCodeInput] = useState("");
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  const { clearDraft } = useDraftForm({ storageKey: "financialReceiptDraft", enabled: receiptId == null, form, setForm });
  const lineGridRef = useRef<FinancialReceiptLineGridHandle>(null);

  useEffect(() => {
    if (!receiptId) {
      client.previewNextReceiptNo()
        .then((r: any) => {
          set("receiptNo", r.receiptNo);
          lastSavedRef.current = { ...lastSavedRef.current, receiptNo: r.receiptNo };
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  const hydrate = async (r: any) => {
    const cash = r.cashId ? await legacyErpApi.lookupTable("cash").then((all: any) => (Array.isArray(all) ? all : []).find((c: any) => String(c.id) === String(r.cashId))).catch(() => null) : null;
    const costCenter = r.costCenterId ? await legacyErpApi.lookupTable("cost-center").then((all: any) => (Array.isArray(all) ? all : []).find((c: any) => String(c.id) === String(r.costCenterId))).catch(() => null) : null;
    return sanitizeRecord({
      ...r,
      receiptDate: r.receiptDate ? String(r.receiptDate).slice(0, 10) : emptyForm.receiptDate,
      cashLabel: cash ? (cash.code ? `${cash.code} — ${cash.name}` : cash.name) : "",
      costCenterLabel: costCenter ? (costCenter.code ? `${costCenter.code} — ${costCenter.name}` : costCenter.name) : "",
      debit: r.debit != null ? String(r.debit) : "",
      credit: r.credit != null ? String(r.credit) : "",
    });
  };

  useEffect(() => {
    if (!initialId) return;
    (async () => {
      try {
        const r: any = await client.get(Number(initialId));
        const f = await hydrate(r);
        setForm(f);
        lastSavedRef.current = f;
        setReceiptId(r.id);
        setCodeInput(r.receiptNo);
      } catch (e: any) {
        toast.error(e.message || "Could not load financial receipt");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await client.getByReceiptNo(codeInput.trim());
      const f = await hydrate(r);
      setForm(f);
      lastSavedRef.current = f;
      setReceiptId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error("No financial receipt found with that Receipt No");
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setReceiptId(null);
    setCodeInput("");
    setForm(emptyForm);
    lastSavedRef.current = emptyForm;
    setMode("create");
  };

  const save = async () => {
    setSaving(true);
    try {
      const dto: Record<string, any> = {
        receiptDate: form.receiptDate,
        documentNo: form.documentNo || undefined,
        explanation: form.explanation || undefined,
        specialCode: form.specialCode || undefined,
        cashId: form.cashId ? Number(form.cashId) : undefined,
        costCenterId: form.costCenterId ? Number(form.costCenterId) : undefined,
        debit: form.debit === "" ? undefined : Number(form.debit),
        credit: form.credit === "" ? undefined : Number(form.credit),
      };
      if (!receiptId) dto.receiptNo = form.receiptNo?.trim() || undefined;
      if (receiptId) {
        const r: any = await client.update(receiptId, dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          cashLabel: form.cashLabel, costCenterLabel: form.costCenterLabel,
          debit: r.debit != null ? String(r.debit) : "", credit: r.credit != null ? String(r.credit) : "",
        });
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await client.create(dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          cashLabel: form.cashLabel, costCenterLabel: form.costCenterLabel,
          debit: r.debit != null ? String(r.debit) : "", credit: r.credit != null ? String(r.credit) : "",
        });
        setForm(f);
        lastSavedRef.current = f;
        setReceiptId(r.id);
        setCodeInput(r.receiptNo);
        await lineGridRef.current?.commitDrafts(r.id);
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

  const saveRequired = (label: string) => (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>Save required</EmptyTitle>
        <EmptyDescription>Save the financial receipt first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  const statusLabel = form.isApproved ? "Approved" : "Unapproved";
  const titleText = receiptId ? `Financial Receipt [${statusLabel}] - ${form.receiptNo}` : "New Financial Receipt";

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4 lg:p-6">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: "Financial Receipts", href: "/dashboard/legacy-erp/financial-receipt-master-data" },
        ...(receiptId ? [{ label: form.receiptNo }] : []),
      ]} />

      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Landmark className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight">
              {titleText}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              {receiptId && (
                <Badge variant={form.isApproved ? "default" : "secondary"} className="h-5 text-[11px] font-normal">
                  {statusLabel}
                </Badge>
              )}
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
              placeholder="Find by Receipt No..."
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

          <div className="p-4">
            <TabsContent value="General" className="space-y-3">
              <fieldset disabled={readOnly} className="contents">
                <IdentitySection>
                  <fieldset disabled={!!receiptId} className="contents">
                    <div className="space-y-2">
                      <FieldLabel>Receipt No</FieldLabel>
                      <InputGroup className="h-9">
                        <InputGroupInput
                          value={form.receiptNo ?? ""}
                          onChange={(e) => set("receiptNo", e.target.value)}
                          className="text-sm"
                        />
                        <InputGroupAddon align="inline-end">
                          <Button
                            type="button" variant="ghost" size="icon" className="h-6 w-6"
                            title="Find existing receipt"
                            onClick={() => { setCodeInput(form.receiptNo ?? ""); search(); }}
                            disabled={searching}
                          >
                            <Search className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  </fieldset>
                  <FieldText label="Receipt Date" type="date" value={form.receiptDate} onChange={(v) => set("receiptDate", v)} />
                  <FieldText label="Document" value={form.documentNo} onChange={(v) => set("documentNo", v)} />
                  <FieldText label="Explanation" value={form.explanation} onChange={(v) => set("explanation", v)} span="wide" />
                  <FieldText label="Special Code" value={form.specialCode} onChange={(v) => set("specialCode", v)} />
                  <FieldText label="Debit" type="number" value={form.debit} onChange={(v) => set("debit", v)} />
                  <FieldText label="Credit" type="number" value={form.credit} onChange={(v) => set("credit", v)} />
                </IdentitySection>

                <FormSection title="Cash & Cost Center">
                  <MasterAutocompleteField
                    label="Cash"
                    masterKey="cash"
                    displayValue={form.cashLabel ?? ""}
                    onSelect={(o) => setForm((p) => ({ ...p, cashId: String(o.id), cashLabel: o.code ? `${o.code} — ${o.name}` : o.name }))}
                    onClear={() => setForm((p) => ({ ...p, cashId: "", cashLabel: "" }))}
                  />
                  <MasterAutocompleteField
                    label="Cost Center"
                    masterKey="cost-center"
                    displayValue={form.costCenterLabel ?? ""}
                    onSelect={(o) => setForm((p) => ({ ...p, costCenterId: String(o.id), costCenterLabel: o.code ? `${o.code} — ${o.name}` : o.name }))}
                    onClear={() => setForm((p) => ({ ...p, costCenterId: "", costCenterLabel: "" }))}
                  />
                </FormSection>
              </fieldset>

              {!receiptId && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Detail Lines</h3>
                  </div>
                  <FinancialReceiptLineGrid ref={lineGridRef} fiReceiptId={receiptId} readOnly={readOnly} api={client} />
                </div>
              )}
            </TabsContent>

            {!receiptId ? (
              ["Detail", "Attachments", "Customized Fields"].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="Detail">
                  <FinancialReceiptLineGrid ref={lineGridRef} fiReceiptId={receiptId} readOnly={readOnly} api={client} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={receiptId} readOnly={readOnly} api={client} />
                </TabsContent>

                <TabsContent value="Customized Fields">
                  <CustomizedFieldsTab itemId={String(receiptId)} readOnly={readOnly} />
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
