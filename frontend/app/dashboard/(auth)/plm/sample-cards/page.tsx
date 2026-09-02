"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/shared/scrollable-tabs-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Search, Save, FilePlus2, Shirt, Lock, Sparkles, Pencil, Ruler } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceTabTitle } from "@/hooks/use-workspace-tab-title";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { FormGrid } from "@/components/forms/form-grid";
import { FormSwitchField as FieldCheck, FieldLabel, spanClass } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";

import { GeneralTab } from "./_components/general-tab";
import { SelectSizesDialog } from "../_components/select-sizes-dialog";
import { MeasurementChartTab } from "../style-cards/[id]/_components/measurement-chart-tab";
import { BomTab } from "../style-cards/[id]/_components/bom-tab";
import { WashCareTab } from "../style-cards/[id]/_components/wash-care-tab";
import { StudyTab } from "../style-cards/[id]/_components/study-tab";
import { ExpensesTab } from "../style-cards/[id]/_components/expenses-tab";
import { OrderInfoTab } from "../style-cards/[id]/_components/order-info-tab";
import { CostTab } from "../style-cards/[id]/_components/cost-tab";
import { CustomizedFieldsTab } from "../style-cards/[id]/_components/customized-fields-tab";

// Sample Cards detail screen — ONE static route reading ?id=&mode= from the query string
// instead of a dynamic [id] segment, matching every other legacy-erp/PLM List+Detail pair's
// own Workspace tab convention (e.g. yarn-cards-list -> yarn-cards) — see
// lib/workspace/registry.tsx's own comment: dynamic route segments are excluded from the
// Workspace tab registry entirely, so a [id] folder here could never become a tab. Moved from
// plm/sample-cards/[id]/page.tsx; the list moved out to plm/sample-cards-list/page.tsx so this
// path is free for the detail/editor. Same StyleCard record + tab components the existing
// plm/style-cards screen already uses (imported directly, not copied). "Start Sampling Flow"
// reuses the existing plm/sample-cards create workflow unchanged (see the dialog below).
const TABS = [
  "General", "Measurement Chart", "BOM", "Wash & Care", "Study",
  "Expenses", "Order Info", "Cost", "Customized Fields",
];

export default function SampleCardMasterDetailPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const initialId = searchParams.get("id");
  const isNew = !initialId;
  const initialMode = (searchParams.get("mode") as "view" | "edit" | null) || (isNew ? "create" : "edit");

  const emptyHeader = { title: "", inUse: true, styleNumber: "" };
  const [recordId, setRecordId] = useState<string | null>(isNew ? null : initialId);
  const [card, setCard] = useState<any>(null);
  const [header, setHeader] = useState<Record<string, any>>(emptyHeader);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [activeTab, setActiveTab] = useState("General");
  const [nameError, setNameError] = useState("");

  const [flowOpen, setFlowOpen] = useState(false);
  const [flowSampleTypeId, setFlowSampleTypeId] = useState("");
  const [flowTitle, setFlowTitle] = useState("");
  const [flowSaving, setFlowSaving] = useState(false);
  const [sampleTypes, setSampleTypes] = useState<any[]>([]);
  const [sizesDialogOpen, setSizesDialogOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const lastSavedRef = useRef<Record<string, any>>(emptyHeader);
  const { clearDraft } = useDraftForm({ storageKey: "sampleCardMasterDraft", enabled: isNew && !recordId, form: header, setForm: setHeader });

  const loadPreviewCode = async () => {
    try {
      const r: any = await plmApi.styleCards.previewNextCode();
      setHeader((p) => ({ ...p, styleNumber: r.code }));
      lastSavedRef.current = { ...lastSavedRef.current, styleNumber: r.code };
    } catch {
      // Non-critical — Save still generates the real code server-side even if this preview fails.
    }
  };

  const load = async (id: string) => {
    setLoading(true);
    try {
      const r: any = await plmApi.styleCards.get(id);
      setCard(r);
      const h = { title: r.title || "", inUse: r.inUse !== false, styleNumber: r.styleNumber || "" };
      setHeader(h);
      lastSavedRef.current = h;
      setRecordId(r.id);
    } catch (e: any) {
      toast.error(e.message || "Could not load sample card");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isNew) { loadPreviewCode(); return; }
    load(initialId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setHeader((p) => ({ ...p, [k]: v }));

  const newRecord = () => {
    navigateOrOpenTab(router, "/dashboard/plm/sample-cards?mode=create");
  };

  const save = async () => {
    setNameError("");
    if (!header.title.trim()) {
      setNameError("Name is required");
      return toast.error("Name is required");
    }
    setSaving(true);
    try {
      if (recordId) {
        const r: any = await plmApi.styleCards.update(recordId, { title: header.title, inUse: header.inUse });
        setCard(r);
        const h = { title: r.title, inUse: r.inUse !== false, styleNumber: r.styleNumber };
        setHeader(h);
        lastSavedRef.current = h;
        toast.success("Updated");
      } else {
        const r: any = await plmApi.styleCards.create({ title: header.title, inUse: header.inUse });
        setCard(r);
        const h = { title: r.title, inUse: r.inUse !== false, styleNumber: r.styleNumber };
        setHeader(h);
        lastSavedRef.current = h;
        setRecordId(r.id);
        setMode("edit");
        clearDraft();
        toast.success("Created");
        // Routes this same Workspace tab from ?mode=create to ?id=&mode=edit — navigateOrOpenTab
        // (not a plain router.replace) so the tab's own stored href updates too, matching
        // inventory-receipts/page.tsx's identical post-create transition.
        navigateOrOpenTab(router, `/dashboard/plm/sample-cards?id=${r.id}&mode=edit`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const isDirty = !readOnly && JSON.stringify(header) !== JSON.stringify(lastSavedRef.current);
  useWorkspaceDirty(isDirty, async () => { await save(); });

  // Puts the same title shown in the in-page H1 below onto the actual Workspace tab — a no-op
  // outside the workspace tab stack (rendered standalone), see use-workspace-tab-title.ts.
  const titleText = recordId ? (header.title || "Sample Card") : "New Sample Card";
  useWorkspaceTabTitle(titleText);

  const reloadCard = () => { if (recordId) load(recordId); };

  const openStartFlow = async () => {
    if (!recordId) return;
    setFlowTitle(header.title || "");
    setFlowSampleTypeId("");
    setFlowOpen(true);
    if (!sampleTypes.length) {
      try {
        const r: any = await plmApi.sampleTypes.list();
        setSampleTypes(Array.isArray(r) ? r : r?.data || []);
      } catch {
        setSampleTypes([]);
      }
    }
  };

  // Reuses the exact existing createSampleCard() service method (same one the removed
  // plm/sample-cards list page's own "New Sample Card" dialog used to call) — this button is
  // only a new, pre-scoped entry point into that unchanged workflow, styleCardId preset to the
  // record already open here. The old plm/sample-cards detail screen this used to navigate to
  // has been removed, so on success we just close the dialog and reload this card (its
  // sampleCards relation picks up the new row) instead of routing to a now-deleted page.
  const submitStartFlow = async () => {
    if (!recordId || !flowSampleTypeId || !flowTitle.trim()) return toast.error("Sample type and title are required");
    setFlowSaving(true);
    try {
      await plmApi.sampleCards.create({ styleCardId: recordId, sampleTypeId: flowSampleTypeId, title: flowTitle.trim() });
      toast.success("Sampling flow started");
      setFlowOpen(false);
      reloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to start sampling flow");
    } finally {
      setFlowSaving(false);
    }
  };

  // Screen-level right-click menu (see components/legacy-erp/row-actions.tsx's RowContextMenu —
  // reused here despite its "Row" name, since it just wraps whatever children it's given).
  // "Edit Name" — Code is immutable everywhere in this codebase (server- and client-enforced,
  // e.g. the header's own Code field above is always disabled/readOnly), so per the confirmed
  // scope this action only ever touches Name: it exits View Only if needed, then focuses the
  // Name input, since Name is already inline-editable whenever the screen isn't read-only.
  const pageActions: RowAction[] = [
    { key: "save", label: "Save", icon: Save, onSelect: () => { save(); }, disabled: readOnly || saving },
    {
      key: "edit-name", label: "Edit Name", icon: Pencil,
      onSelect: () => { if (readOnly) setMode("edit"); requestAnimationFrame(() => nameInputRef.current?.focus()); },
      disabled: !recordId,
    },
    { key: "select-sizes", label: "Select Sizes", icon: Ruler, onSelect: () => setSizesDialogOpen(true), disabled: !recordId },
  ];

  const saveRequired = (label: string) => (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>Save required</EmptyTitle>
        <EmptyDescription>Save the sample card first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  if (loading) {
    return <div className="mx-auto max-w-[1600px] p-6 lg:p-8 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <RowContextMenu actions={pageActions}>
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "PLM" },
        { label: "Sample Cards", href: "/dashboard/plm/sample-cards-list" },
        ...(recordId ? [{ label: header.styleNumber }] : []),
      ]} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Shirt className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
              {titleText}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Sample Card</p>
              {readOnly && (
                <Badge variant="secondary" className="h-5 gap-1 text-[11px] font-normal">
                  <Lock className="h-2.5 w-2.5" />View Only
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={newRecord}><FilePlus2 className="h-3.5 w-3.5 mr-2" />New</Button>
          {!readOnly && <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}</Button>}
          <Button variant="outline" size="sm" onClick={openStartFlow} disabled={!recordId}>
            <Sparkles className="h-3.5 w-3.5 mr-2" />Start Sampling Flow
          </Button>
        </div>
      </div>

      {/* Code / Name / In Use — always visible, matching the legacy header strip. Code is
          read-only everywhere: server-generated on Save (SC-YYYY-NNN via previewNextCode()). */}
      <FormGrid>
        <div className={spanClass("normal")}>
          <FieldLabel>Code</FieldLabel>
          <InputGroup className="h-9">
            <InputGroupInput
              value={header.styleNumber || "Generating..."}
              disabled
              readOnly
              title="Code is generated automatically and cannot be edited"
              className="text-sm text-muted-foreground"
            />
            <InputGroupAddon align="inline-end">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <fieldset disabled={readOnly} className="contents">
          <div className={spanClass("normal")}>
            <FieldLabel>Name</FieldLabel>
            <input
              ref={nameInputRef}
              value={header.title}
              onChange={(e) => { set("title", e.target.value); if (nameError) setNameError(""); }}
              className={cn(
                "h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                nameError ? "border-destructive focus-visible:ring-destructive/40" : "border-input"
              )}
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>
          <FieldCheck label="In Use" checked={header.inUse} onChange={(v) => set("inUse", v)} />
        </fieldset>
      </FormGrid>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-0">
        <div className="rounded-xl border bg-card shadow-sm">
          <ScrollableTabsList tabs={TABS} activeTab={activeTab} />

          <div className="p-6">
            {!recordId ? (
              TABS.map((t) => (
                <TabsContent key={t} value={t} className="rounded-lg border border-dashed bg-muted/20">
                  {saveRequired(t)}
                </TabsContent>
              ))
            ) : (
              <>
                <TabsContent value="General"><GeneralTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Measurement Chart"><MeasurementChartTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="BOM"><BomTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Wash & Care"><WashCareTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Study"><StudyTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Expenses"><ExpensesTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Order Info"><OrderInfoTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Cost"><CostTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
                <TabsContent value="Customized Fields"><CustomizedFieldsTab styleCardId={recordId} card={card} onReloadCard={reloadCard} /></TabsContent>
              </>
            )}
          </div>
        </div>
      </Tabs>

      <Dialog open={flowOpen} onOpenChange={setFlowOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Start Sampling Flow</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Sample Type</Label>
              <Select value={flowSampleTypeId} onValueChange={setFlowSampleTypeId}>
                <SelectTrigger><SelectValue placeholder="Select sample type" /></SelectTrigger>
                <SelectContent>{sampleTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <input
                value={flowTitle}
                onChange={(e) => setFlowTitle(e.target.value)}
                className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlowOpen(false)}>Cancel</Button>
            <Button onClick={submitStartFlow} disabled={flowSaving}>{flowSaving ? "Starting..." : "Start"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {recordId && (
        <SelectSizesDialog
          open={sizesDialogOpen}
          onOpenChange={setSizesDialogOpen}
          styleCardId={recordId}
          currentSizes={Array.isArray(card?.sizes) ? card.sizes : []}
          onSaved={reloadCard}
        />
      )}
    </div>
    </RowContextMenu>
  );
}
