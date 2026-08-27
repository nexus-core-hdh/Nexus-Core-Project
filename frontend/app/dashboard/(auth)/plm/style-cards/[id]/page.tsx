"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowLeft, Copy, Search, Lock } from "lucide-react";
import { FormGrid } from "@/components/forms/form-grid";
import { FormSwitchField as FieldCheck, FieldLabel, spanClass } from "@/components/forms/form-field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

import { GeneralTab } from "./_components/general-tab";
import { ExplanationTab } from "./_components/explanation-tab";
import { AttributesTab } from "./_components/attributes-tab";
import { MeasurementChartTab } from "./_components/measurement-chart-tab";
import { StudyTab } from "./_components/study-tab";
import { BomTab } from "./_components/bom-tab";
import { WashCareTab } from "./_components/wash-care-tab";
import { OrderInfoTab } from "./_components/order-info-tab";
import { CostTab } from "./_components/cost-tab";
import { AttachmentsTab } from "./_components/attachments-tab";
import { PictureGalleryTab } from "./_components/picture-gallery-tab";
import { CustomizedFieldsTab } from "./_components/customized-fields-tab";

const STATUSES = ['concept', 'design', 'mood-board-review', 'tech-pack', 'sampling', 'sample-review', 'approved', 'production', 'discontinued'];
const STATUS_COLORS: Record<string, string> = {
  concept: 'bg-slate-100 text-slate-700', design: 'bg-blue-100 text-blue-700',
  sampling: 'bg-purple-100 text-purple-700', approved: 'bg-green-100 text-green-700',
  production: 'bg-emerald-100 text-emerald-700', discontinued: 'bg-red-100 text-red-700',
};
const TABS = [
  "General", "Explanation", "Attributes", "Measurement Chart", "Study", "BOM",
  "Wash & Care", "Order Info", "Cost", "Attachments", "Picture Gallery", "Customized Fields",
];

export default function StyleCardDetailPage() {
  const { id: routeId } = useParams() as { id: string };
  const router = useRouter();
  const isNew = routeId === "new";
  const [recordId, setRecordId] = useState<string | null>(isNew ? null : routeId);
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [statusDialog, setStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [codePreview, setCodePreview] = useState('');
  const [activeTab, setActiveTab] = useState("General");

  const load = async (targetId: string) => {
    setLoading(true);
    try {
      const r: any = await plmApi.styleCards.get(targetId);
      setCard(r);
      setNameDraft(r.title || "");
      setRecordId(r.id);
    } finally {
      setLoading(false);
    }
  };

  const loadPreviewCode = async () => {
    try {
      const r: any = await plmApi.styleCards.previewNextCode();
      setCodePreview(r.code);
    } catch {
      // Non-critical — Save still generates the real code server-side even if this preview fails.
    }
  };

  useEffect(() => {
    if (isNew) { loadPreviewCode(); return; }
    load(routeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Code / Name / In Use header — same read-only-Code / editable-Name-and-In-Use convention
  // plm/sample-cards already uses (both StyleCard-backed). Before the first save, "Name" commits
  // by CREATING the record (mirrors sample-cards' create flow) instead of updating one; every
  // subsequent commit updates the existing record. No separate header Save button — this
  // screen's own tabs (General, BOM, ...) already each have their own Save action, and the
  // record itself must exist before any of them are usable anyway.
  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) { setNameError("Name is required"); return; }
    setNameError("");
    try {
      if (!recordId) {
        const r: any = await plmApi.styleCards.create({ title: trimmed });
        setCard(r);
        setRecordId(r.id);
        toast.success("Style card created");
        router.replace(`/dashboard/plm/style-cards/${r.id}`);
      } else if (trimmed !== card.title) {
        const r: any = await plmApi.styleCards.update(recordId, { title: trimmed });
        setCard(r);
        toast.success("Name updated");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const toggleInUse = async (v: boolean) => {
    if (!recordId) return;
    try {
      const r: any = await plmApi.styleCards.update(recordId, { inUse: v });
      setCard(r);
    } catch (e: any) {
      toast.error(e.message || "Failed to update In Use");
    }
  };

  const changeStatus = async () => {
    if (!newStatus || !recordId) return;
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.styleCards.changeStatus(recordId, { status: newStatus, note: statusNote, changedBy: user?.id });
      toast.success("Status updated");
      setStatusDialog(false);
      load(recordId);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const duplicate = async () => {
    if (!recordId) return;
    try {
      const created: any = await plmApi.styleCards.duplicate(recordId);
      toast.success("Style card duplicated");
      router.push(`/dashboard/plm/style-cards/${created.id}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const reloadCard = () => { if (recordId) load(recordId); };

  const saveRequired = (label: string) => (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>Save required</EmptyTitle>
        <EmptyDescription>Enter a Name and save the style card first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!isNew && !card) return <div className="p-6 text-muted-foreground">Style card not found.</div>;

  const sampleLabel = card?.sampleCards?.[0]?.title;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{recordId ? `${card.styleNumber} — ${card.title}` : "New Style Card"}</h1>
            {card && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[card.status] || 'bg-gray-100 text-gray-700'}`}>{card.status}</span>}
          </div>
          {card && (
            <p className="text-xs text-muted-foreground font-mono">
              {sampleLabel ? `${sampleLabel} · ` : ""}{card.season || "—"} {card.year || ""} · {card.gender || "—"}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={duplicate} disabled={!recordId}><Copy className="h-4 w-4 mr-1" />Duplicate</Button>
        <Button size="sm" variant="outline" disabled={!recordId} onClick={() => { setNewStatus(card.status); setStatusNote(''); setStatusDialog(true); }}>Change Status</Button>
      </div>

      {/* Code / Name / In Use — matches the reference screenshot's header strip, same
          read-only-Code / editable-Name-and-In-Use convention plm/sample-cards already uses
          (both StyleCard-backed). Code is generated server-side on create and never editable. */}
      <FormGrid>
        <div className={spanClass("normal")}>
          <FieldLabel>Code</FieldLabel>
          <InputGroup className="h-9">
            <InputGroupInput value={card?.styleNumber || codePreview || "Generating..."} disabled readOnly title="Code is generated automatically and cannot be edited" className="text-sm text-muted-foreground" />
            <InputGroupAddon align="inline-end"><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
          </InputGroup>
        </div>
        <div className={spanClass("normal")}>
          <FieldLabel>Name</FieldLabel>
          <input
            value={nameDraft}
            onChange={(e) => { setNameDraft(e.target.value); if (nameError) setNameError(""); }}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className={cn(
              "h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              nameError ? "border-destructive focus-visible:ring-destructive/40" : "border-input"
            )}
          />
          {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
        </div>
        <FieldCheck label="In Use" checked={card?.inUse !== false} onChange={toggleInUse} />
      </FormGrid>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
        </TabsList>

        {!recordId ? (
          TABS.map((t) => (
            <TabsContent key={t} value={t} className="pt-4">
              {saveRequired(t)}
            </TabsContent>
          ))
        ) : (
          <>
            <TabsContent value="General" className="pt-4">
              <GeneralTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Explanation" className="pt-4">
              <ExplanationTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Attributes" className="pt-4">
              <AttributesTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Measurement Chart" className="pt-4">
              <MeasurementChartTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Study" className="pt-4">
              <StudyTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="BOM" className="pt-4">
              <BomTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Wash & Care" className="pt-4">
              <WashCareTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Order Info" className="pt-4">
              <OrderInfoTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Cost" className="pt-4">
              <CostTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Attachments" className="pt-4">
              <AttachmentsTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Picture Gallery" className="pt-4">
              <PictureGalleryTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Customized Fields" className="pt-4">
              <CustomizedFieldsTab styleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Note</Label><Textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} rows={2} placeholder="Reason for status change..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusDialog(false)}>Cancel</Button><Button onClick={changeStatus} disabled={saving}>Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
