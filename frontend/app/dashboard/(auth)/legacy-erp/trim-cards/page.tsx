"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LookupField } from "@/components/legacy-erp/lookup-field";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Search, Save, FilePlus2, Plus, Trash2, Scissors, ListX, Settings2, ChevronRight } from "lucide-react";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSwitchField } from "@/components/forms/form-field";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { GridInput, uid } from "./_components/grid-input";

interface TrimLine {
  id: string; // local uid for new rows, or the real numeric id (as string) once persisted
  savedId: number | null;
  trimCode: string; trimName: string; explanation: string;
  orderQuantity: string; unit: string; quantity: string; wastePct: string;
  forexId: string; forexPrice: string; unitPrice: string;
}

const emptyForm = {
  code: "", explanation: "", inUse: true,
  customerId: "" as string | number, customerLabel: "",
  styleGroupId: "" as string | number, styleGroupLabel: "",
  brandId: "" as string | number, brandLabel: "",
  styleDepartmentId: "" as string | number, styleDepartmentLabel: "",
};

const blankLine = (): TrimLine => ({
  id: uid(), savedId: null, trimCode: "", trimName: "", explanation: "",
  orderQuantity: "", unit: "", quantity: "", wastePct: "", forexId: "", forexPrice: "", unitPrice: "",
});

export default function CustomerDefineTrimsPage() {
  const [codeInput, setCodeInput] = useState("");
  const [trimCardId, setTrimCardId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [lines, setLines] = useState<TrimLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("General");

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Tracks the last loaded/saved {form, lines} snapshot so the Workspace Tab Bar
  // can warn before closing a tab with unsaved edits. Only updated at clean-state
  // moments (initial state, search, save, New) — never by `set()`/`updateLine()`,
  // which is exactly what should make the screen "dirty".
  const lastSavedRef = useRef<{ form: any; lines: TrimLine[] }>({ form: emptyForm, lines: [] });

  const loadLines = async (id: number) => {
    const rows: any = await legacyErpApi.trimCards.listItems(id);
    const list = Array.isArray(rows) ? rows : [];
    const mapped = list.map((r: any) => ({
      id: String(r.id), savedId: r.id,
      trimCode: r.trimCode ?? "", trimName: r.trimName ?? "", explanation: r.explanation ?? "",
      orderQuantity: r.orderQuantity ?? "", unit: r.unit ?? "", quantity: r.quantity ?? "",
      wastePct: r.wastePct ?? "", forexId: r.forexId ?? "", forexPrice: r.forexPrice ?? "", unitPrice: r.unitPrice ?? "",
    }));
    setLines(mapped);
    return mapped;
  };

  const search = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.trimCards.getByCode(codeInput.trim());
      const loadedForm = { ...emptyForm, ...r };
      setForm(loadedForm);
      setTrimCardId(r.id);
      const loadedLines = await loadLines(r.id);
      lastSavedRef.current = { form: loadedForm, lines: loadedLines };
      toast.success("Loaded");
    } catch {
      toast.error("No trim card found with that code");
      setTrimCardId(null);
      setLines([]);
      const draft = { ...emptyForm, code: codeInput.trim() };
      setForm(draft);
      lastSavedRef.current = { form: draft, lines: [] };
    } finally {
      setSearching(false);
    }
  };

  const newRecord = () => {
    setTrimCardId(null);
    setCodeInput("");
    setForm(emptyForm);
    setLines([]);
    lastSavedRef.current = { form: emptyForm, lines: [] };
  };

  const save = async () => {
    if (!form.code) return toast.error("Code is required");
    setSaving(true);
    try {
      const payload = {
        code: form.code, explanation: form.explanation, inUse: form.inUse,
        customerId: form.customerId || undefined,
        styleGroupId: form.styleGroupId || undefined,
        brandId: form.brandId || undefined,
        styleDepartmentId: form.styleDepartmentId || undefined,
      };
      let id = trimCardId;
      let savedForm: any;
      if (id) {
        const r: any = await legacyErpApi.trimCards.update(id, payload);
        setForm((p: any) => { savedForm = { ...p, ...r }; return savedForm; });
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.trimCards.create(payload);
        id = r.id;
        setTrimCardId(id);
        setCodeInput(r.code);
        setForm((p: any) => { savedForm = { ...p, ...r }; return savedForm; });
        toast.success("Created");
      }

      // Persist grid rows: create new ones, update changed existing ones.
      for (const line of lines) {
        const body = {
          trimCode: line.trimCode, trimName: line.trimName, explanation: line.explanation,
          orderQuantity: line.orderQuantity || undefined, unit: line.unit || undefined,
          quantity: line.quantity || undefined, wastePct: line.wastePct || undefined,
          forexId: line.forexId || undefined, forexPrice: line.forexPrice || undefined, unitPrice: line.unitPrice || undefined,
        };
        if (!line.trimCode && !line.trimName) continue; // skip fully-blank rows
        if (line.savedId) await legacyErpApi.trimCards.updateItem(id!, line.savedId, body);
        else await legacyErpApi.trimCards.createItem(id!, body);
      }
      const savedLines = await loadLines(id!);
      lastSavedRef.current = { form: savedForm, lines: savedLines };
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addLine = () => setLines((p) => [...p, blankLine()]);
  const updateLine = (id: string, patch: Partial<TrimLine>) => setLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = async (line: TrimLine) => {
    if (line.savedId && trimCardId) {
      try {
        await legacyErpApi.trimCards.removeItem(trimCardId, line.savedId);
        // Already persisted server-side — reflect that in the clean-state snapshot
        // too, so closing the tab right after doesn't falsely warn about unsaved changes.
        lastSavedRef.current = { ...lastSavedRef.current, lines: lastSavedRef.current.lines.filter((l) => l.id !== line.id) };
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    setLines((p) => p.filter((l) => l.id !== line.id));
  };

  const isDirty = JSON.stringify({ form, lines }) !== JSON.stringify(lastSavedRef.current);
  useWorkspaceDirty(isDirty, async () => { await save(); });

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Customer Define Trims</span>
        {trimCardId && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{form.code}</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {trimCardId ? (form.code || "Trim Card") : "New Trim Card"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Customer Define Trims</p>
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
          <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>

      <div className="space-y-4">
        <FormSection title="Identification">
          <FormTextField label="Explanation" value={form.explanation} onChange={(v) => set("explanation", v)} span="wide" />
          <FormSwitchField label="In Use" checked={form.inUse} onChange={(v) => set("inUse", v)} />
        </FormSection>

        <FormSection title="Classification">
          <LookupField
            label="Customer"
            displayValue={form.customerLabel || (form.customerId ? String(form.customerId) : "")}
            fetchOptions={(s) => legacyErpApi.accounts.list(s) as any}
            getLabel={(item: any) => `${item.currentAccountCode} — ${item.currentAccountName}`}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, customerId: item.id, customerLabel: `${item.currentAccountCode} — ${item.currentAccountName}` }))}
          />
          <LookupField
            label="Style Group"
            displayValue={form.styleGroupLabel}
            fetchOptions={(s) => legacyErpApi.lookupParameters("style-group", s) as any}
            getLabel={(item: any) => item.value}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, styleGroupId: item.id, styleGroupLabel: item.value }))}
          />
          <LookupField
            label="Brand"
            displayValue={form.brandLabel}
            fetchOptions={(s) => legacyErpApi.lookupParameters("brand", s) as any}
            getLabel={(item: any) => item.value}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, brandId: item.id, brandLabel: item.value }))}
          />
          <LookupField
            label="Style Department"
            displayValue={form.styleDepartmentLabel}
            fetchOptions={(s) => legacyErpApi.lookupParameters("style-department", s) as any}
            getLabel={(item: any) => item.value}
            getValue={(item: any) => item.id}
            onSelect={(item: any) => setForm((p: any) => ({ ...p, styleDepartmentId: item.id, styleDepartmentLabel: item.value }))}
          />
        </FormSection>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
        <ScrollableTabsList tabs={["General", "Customized Fields"]} activeTab={activeTab} />

        <TabsContent value="General" className="p-6">
          <div className="flex items-center justify-between mb-4">
            {!trimCardId ? (
              <Badge variant="secondary" className="h-5 text-[11px] font-normal">Staged until saved</Badge>
            ) : <span />}
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-2" />Add Row</Button>
          </div>
          <div className="rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Trim Code</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Trim Name</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Explanation</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Order Qty</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Unit</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Quantity</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Waste %</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Forex</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Forex Price</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Unit Price</TableHead>
                    <TableHead className="h-10 w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={11} className="py-8">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon"><ListX /></EmptyMedia>
                            <EmptyTitle className="text-sm">No trim lines</EmptyTitle>
                            <EmptyDescription>Click &quot;Add Row&quot; to add the first trim line.</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : lines.map((line) => (
                    <TableRow key={line.id} className="group">
                      <TableCell><GridInput value={line.trimCode} onChange={(v) => updateLine(line.id, { trimCode: v })} /></TableCell>
                      <TableCell><GridInput value={line.trimName} onChange={(v) => updateLine(line.id, { trimName: v })} /></TableCell>
                      <TableCell><GridInput value={line.explanation} onChange={(v) => updateLine(line.id, { explanation: v })} /></TableCell>
                      <TableCell><GridInput type="number" align="right" value={line.orderQuantity} onChange={(v) => updateLine(line.id, { orderQuantity: v })} /></TableCell>
                      <TableCell><GridInput value={line.unit} onChange={(v) => updateLine(line.id, { unit: v })} /></TableCell>
                      <TableCell><GridInput type="number" align="right" value={line.quantity} onChange={(v) => updateLine(line.id, { quantity: v })} /></TableCell>
                      <TableCell><GridInput type="number" align="right" value={line.wastePct} onChange={(v) => updateLine(line.id, { wastePct: v })} /></TableCell>
                      <TableCell><GridInput value={line.forexId} onChange={(v) => updateLine(line.id, { forexId: v })} /></TableCell>
                      <TableCell><GridInput type="number" align="right" value={line.forexPrice} onChange={(v) => updateLine(line.id, { forexPrice: v })} /></TableCell>
                      <TableCell><GridInput type="number" align="right" value={line.unitPrice} onChange={(v) => updateLine(line.id, { unitPrice: v })} /></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => removeLine(line)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="Customized Fields" className="p-6">
          <div className="rounded-lg border border-dashed bg-muted/20">
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Settings2 /></EmptyMedia>
                <EmptyTitle>No custom fields</EmptyTitle>
                <EmptyDescription>No custom fields have been defined for this screen yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
