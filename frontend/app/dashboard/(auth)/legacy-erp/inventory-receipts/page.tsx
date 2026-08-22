"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { legacyErpApi, approvalConfigApi } from "@/lib/nexuscore-api";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Truck, Lock, BadgeCheck, ClipboardList, XCircle, ShieldAlert } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField as FieldText, FieldLabel } from "@/components/forms/form-field";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { InventoryReceiptLineGrid, type InventoryReceiptLineGridHandle, type ImportedPendingLine } from "./_components/inventory-receipt-line-grid";
import { PendingOrdersDialog } from "./_components/pending-orders-dialog";
import { CustomizedFieldsTab } from "./_components/customized-fields-tab";
import { getReceiptTypeConfig } from "@/lib/legacy-erp/receipt-types";

// Inventory Receipt — a full ERP transaction screen mirroring the established Purchase Order
// screen architecture (Workspace tab, Save-required gating, toolbar search/new/save), but
// built on the genuinely separate IM_Receipt / IM_ReceiptItem tables (see
// inventory-receipt.service.ts's own header comment for why these are not the same entity as
// Purchase Order's IM_OrderReceipt / IM_OrderReceiptItem). Reuses Current Account (FI_Account
// via legacyErpApi.accounts) and Warehouse (generic "warehouse" master lookup) exactly as
// Purchase Order already does — no new lookup UI for either.
const TABS = ["General", "Detail", "Attachments", "Certificates", "Customized Fields"];
const CURRENT_ACCOUNTS_LIST_PATH = "/dashboard/legacy-erp/current-accounts-list";
// General Settings -> Approval Configuration screenKey for this screen — must match
// inventory-receipt.service.ts's own screenKeyFor(2) exactly (both derive from this screen's
// real MenuItem.href, the existing screen/module registry).
const APPROVAL_SCREEN_KEY = "/dashboard/legacy-erp/inventory-receipts-list";

const emptyForm: Record<string, any> = {
  receiptNo: "", receiptDate: new Date().toISOString().slice(0, 10), shipmentDate: "",
  documentNo: "", plateNumber: "", driverName: "",
  currentAccountId: "", currentAccountLabel: "", inWarehouseId: "", warehouseLabel: "",
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

export default function InventoryReceiptPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");
  // Receipt Screen Replication — additive: absent/invalid/"2" all resolve to Purchase Receipt's
  // existing behavior exactly as before. Only an explicit ?receiptType=<other> switches the client
  // to the generic route (receipt-type.controller.ts) and the title/breadcrumb text.
  const receiptType = Number(searchParams.get("receiptType")) || 2;
  const cfg = getReceiptTypeConfig(receiptType);
  const client = receiptType === 2 ? legacyErpApi.inventoryReceipts : legacyErpApi.receipts(receiptType);

  const [codeInput, setCodeInput] = useState("");
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  // Namespaced by receiptType — this same screen serves Purchase Receipt, Purchase Return, and
  // every other "Receipt Screen Replication" type, so each type's New-record draft stays isolated.
  const { clearDraft } = useDraftForm({ storageKey: `inventoryReceiptDraft_${receiptType}`, enabled: receiptId == null, form, setForm });
  const lineGridRef = useRef<InventoryReceiptLineGridHandle>(null);
  // Pending Orders (Current Account -> right-click) — Purchase Order only relates to the
  // genuine Purchase Receipt (ReceiptType=2), not the other 16 Receipt Screen Replication types
  // this same page also serves.
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(false);
  const [alreadyImportedIds, setAlreadyImportedIds] = useState<Set<number>>(new Set());
  const openPendingOrders = () => {
    setAlreadyImportedIds(new Set(lineGridRef.current?.getImportedOrderReceiptItemIds() ?? []));
    setPendingOrdersOpen(true);
  };
  const importPendingLines = (lines: ImportedPendingLine[]) => lineGridRef.current?.importLines(lines);

  // General Settings -> Approval Configuration. Only wired for the genuine Purchase Receipt
  // (receiptType===2) — the other 16 Receipt Screen Replication types this same page also
  // serves aren't integrated with the framework yet, so nothing below runs for them.
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<{ status: string; remarks?: string | null } | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");

  useEffect(() => {
    if (receiptType !== 2) return;
    approvalConfigApi.list()
      .then((r: any) => {
        const found = Array.isArray(r) ? r.find((c: any) => c.screenKey === APPROVAL_SCREEN_KEY) : null;
        setApprovalRequired(!!found?.approvalRequired);
      })
      .catch(() => {});
  }, [receiptType]);

  const refreshApprovalStatus = async (id: number) => {
    if (receiptType !== 2) return;
    try {
      const s: any = await legacyErpApi.inventoryReceipts.getApprovalStatus(id);
      setApprovalStatus(s ?? null);
    } catch {
      setApprovalStatus(null);
    }
  };

  useEffect(() => {
    if (receiptId) refreshApprovalStatus(receiptId); else setApprovalStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  const runApproveReceipt = async () => {
    if (!receiptId) return;
    setApproving(true);
    try {
      const r: any = await legacyErpApi.inventoryReceipts.approve(receiptId);
      setForm((p) => ({ ...p, isApproved: r.isApproved }));
      toast.success("Approved");
      await refreshApprovalStatus(receiptId);
    } catch (e: any) {
      toast.error(e.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const runRejectReceipt = async () => {
    if (!receiptId) return;
    if (!rejectRemarks.trim()) return toast.error("A rejection reason is required.");
    setApproving(true);
    try {
      await legacyErpApi.inventoryReceipts.reject(receiptId, rejectRemarks.trim());
      toast.success("Rejected");
      setRejectOpen(false);
      setRejectRemarks("");
      await refreshApprovalStatus(receiptId);
    } catch (e: any) {
      toast.error(e.message || "Rejection failed");
    } finally {
      setApproving(false);
    }
  };

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
    const account = r.currentAccountId ? await legacyErpApi.accounts.get(r.currentAccountId).catch(() => null) : null;
    const warehouse = r.inWarehouseId ? await legacyErpApi.warehouses.get(r.inWarehouseId).catch(() => null) : null;
    return sanitizeRecord({
      ...r,
      receiptDate: r.receiptDate ? String(r.receiptDate).slice(0, 10) : emptyForm.receiptDate,
      shipmentDate: r.shipmentDate ? String(r.shipmentDate).slice(0, 10) : "",
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
        setReceiptId(r.id);
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
      setReceiptId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error(`No ${cfg.label.toLowerCase()} found with that Receipt No`);
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
    if (!form.currentAccountId) return toast.error("Current Account is required");
    if (!form.inWarehouseId) return toast.error("Warehouse is required");
    setSaving(true);
    try {
      const dto: Record<string, any> = {
        receiptDate: form.receiptDate, shipmentDate: form.shipmentDate || undefined,
        documentNo: form.documentNo || undefined, plateNumber: form.plateNumber || undefined,
        driverName: form.driverName || undefined,
        currentAccountId: Number(form.currentAccountId), inWarehouseId: Number(form.inWarehouseId),
      };
      if (!receiptId) dto.receiptNo = form.receiptNo?.trim() || undefined;
      let savedId = receiptId;
      if (receiptId) {
        const r: any = await client.update(receiptId, dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          shipmentDate: r.shipmentDate ? String(r.shipmentDate).slice(0, 10) : "",
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await client.create(dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          shipmentDate: r.shipmentDate ? String(r.shipmentDate).slice(0, 10) : "",
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        setReceiptId(r.id);
        setCodeInput(r.receiptNo);
        await lineGridRef.current?.commitDrafts(r.id);
        savedId = r.id;
        clearDraft();
        toast.success("Created");
      }
      // General Settings -> Approval Configuration — Create/Modify -> Submit -> Pending
      // Approval. A no-op call chain (nothing below runs) whenever approval isn't required for
      // this screen, so Save's own behavior is otherwise completely unchanged.
      if (approvalRequired && receiptType === 2 && savedId) {
        await legacyErpApi.inventoryReceipts.submitForApproval(savedId);
        await refreshApprovalStatus(savedId);
        toast.message("Approval Required", {
          description: "This transaction cannot be completed until it has been approved by an authorized user.",
        });
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
        <EmptyDescription>Save the {cfg.label.toLowerCase()} first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  // Legacy tab-title convention (matches the reference screenshot's own
  // "Inventory Receipt [2-Purchase Receipt] [Unapproved] - 00000519"): [ReceiptType label] now
  // reflects whichever of the 18 receipt types this ?receiptType= resolves to (see
  // receipt-types.ts / inventory-receipt.service.ts's RECEIPT_TYPE comment for the base case),
  // [Status] reads the existing, already-reused IsApproved column — no new column, no new
  // endpoint.
  const statusLabel = form.isApproved ? "Approved" : "Unapproved";
  const titleText = receiptId ? `${cfg.label} [${receiptType}-${cfg.label}] [${statusLabel}] - ${form.receiptNo}` : `New ${cfg.label}`;

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4 lg:p-6">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: `${cfg.label}s`, href: "/dashboard/legacy-erp/inventory-receipts-list" },
        ...(receiptId ? [{ label: form.receiptNo }] : []),
      ]} />

      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight">
              {titleText}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              {/* Do not show approval controls when Approval Required = No — the plain existing
                  Approved/Unapproved badge stays exactly as before in that case. */}
              {receiptId && !approvalRequired && (
                <Badge variant={form.isApproved ? "default" : "secondary"} className="h-5 text-[11px] font-normal">
                  {statusLabel}
                </Badge>
              )}
              {receiptId && approvalRequired && (
                <Badge
                  variant={approvalStatus?.status === "approved" ? "default" : approvalStatus?.status === "rejected" ? "destructive" : "secondary"}
                  className="h-5 text-[11px] font-normal"
                >
                  {approvalStatus?.status === "pending_approval" ? "Pending Approval"
                    : approvalStatus?.status === "approved" ? "Approved"
                    : approvalStatus?.status === "rejected" ? "Rejected"
                    : approvalStatus?.status === "completed" ? "Completed"
                    : "Draft"}
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
          {/* Reuses the same authorized-approver pattern as receipt-master-data/page.tsx's row
              action — backend (approval:approve/reject permission + pending-state + self-
              approval check) is authoritative; an unauthorized click just surfaces a toast. */}
          {approvalRequired && approvalStatus?.status === "pending_approval" && (
            <>
              <div className="hidden h-6 w-px bg-border sm:block" />
              <Button size="sm" onClick={runApproveReceipt} disabled={approving}>
                <BadgeCheck className="h-3.5 w-3.5 mr-2" />Approve
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setRejectRemarks(""); setRejectOpen(true); }} disabled={approving}>
                <XCircle className="h-3.5 w-3.5 mr-2" />Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {approvalRequired && approvalStatus?.status === "pending_approval" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Approval Required</p>
            <p className="text-amber-700/90 dark:text-amber-400/90">This transaction cannot be completed until it has been approved by an authorized user.</p>
          </div>
        </div>
      )}

      {approvalRequired && approvalStatus?.status === "rejected" && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Rejected</p>
            {approvalStatus.remarks && <p className="text-destructive/90">{approvalStatus.remarks}</p>}
            <p className="mt-1 text-destructive/80">Make corrections and Save again to resubmit for approval.</p>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
          <ScrollableTabsList tabs={TABS} activeTab={activeTab} />

          <div className="p-4">
            <TabsContent value="General" className="space-y-3">
              <fieldset disabled={readOnly} className="contents">
                <IdentitySection>
                  <fieldset disabled={!!receiptId} className="contents">
                    {/* Inline search/lookup affordance directly on the field, matching the
                        legacy screen — reuses the exact same getByReceiptNo() call the
                        toolbar's own search box already calls, just triggered from here too.
                        Disabled once the receipt exists (via the surrounding fieldset), same
                        as the field itself — an existing record's number is immutable. */}
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
                  <FieldText label="Shipment Date" type="date" value={form.shipmentDate} onChange={(v) => set("shipmentDate", v)} />
                  <FieldText label="Document" value={form.documentNo} onChange={(v) => set("documentNo", v)} />
                  <FieldText label="Vehicle No" value={form.plateNumber} onChange={(v) => set("plateNumber", v)} />
                  <FieldText label="Driver Name" value={form.driverName} onChange={(v) => set("driverName", v)} />
                </IdentitySection>

                <FormSection title="Current Account & Warehouse">
                  {receiptType === 2 ? (
                    <RowContextMenu actions={[
                      { key: "pending-orders", label: "Pending Orders", icon: ClipboardList, onSelect: openPendingOrders, disabled: !form.currentAccountId } as RowAction,
                    ]}>
                      <div>
                        <MasterAutocompleteField
                          label="Current Account"
                          masterKey="currentAccount"
                          displayValue={form.currentAccountLabel ?? ""}
                          fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>}
                          lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                          onSelect={(o) => setForm((p) => ({ ...p, currentAccountId: String(o.id), currentAccountLabel: `${o.code} — ${o.name}` }))}
                          onClear={() => setForm((p) => ({ ...p, currentAccountId: "", currentAccountLabel: "" }))}
                        />
                      </div>
                    </RowContextMenu>
                  ) : (
                    <MasterAutocompleteField
                      label="Current Account"
                      masterKey="currentAccount"
                      displayValue={form.currentAccountLabel ?? ""}
                      fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>}
                      lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                      onSelect={(o) => setForm((p) => ({ ...p, currentAccountId: String(o.id), currentAccountLabel: `${o.code} — ${o.name}` }))}
                      onClear={() => setForm((p) => ({ ...p, currentAccountId: "", currentAccountLabel: "" }))}
                    />
                  )}
                  <MasterAutocompleteField
                    label="Warehouse"
                    masterKey="warehouse"
                    displayValue={form.warehouseLabel ?? ""}
                    onSelect={(o) => setForm((p) => ({ ...p, inWarehouseId: String(o.id), warehouseLabel: o.name }))}
                    onClear={() => setForm((p) => ({ ...p, inWarehouseId: "", warehouseLabel: "" }))}
                  />
                </FormSection>
              </fieldset>

              {/* On Create, the grid still needs to be reachable before the header has an id
                  (so the user can type lines before the first Save) — it renders here as
                  drafts, then the Detail tab takes over as the single live view once the
                  receipt exists. Rendering the SAME grid instance in two tabs at once would
                  desync two independent copies of the same line list, so General only ever
                  shows it pre-save; Detail owns it afterward. */}
              {!receiptId && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-1 shrink-0 rounded-full bg-primary/60" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Detail Lines</h3>
                  </div>
                  <InventoryReceiptLineGrid ref={lineGridRef} inventoryReceiptId={receiptId} readOnly={readOnly} api={client} />
                </div>
              )}
            </TabsContent>

            {!receiptId ? (
              ["Detail", "Attachments", "Certificates", "Customized Fields"].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="Detail">
                  <InventoryReceiptLineGrid ref={lineGridRef} inventoryReceiptId={receiptId} readOnly={readOnly} api={client} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={receiptId} readOnly={readOnly} api={client} />
                </TabsContent>

                <TabsContent value="Certificates" className="rounded-lg border border-dashed bg-muted/20">
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><BadgeCheck /></EmptyMedia>
                      <EmptyTitle>Certificates not yet available</EmptyTitle>
                      <EmptyDescription>No direct receipt-to-certificate relationship exists yet in the migrated schema (certificate linkage is inverted, via the attachment record) — this tab is a placeholder until that module is built.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TabsContent>

                <TabsContent value="Customized Fields">
                  <CustomizedFieldsTab itemId={String(receiptId)} readOnly={readOnly} />
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>

      {receiptType === 2 && (
        <PendingOrdersDialog
          open={pendingOrdersOpen}
          onOpenChange={setPendingOrdersOpen}
          currentAccountId={form.currentAccountId ? Number(form.currentAccountId) : null}
          alreadyImportedIds={alreadyImportedIds}
          onConfirm={importPendingLines}
        />
      )}

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {cfg.label}</AlertDialogTitle>
            <AlertDialogDescription>A rejection reason is required and will be shown to the original submitter.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectRemarks}
            onChange={(e) => setRejectRemarks(e.target.value)}
            placeholder="Reason for rejection..."
            className="min-h-24"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={runRejectReceipt} disabled={approving || !rejectRemarks.trim()}>
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
