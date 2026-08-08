"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Search, Save, FilePlus2, ShoppingCart, Lock, ChevronRight, Trash2, Plus, BadgeCheck } from "lucide-react";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField as FieldText } from "@/components/forms/form-field";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { PurchaseOrderLineGrid, type PurchaseOrderLineGridHandle } from "@/components/legacy-erp/purchase-order-line-grid";

// Purchase Order — a full ERP transaction screen, same architecture as Current Account /
// Warehouse / Yarn Card / Fabric Card / Inventory Card (Workspace tab, Save-required gating
// on child tabs, toolbar search/new/save). Built on the existing IM_OrderReceipt /
// IM_OrderReceiptItem tables (ReceiptType=1 — see purchase-order.service.ts's own comment
// for why that's not a guess), reusing Current Account (FI_Account via legacyErpApi.accounts)
// and Warehouse (via the generic "warehouse" master lookup) exactly as they already work
// elsewhere — no new lookup UI for either.
const TABS = ["General", "Detail", "Explanation", "Attachments", "Certificates"];
const CURRENT_ACCOUNTS_LIST_PATH = "/dashboard/legacy-erp/current-accounts-list";

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

export default function PurchaseOrderPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");

  const [codeInput, setCodeInput] = useState("");
  const [poId, setPoId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");

  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  const lineGridRef = useRef<PurchaseOrderLineGridHandle>(null);

  useEffect(() => {
    if (!poId) {
      // A clean, business-friendly default ("PO-1", "PO-2", ...) pre-fills the field, but it
      // stays a plain editable text input (see the JSX below) — the user can type their own
      // number instead; an empty field on Save just falls back to this same auto-numbering
      // server-side (purchase-order.service.ts's create()).
      legacyErpApi.purchaseOrders.previewNextReceiptNo()
        .then((r: any) => {
          set("receiptNo", r.receiptNo);
          // Also baseline lastSavedRef with the same value — otherwise a brand-new, untouched
          // tab would immediately show as "dirty" just from the suggested number loading in.
          lastSavedRef.current = { ...lastSavedRef.current, receiptNo: r.receiptNo };
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  useEffect(() => {
    if (!initialId) return;
    (async () => {
      try {
        const r: any = await legacyErpApi.purchaseOrders.get(Number(initialId));
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
        setPoId(r.id);
        setCodeInput(r.receiptNo);
      } catch (e: any) {
        toast.error(e.message || "Could not load purchase order");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.purchaseOrders.getByReceiptNo(codeInput.trim());
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
      setPoId(r.id);
      setMode("edit");
      toast.success("Loaded");
    } catch {
      toast.error("No purchase order found with that Receipt No");
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setPoId(null);
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
      if (!poId) dto.receiptNo = form.receiptNo?.trim() || undefined; // manual entry, else server auto-numbers
      if (poId) {
        const r: any = await legacyErpApi.purchaseOrders.update(poId, dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        // Standard ERP transaction workflow: header first, then any lines the user already
        // typed while the record had no id yet (held as drafts in the grid's own state) are
        // bulk-persisted against the freshly-generated PurchaseOrderId — one seamless Save
        // from the user's perspective, never two separate actions.
        const r: any = await legacyErpApi.purchaseOrders.create(dto);
        const f = sanitizeRecord({
          ...r, receiptDate: String(r.receiptDate).slice(0, 10),
          currentAccountLabel: form.currentAccountLabel, warehouseLabel: form.warehouseLabel,
        });
        setForm(f);
        lastSavedRef.current = f;
        setPoId(r.id);
        setCodeInput(r.receiptNo);
        await lineGridRef.current?.commitDrafts(r.id);
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
        <EmptyDescription>Save the purchase order first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Purchase Orders</span>
        {poId && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{form.receiptNo}</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {poId ? `Purchase Order ${form.receiptNo}` : "New Purchase Order"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Purchase Order</p>
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
                  {/* Editable, not server-locked — a suggested sequential number ("PO-1", "PO-2", ...)
                      pre-fills it, but the user can type their own before Save. Locked once the
                      record exists (ReceiptNo is immutable after creation, same as every other
                      master's Code field), via the same fieldset-disabled pattern used for View mode. */}
                  <fieldset disabled={!!poId} className="contents">
                    <FieldText label="Purchase Order No" value={form.receiptNo} onChange={(v) => set("receiptNo", v)} span="normal" />
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
                {/* Totals now render inside the grid's own footer (thin top border) — no
                    second card wrapping it here, and no separate totals box duplicating the
                    same three numbers below it. */}
                <PurchaseOrderLineGrid ref={lineGridRef} orderReceiptId={poId} readOnly={readOnly} />
              </div>
            </TabsContent>

            {!poId ? (
              ["Detail", "Explanation", "Attachments", "Certificates"].map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="Detail">
                  <PurchaseOrderDetailTab orderReceiptId={poId} readOnly={readOnly} />
                </TabsContent>

                <TabsContent value="Explanation">
                  <PurchaseOrderExplanationTab orderReceiptId={poId} readOnly={readOnly} />
                </TabsContent>

                <TabsContent value="Attachments">
                  <AttachmentsTab itemId={poId} readOnly={readOnly} api={legacyErpApi.purchaseOrders} />
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

// --- Detail tab: extended fields for whichever line the user picks from a small list -------
function PurchaseOrderDetailTab({ orderReceiptId, readOnly }: { orderReceiptId: number; readOnly?: boolean }) {
  const [lines, setLines] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r: any = await legacyErpApi.purchaseOrders.listItems(orderReceiptId);
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
      await legacyErpApi.purchaseOrders.updateItem(orderReceiptId, selectedId, form);
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
function PurchaseOrderExplanationTab({ orderReceiptId, readOnly }: { orderReceiptId: number; readOnly?: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.purchaseOrders.listExplanations(orderReceiptId);
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
      await legacyErpApi.purchaseOrders.createExplanation(orderReceiptId, { explanationText: text.trim() });
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
      await legacyErpApi.purchaseOrders.removeExplanation(orderReceiptId, id);
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
