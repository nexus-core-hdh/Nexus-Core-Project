"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi, approvalConfigApi } from "@/lib/nexuscore-api";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Factory, Lock, Trash2, Plus, BadgeCheck, XCircle, ShieldAlert } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField as FieldText } from "@/components/forms/form-field";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { PurchaseOrderLineGrid, type PurchaseOrderLineGridHandle } from "@/components/legacy-erp/purchase-order-line-grid";
import { RowContextMenu, RowActionsMenu } from "@/components/legacy-erp/row-actions";
import { useUniversalActions, type RelatedReceiptRef } from "@/hooks/legacy-erp/use-universal-actions";
import { useUniversalActionShortcuts } from "@/hooks/legacy-erp/use-universal-action-shortcuts";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";

// Subcontract Order (ReceiptType=3) — Order Screen Replication's second entry, reusing
// purchase-order.service.ts (now parameterized by receiptType/numberPrefix — see that file's own
// comment) through the generic order-type.controller.ts route instead of a second service. Same
// architecture, same shared components (PurchaseOrderLineGrid, MasterAutocompleteField,
// useUniversalActions, LegacyErpBreadcrumb, useDraftForm/useWorkspaceDirty) as
// purchase-orders/page.tsx — only labels/routes/API client differ. Current Account here plays the
// same "Subcontractor" role IM_OrderReceiptItem.SubcontractorId already has a real FK for
// (-> FI_Account, confirmed live) — kept labeled "Current Account" for consistency with every
// other screen in this module, exactly like Purchase Order's own vendor field.
const client = legacyErpApi.orders(3);
const TABS = ["General", "Detail", "Explanation", "Attachments", "Certificates"];
const CURRENT_ACCOUNTS_LIST_PATH = "/dashboard/legacy-erp/current-accounts-list";
// General Settings -> Approval Configuration screenKey for this screen — must match
// purchase-order.service.ts's own screenKeyFor(3) exactly.
const APPROVAL_SCREEN_KEY = "/dashboard/legacy-erp/subcontract-orders-list";

const emptyForm: Record<string, any> = {
  receiptNo: "", receiptDate: new Date().toISOString().slice(0, 10), documentNo: "",
  currentAccountId: "", currentAccountLabel: "", warehouseId: "",
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

export default function SubcontractOrderPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");

  const [codeInput, setCodeInput] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  const lineGridRef = useRef<PurchaseOrderLineGridHandle>(null);

  // New-record draft preservation — see use-draft-form.ts. Active only while this screen has no
  // id yet (a genuine New Subcontract Order flow); an Edit/View of an existing record never
  // restores or overwrites it, so unrelated records can't leak into each other's draft.
  const { clearDraft } = useDraftForm({ storageKey: "subcontractOrderDraft", enabled: orderId == null, form, setForm });

  // General Settings -> Approval Configuration — same integration shape as
  // purchase-orders/page.tsx's own.
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<{ status: string; remarks?: string | null } | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");

  useEffect(() => {
    approvalConfigApi.list()
      .then((r: any) => {
        const found = Array.isArray(r) ? r.find((c: any) => c.screenKey === APPROVAL_SCREEN_KEY) : null;
        setApprovalRequired(!!found?.approvalRequired);
      })
      .catch(() => {});
  }, []);

  const refreshApprovalStatus = async (id: number) => {
    try {
      const s: any = await client.getApprovalStatus(id);
      setApprovalStatus(s ?? null);
    } catch {
      setApprovalStatus(null);
    }
  };

  useEffect(() => {
    if (orderId) refreshApprovalStatus(orderId); else setApprovalStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const runApproveOrder = async () => {
    if (!orderId) return;
    setApproving(true);
    try {
      const r: any = await client.approve(orderId);
      setForm((p) => ({ ...p, isApproved: r.isApproved }));
      toast.success("Approved");
      await refreshApprovalStatus(orderId);
    } catch (e: any) {
      toast.error(e.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const runRejectOrder = async () => {
    if (!orderId) return;
    if (!rejectRemarks.trim()) return toast.error("A rejection reason is required.");
    setApproving(true);
    try {
      await client.reject(orderId, rejectRemarks.trim());
      toast.success("Rejected");
      setRejectOpen(false);
      setRejectRemarks("");
      await refreshApprovalStatus(orderId);
    } catch (e: any) {
      toast.error(e.message || "Rejection failed");
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    if (!orderId) {
      // A clean, business-friendly default ("SC-1", "SC-2", ...) pre-fills the field, but it
      // stays a plain editable text input (see the JSX below) — the user can type their own
      // number instead; an empty field on Save just falls back to this same auto-numbering
      // server-side (purchase-order.service.ts's create()).
      client.previewNextReceiptNo()
        .then((r: any) => {
          set("receiptNo", r.receiptNo);
          lastSavedRef.current = { ...lastSavedRef.current, receiptNo: r.receiptNo };
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (!initialId) return;
    (async () => {
      try {
        const r: any = await client.get(Number(initialId));
        const account = r.currentAccountId ? await legacyErpApi.accounts.get(r.currentAccountId).catch(() => null) : null;
        const warehouse = r.warehouseId ? await legacyErpApi.warehouses.get(r.warehouseId).catch(() => null) : null;
        const f = sanitizeRecord({
          ...r,
          receiptDate: r.receiptDate ? String(r.receiptDate).slice(0, 10) : emptyForm.receiptDate,
          currentAccountLabel: account ? `${(account as any).code} — ${(account as any).name}` : "",
          warehouseLabel: warehouse ? (warehouse as any).warehouseName : "",
        });
        setForm(f);
        lastSavedRef.current = f;
        setOrderId(r.id);
        setCodeInput(r.receiptNo);
      } catch (e: any) {
        toast.error(e.message || "Could not load subcontract order");
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
      const account = r.currentAccountId ? await legacyErpApi.accounts.get(r.currentAccountId).catch(() => null) : null;
      const warehouse = r.warehouseId ? await legacyErpApi.warehouses.get(r.warehouseId).catch(() => null) : null;
      const f = sanitizeRecord({
        ...r,
        receiptDate: r.receiptDate ? String(r.receiptDate).slice(0, 10) : emptyForm.receiptDate,
        currentAccountLabel: account ? `${(account as any).code} — ${(account as any).name}` : "",
        warehouseLabel: warehouse ? (warehouse as any).warehouseName : "",
      });
      setForm(f);
      lastSavedRef.current = f;
      setOrderId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error("No subcontract order found with that Receipt No");
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setOrderId(null);
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
      const dto: Record<string, any> = { receiptDate: form.receiptDate, documentNo: form.documentNo, currentAccountId: Number(form.currentAccountId), warehouseId: Number(form.warehouseId) };
      if (!orderId) dto.receiptNo = form.receiptNo?.trim() || undefined; // manual entry, else server auto-numbers
      let savedId: number | undefined;
      if (orderId) {
        const r: any = await client.update(orderId, dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        savedId = r.id;
        toast.success("Updated");
      } else {
        // Standard ERP transaction workflow: header first, then any lines the user already
        // typed while the record had no id yet (held as drafts in the grid's own state) are
        // bulk-persisted against the freshly-generated OrderReceiptId — one seamless Save from
        // the user's perspective, never two separate actions.
        const r: any = await client.create(dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        setOrderId(r.id);
        setCodeInput(r.receiptNo);
        await lineGridRef.current?.commitDrafts(r.id);
        savedId = r.id;
        clearDraft();
        toast.success("Created");
      }
      // General Settings -> Approval Configuration — Create/Modify -> Submit -> Pending
      // Approval. A no-op call chain (nothing below runs) whenever approval isn't required for
      // this screen, so Save's own behavior is otherwise completely unchanged.
      if (approvalRequired && savedId) {
        await client.submitForApproval(savedId);
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

  // Universal Action Menu -> Return/related-receipt submenu — Outside Process Receive Receipt
  // (and any further return/connection receipts) tracing back to this order (see
  // purchase-order.service.ts's listRelatedReceipts() / ReceiptTraceabilityService — fully
  // generic by id already, no order-type awareness needed there: the family is built purely from
  // this order's own OrderReceiptId, so it can never surface an unrelated Purchase Receipt). Only
  // meaningful once saved. `relatedReceiptsLabel` below overrides useUniversalActions' own default
  // ("Return / Purchase Receipt", accurate for Purchase Order but not this screen).
  const [relatedReceipts, setRelatedReceipts] = useState<RelatedReceiptRef[]>([]);
  useEffect(() => {
    if (!orderId) { setRelatedReceipts([]); return; }
    client.getRelatedReceipts(orderId)
      .then((r: any) => setRelatedReceipts(Array.isArray(r) ? r : []))
      .catch(() => setRelatedReceipts([]));
  }, [orderId]);
  const openRelatedReceipt = (r: RelatedReceiptRef) => {
    navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?receiptType=${r.receiptType}&id=${r.id}&mode=view`);
  };

  // Universal Action Menu -> Delete — reuses the exact same API call/DeleteDependencyService
  // path as subcontract-orders-list/page.tsx's own row-menu Delete, just entered from the
  // detail screen instead of the list.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteOrder = async () => {
    if (!orderId) return;
    try {
      await client.delete(orderId);
      toast.success("Subcontract order deleted");
      setDeleteConfirmOpen(false);
      navigateOrOpenTab(router, "/dashboard/legacy-erp/subcontract-orders-list");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const universalActions = useUniversalActions({
    recordExists: !!orderId,
    isDirty, saving,
    onSave: save,
    approvalRequired, approvalStatus, approving,
    onApprove: runApproveOrder,
    onReject: () => { setRejectRemarks(""); setRejectOpen(true); },
    relatedReceipts,
    onOpenRelatedReceipt: openRelatedReceipt,
    relatedReceiptsLabel: "Return / Outside Process Receive Receipt",
    onDelete: orderId ? () => setDeleteConfirmOpen(true) : undefined,
  });
  useUniversalActionShortcuts(universalActions);

  const saveRequired = (label: string) => (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>Save required</EmptyTitle>
        <EmptyDescription>Save the subcontract order first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <RowContextMenu actions={universalActions}>
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: "Subcontract Orders", href: "/dashboard/legacy-erp/subcontract-orders-list" },
        ...(orderId ? [{ label: form.receiptNo }] : []),
      ]} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Factory className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {orderId ? `Subcontract Order ${form.receiptNo}` : "New Subcontract Order"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Subcontract Order</p>
              {orderId && approvalRequired && (
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
          {approvalRequired && approvalStatus?.status === "pending_approval" && (
            <>
              <div className="hidden h-6 w-px bg-border sm:block" />
              <Button size="sm" onClick={runApproveOrder} disabled={approving}>
                <BadgeCheck className="h-3.5 w-3.5 mr-2" />Approve
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setRejectRemarks(""); setRejectOpen(true); }} disabled={approving}>
                <XCircle className="h-3.5 w-3.5 mr-2" />Reject
              </Button>
            </>
          )}
          <div className="hidden h-6 w-px bg-border sm:block" />
          <RowActionsMenu actions={universalActions} />
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

          <div className="p-6">
            <TabsContent value="General" className="space-y-4">
              <fieldset disabled={readOnly} className="contents">
                <IdentitySection>
                  <fieldset disabled={!!orderId} className="contents">
                    <FieldText label="Subcontract Order No" value={form.receiptNo} onChange={(v) => set("receiptNo", v)} span="normal" />
                  </fieldset>
                  <FieldText label="Order Date" type="date" value={form.receiptDate} onChange={(v) => set("receiptDate", v)} />
                  <FieldText label="Document No" value={form.documentNo} onChange={(v) => set("documentNo", v)} />
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
                <PurchaseOrderLineGrid ref={lineGridRef} orderReceiptId={orderId} readOnly={readOnly} api={client} />
              </div>
            </TabsContent>

            {!orderId ? (
              ["Detail", "Explanation", "Attachments", "Certificates"].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="Detail">
                  <SubcontractOrderDetailTab orderReceiptId={orderId} readOnly={readOnly} />
                </TabsContent>

                <TabsContent value="Explanation">
                  <SubcontractOrderExplanationTab orderReceiptId={orderId} readOnly={readOnly} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={orderId} readOnly={readOnly} api={client} />
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

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Subcontract Order</AlertDialogTitle>
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
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={runRejectOrder} disabled={approving || !rejectRemarks.trim()}>
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subcontract Order</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this record?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={deleteOrder}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </RowContextMenu>
  );
}

// --- Detail tab: extended fields for whichever line the user picks from a small list -------
function SubcontractOrderDetailTab({ orderReceiptId, readOnly }: { orderReceiptId: number; readOnly?: boolean }) {
  const [lines, setLines] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r: any = await client.listItems(orderReceiptId);
    setLines(Array.isArray(r) ? r : []);
  };
  useEffect(() => { load(); }, [orderReceiptId]);

  const select = (line: any) => {
    setSelectedId(line.id);
    setForm({
      deliveryDate: line.deliveryDate ? String(line.deliveryDate).slice(0, 10) : "",
      customerOrderNo: line.customerOrderNo ?? "", partyNo: line.partyNo ?? "",
      explanation: line.explanation ?? "", specialCode: line.specialCode ?? "",
    });
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await client.updateItem(orderReceiptId, selectedId, form);
      toast.success("Line detail saved");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!lines.length) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lock /></EmptyMedia>
          <EmptyTitle>No lines yet</EmptyTitle>
          <EmptyDescription>Add a detail line on the General tab first.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
      <div className="rounded-lg border">
        {lines.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => select(l)}
            className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted ${selectedId === l.id ? "bg-primary/10 font-medium" : ""}`}
          >
            Line #{l.id}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">Select a line to edit its extended details.</p>
        ) : (
          <fieldset disabled={readOnly} className="contents">
            <FormSection title="Extended Line Detail">
              <FieldText label="Delivery Date" type="date" value={form.deliveryDate} onChange={(v: string) => setForm((p) => ({ ...p, deliveryDate: v }))} />
              <FieldText label="Customer Order No" value={form.customerOrderNo} onChange={(v) => setForm((p) => ({ ...p, customerOrderNo: v }))} />
              <FieldText label="Party No" value={form.partyNo} onChange={(v) => setForm((p) => ({ ...p, partyNo: v }))} />
              <FieldText label="Special Code" value={form.specialCode} onChange={(v) => setForm((p) => ({ ...p, specialCode: v }))} />
              <FieldText label="Explanation" value={form.explanation} onChange={(v) => setForm((p) => ({ ...p, explanation: v }))} span="wide" />
            </FormSection>
            {!readOnly && (
              <div className="flex justify-end">
                <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}</Button>
              </div>
            )}
          </fieldset>
        )}
      </div>
    </div>
  );
}

// --- Explanation tab: dated free-text notes (IM_OrderReceiptExplanation) -------------------
function SubcontractOrderExplanationTab({ orderReceiptId, readOnly }: { orderReceiptId: number; readOnly?: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await client.listExplanations(orderReceiptId);
      setRows(Array.isArray(r) ? r : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [orderReceiptId]);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await client.createExplanation(orderReceiptId, { explanationText: text.trim() });
      setText("");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await client.removeExplanation(orderReceiptId, id);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex items-start gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an explanation note..." className="min-h-[70px]" />
          <Button size="sm" onClick={add} disabled={saving || !text.trim()}><Plus className="h-3.5 w-3.5 mr-2" />Add</Button>
        </div>
      )}
      <div className="rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Date</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Explanation</TableHead>
              {!readOnly && <TableHead className="h-10 w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} className="py-4 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No explanations yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className="group">
                <TableCell className="py-3 text-muted-foreground">{r.explanationDate ? new Date(r.explanationDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="py-3">{r.explanationText}</TableCell>
                {!readOnly && (
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
