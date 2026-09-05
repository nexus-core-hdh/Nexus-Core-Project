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
import { Search, Save, FilePlus2, FileSignature, Lock, BadgeCheck } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceTabTitle } from "@/hooks/use-workspace-tab-title";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField as FieldText } from "@/components/forms/form-field";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { ContractLineGrid, type ContractLineGridHandle } from "@/components/legacy-erp/contract-line-grid";
import { getContractTypeConfig } from "@/lib/legacy-erp/contract-types";

// "00-Purchase Contract" / "00-Sale Contract" — same generic-receipt-type architecture as
// inventory-receipts/page.tsx: ONE page, parameterized by ?receiptType=, resolving to whichever
// of the two contract kinds the config maps it to. Built on the pre-existing SM_Contract/
// SM_ContractItem/SM_ContractAttachment tables (see contract.service.ts's own comment). Reuses
// Current Account (FI_Account) and Warehouse exactly as Purchase Order already does — no new
// lookup UI for either. Tabs are General (header + line grid, including the extended per-line
// fields Purchase Order keeps on a separate "Detail" tab — consolidated here since this table
// has fewer of them), Attachments, Certificates — mirroring Purchase Order's own screen
// structure; its "Explanation" tab has no equivalent here (no SM_ContractExplanation table
// exists in the migrated schema, so it isn't replicated rather than inventing one).
const TABS = ["General", "Attachments", "Certificates"];
const CURRENT_ACCOUNTS_LIST_PATH = "/dashboard/legacy-erp/current-accounts-list";

const emptyForm: Record<string, any> = {
  receiptNo: "", receiptDate: new Date().toISOString().slice(0, 10), documentNo: "",
  startDate: "", endDate: "",
  currentAccountId: "", currentAccountLabel: "", warehouseId: "", warehouseLabel: "",
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
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">General Info</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
    </div>
  );
}

export default function ContractPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");
  const receiptType = Number(searchParams.get("receiptType")) || 1;
  const cfg = getContractTypeConfig(receiptType);
  const client = legacyErpApi.contracts(receiptType);

  const [codeInput, setCodeInput] = useState("");
  const [contractId, setContractId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  // Namespaced by receiptType (contract type) — a New Purchase Contract draft must never
  // surface when starting a New record of a different contract type in this same shared screen.
  const { clearDraft } = useDraftForm({ storageKey: `contractDraft_${receiptType}`, enabled: contractId == null, form, setForm });
  const lineGridRef = useRef<ContractLineGridHandle>(null);

  useEffect(() => {
    if (!contractId) {
      client.previewNextReceiptNo()
        .then((r: any) => {
          set("receiptNo", r.receiptNo);
          lastSavedRef.current = { ...lastSavedRef.current, receiptNo: r.receiptNo };
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, receiptType]);

  const hydrate = async (r: any) => {
    const account = r.currentAccountId ? await legacyErpApi.accounts.get(r.currentAccountId).catch(() => null) : null;
    const warehouse = r.warehouseId ? await legacyErpApi.warehouses.get(r.warehouseId).catch(() => null) : null;
    return sanitizeRecord({
      ...r,
      receiptDate: r.receiptDate ? String(r.receiptDate).slice(0, 10) : emptyForm.receiptDate,
      startDate: r.startDate ? String(r.startDate).slice(0, 10) : "",
      endDate: r.endDate ? String(r.endDate).slice(0, 10) : "",
      currentAccountLabel: account ? `${(account as any).code} — ${(account as any).name}` : "",
      warehouseLabel: warehouse ? (warehouse as any).warehouseName : "",
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
        setContractId(r.id);
        setCodeInput(r.receiptNo);
      } catch (e: any) {
        toast.error(e.message || `Could not load ${cfg.label.toLowerCase()}`);
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
      setContractId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error(`No ${cfg.label.toLowerCase()} found with that Receipt No`);
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setContractId(null);
    setCodeInput("");
    setForm(emptyForm);
    lastSavedRef.current = emptyForm;
    setMode("create");
  };

  const save = async () => {
    if (!form.currentAccountId) return toast.error("Current Account is required");
    if (!form.warehouseId) return toast.error("Warehouse is required");
    setSaving(true);
    try {
      const dto: Record<string, any> = {
        receiptDate: form.receiptDate, documentNo: form.documentNo || undefined,
        startDate: form.startDate || undefined, endDate: form.endDate || undefined,
        currentAccountId: Number(form.currentAccountId), warehouseId: Number(form.warehouseId),
      };
      if (!contractId) dto.receiptNo = form.receiptNo?.trim() || undefined;
      if (contractId) {
        const r: any = await client.update(contractId, dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          startDate: r.startDate ? String(r.startDate).slice(0, 10) : "", endDate: r.endDate ? String(r.endDate).slice(0, 10) : "",
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await client.create(dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          startDate: r.startDate ? String(r.startDate).slice(0, 10) : "", endDate: r.endDate ? String(r.endDate).slice(0, 10) : "",
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        setContractId(r.id);
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
  // Query-driven screen (receiptType selects the contract type/cfg.label at runtime, e.g. "Sales
  // Contract") — the static menu registry only knows the generic "Contracts" entry, so this needs
  // the same full explicit-title override inventory-receipts/page.tsx already uses for the same
  // reason, not the generic record-label composition.
  useWorkspaceTabTitle(contractId ? `${cfg.label} [${form.receiptNo}]` : `New ${cfg.label}`);

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: `${cfg.label}s`, href: "/dashboard/legacy-erp/contracts-list" },
        ...(contractId ? [{ label: form.receiptNo }] : []),
      ]} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <FileSignature className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {contractId ? `${cfg.label} ${form.receiptNo}` : `New ${cfg.label}`}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{cfg.label}</p>
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

          <div className="p-6">
            <TabsContent value="General" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <IdentitySection>
                  <fieldset disabled={!!contractId} className="contents">
                    <FieldText label="Contract No" value={form.receiptNo} onChange={(v) => set("receiptNo", v)} span="normal" />
                  </fieldset>
                  <FieldText label="Contract Date" type="date" value={form.receiptDate} onChange={(v) => set("receiptDate", v)} />
                  <FieldText label="Document No" value={form.documentNo} onChange={(v) => set("documentNo", v)} />
                  <FieldText label="Start Date" type="date" value={form.startDate} onChange={(v) => set("startDate", v)} />
                  <FieldText label="End Date" type="date" value={form.endDate} onChange={(v) => set("endDate", v)} />
                </IdentitySection>

                <FormSection title="Current Account & Warehouse">
                  <MasterAutocompleteField
                    label="Current Account"
                    masterKey="currentAccount"
                    displayValue={form.currentAccountLabel ?? ""}
                    fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>}
                    lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                    onSelect={(o) => setForm((p) => ({ ...p, currentAccountId: String(o.id), currentAccountLabel: `${o.code} — ${o.name}` }))}
                    onClear={() => setForm((p) => ({ ...p, currentAccountId: "", currentAccountLabel: "" }))}
                  />
                  <MasterAutocompleteField
                    label="Warehouse"
                    masterKey="warehouse"
                    displayValue={form.warehouseLabel ?? ""}
                    onSelect={(o) => setForm((p) => ({ ...p, warehouseId: String(o.id), warehouseLabel: o.name }))}
                    onClear={() => setForm((p) => ({ ...p, warehouseId: "", warehouseLabel: "" }))}
                  />
                </FormSection>
              </fieldset>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Detail Lines</h3>
                </div>
                <ContractLineGrid ref={lineGridRef} contractId={contractId} readOnly={readOnly} api={client} />
              </div>
            </TabsContent>

            {!contractId ? (
              ["Attachments", "Certificates"].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><Lock /></EmptyMedia>
                      <EmptyTitle>Save required</EmptyTitle>
                      <EmptyDescription>Save the {cfg.label.toLowerCase()} first to manage {t.toLowerCase()}.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={contractId} readOnly={readOnly} api={client} />
                </TabsContent>

                <TabsContent value="Certificates" className="rounded-lg border border-dashed bg-muted/20">
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><BadgeCheck /></EmptyMedia>
                      <EmptyTitle>Certificates not yet available</EmptyTitle>
                      <EmptyDescription>No certificate master exists yet in the migrated schema — this tab is a placeholder until that module is built.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
