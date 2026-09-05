"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Save, FilePlus2, Shirt, Lock, ExternalLink, Wand2 } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { FormGrid } from "@/components/forms/form-grid";
import { FormTextField as FieldText, FormSwitchField as FieldCheck, FormSelectField, FieldLabel, spanClass } from "@/components/forms/form-field";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";

// Sample Card detail — the REAL SampleCard model (plmApi.sampleCards), a genuinely separate,
// independent record type from StyleCard. Previously this screen silently edited a StyleCard
// instead (plmApi.styleCards.*) with borrowed BOM/Measurement/Wash&Care tabs that don't exist on
// SampleCard at all — fixed per the explicit business rule: Sample Card and Style Card must
// never behave like the same record. "Create Style Card" (below) is the only sanctioned way a
// Style Card is ever produced from here, and it always creates a brand-new, independent
// StyleCard — it never links back to or mutates this Sample Card.
const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in-progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

const emptyHeader = {
  title: "", description: "", sampleTypeId: "", season: "", year: "", status: "draft",
  colorway: "", size: "", quantity: "", assignedTo: "", dueDate: "", cost: "", currency: "PKR", notes: "",
};

export default function SampleCardDetailPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const initialId = searchParams.get("id");
  const isNew = !initialId;
  const initialMode = (searchParams.get("mode") as "view" | "edit" | null) || (isNew ? "create" : "edit");

  const [recordId, setRecordId] = useState<string | null>(isNew ? null : initialId);
  const [card, setCard] = useState<any>(null);
  const [header, setHeader] = useState<Record<string, any>>(emptyHeader);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const readOnly = mode === "view";
  const [nameError, setNameError] = useState("");
  const [sampleTypes, setSampleTypes] = useState<any[]>([]);

  const [createStyleConfirmOpen, setCreateStyleConfirmOpen] = useState(false);
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [createdStyleDialog, setCreatedStyleDialog] = useState<{ id: string; styleNumber: string } | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<Record<string, any>>(emptyHeader);
  const { clearDraft } = useDraftForm({ storageKey: "sampleCardDraft", enabled: isNew && !recordId, form: header, setForm: setHeader });

  const toFormDate = (d: any) => (d ? String(d).slice(0, 10) : "");

  const load = async (id: string) => {
    setLoading(true);
    try {
      const r: any = await plmApi.sampleCards.get(id);
      setCard(r);
      const h = {
        title: r.title || "", description: r.description || "", sampleTypeId: r.sampleTypeId || "",
        season: r.season || "", year: r.year ?? "", status: r.status || "draft",
        colorway: r.colorway || "", size: r.size || "", quantity: r.quantity ?? "",
        assignedTo: r.assignedTo || "", dueDate: toFormDate(r.dueDate), cost: r.cost ?? "",
        currency: r.currency || "PKR", notes: r.notes || "",
      };
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
    plmApi.sampleTypes.list().then((r: any) => setSampleTypes(Array.isArray(r) ? r : r?.data || [])).catch(() => setSampleTypes([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    load(initialId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setHeader((p) => ({ ...p, [k]: v }));

  const newRecord = () => navigateOrOpenTab(router, "/dashboard/plm/sample-cards?mode=create");

  const buildDto = () => ({
    title: header.title.trim(),
    description: header.description || undefined,
    sampleTypeId: header.sampleTypeId || undefined,
    season: header.season || undefined,
    year: header.year !== "" ? Number(header.year) : undefined,
    status: header.status,
    colorway: header.colorway || undefined,
    size: header.size || undefined,
    quantity: header.quantity !== "" ? Number(header.quantity) : undefined,
    assignedTo: header.assignedTo || undefined,
    dueDate: header.dueDate || undefined,
    cost: header.cost !== "" ? Number(header.cost) : undefined,
    currency: header.currency || undefined,
    notes: header.notes || undefined,
  });

  const save = async () => {
    setNameError("");
    if (!header.title.trim()) {
      setNameError("Name is required");
      return toast.error("Name is required");
    }
    if (!header.sampleTypeId) {
      return toast.error("Sample Type is required");
    }
    setSaving(true);
    try {
      if (recordId) {
        const r: any = await plmApi.sampleCards.update(recordId, buildDto());
        setCard(r);
        lastSavedRef.current = { ...header };
        toast.success("Updated");
      } else {
        const r: any = await plmApi.sampleCards.create(buildDto());
        setCard(r);
        lastSavedRef.current = { ...header };
        setRecordId(r.id);
        setMode("edit");
        clearDraft();
        toast.success("Created");
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

  const titleText = recordId ? (header.title || "Sample Card") : "New Sample Card";
  useWorkspaceRecordLabel(recordId ? (header.title || card?.sampleNumber || undefined) : undefined);

  const submitCreateStyleCard = async () => {
    if (!recordId) return;
    setCreatingStyle(true);
    try {
      const style: any = await plmApi.sampleCards.createStyleCard(recordId);
      setCreateStyleConfirmOpen(false);
      setCreatedStyleDialog({ id: style.id, styleNumber: style.styleNumber });
      toast.success(`Style Card ${style.styleNumber} created`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create Style Card");
    } finally {
      setCreatingStyle(false);
    }
  };

  const pageActions: RowAction[] = [
    { key: "save", label: "Save", icon: Save, onSelect: () => { save(); }, disabled: readOnly || saving },
    { key: "create-style", label: "Create Style Card", icon: Wand2, onSelect: () => setCreateStyleConfirmOpen(true), disabled: !recordId },
  ];

  if (loading) {
    return <div className="mx-auto max-w-[1600px] p-6 lg:p-8 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <RowContextMenu actions={pageActions}>
    <div className="mx-auto max-w-[1200px] space-y-6 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "PLM" },
        { label: "Sample Cards", href: "/dashboard/plm/sample-cards-list" },
        ...(recordId ? [{ label: card?.sampleNumber }] : []),
      ]} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Shirt className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">{titleText}</h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Sample Card</p>
              {readOnly && <Badge variant="secondary" className="h-5 gap-1 text-[11px] font-normal"><Lock className="h-2.5 w-2.5" />View Only</Badge>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={newRecord}><FilePlus2 className="h-3.5 w-3.5 mr-2" />New</Button>
          {!readOnly && <Button size="sm" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}</Button>}
          <Button variant="outline" size="sm" onClick={() => setCreateStyleConfirmOpen(true)} disabled={!recordId}>
            <Wand2 className="h-3.5 w-3.5 mr-2" />Create Style Card
          </Button>
        </div>
      </div>

      <FormGrid>
        <div className={spanClass("normal")}>
          <FieldLabel>Code</FieldLabel>
          <InputGroup className="h-9">
            <InputGroupInput value={recordId ? card?.sampleNumber : "Generated on Save"} disabled readOnly className="text-sm text-muted-foreground" />
          </InputGroup>
        </div>
        <fieldset disabled={readOnly} className="contents">
          <div className={spanClass("normal")}>
            <FieldLabel>Name</FieldLabel>
            <input
              ref={nameInputRef}
              value={header.title}
              onChange={(e) => { set("title", e.target.value); if (nameError) setNameError(""); }}
              className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>
          <FormSelectField label="Status" value={header.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} />

          <FormSelectField
            label="Sample Type"
            value={header.sampleTypeId}
            onChange={(v) => set("sampleTypeId", v)}
            options={sampleTypes.map((t) => ({ value: t.id, label: t.name }))}
          />
          <FieldText label="Season" value={header.season} onChange={(v) => set("season", v)} />
          <FieldText label="Year" type="number" value={header.year} onChange={(v) => set("year", v)} />

          <FieldText label="Colorway" value={header.colorway} onChange={(v) => set("colorway", v)} />
          <FieldText label="Size" value={header.size} onChange={(v) => set("size", v)} />
          <FieldText label="Quantity" type="number" value={header.quantity} onChange={(v) => set("quantity", v)} />

          <FieldText label="Assigned To" value={header.assignedTo} onChange={(v) => set("assignedTo", v)} />
          <FieldText label="Due Date" type="date" value={header.dueDate} onChange={(v) => set("dueDate", v)} />
          <FieldText label="Cost" type="number" value={header.cost} onChange={(v) => set("cost", v)} />

          <FieldText label="Currency" value={header.currency} onChange={(v) => set("currency", v)} />

          <div className={spanClass("wide")}>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={header.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
          <div className={spanClass("wide")}>
            <FieldLabel>Notes</FieldLabel>
            <Textarea value={header.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </fieldset>
      </FormGrid>

      {/* Linked Style Card — read-only display only. Never editable from here: the only way a
          Style Card relationship is ever created is the explicit "Create Style Card" action,
          which never writes back to this Sample Card's own styleCardId. */}
      <div className="rounded-xl border p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Linked Style Card</p>
        {card?.styleCard ? (
          <button
            type="button"
            onClick={() => navigateOrOpenTab(router, `/dashboard/plm/style-cards/${card.styleCard.id}`)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{card.styleCard.styleNumber}</span>
            {card.styleCard.title}
            <ExternalLink className="h-3 w-3" />
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">No Style Card linked yet. Use "Create Style Card" to generate a new, independent Style Card from this sample.</p>
        )}
      </div>

      {!recordId && (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Lock /></EmptyMedia>
            <EmptyTitle>Save required</EmptyTitle>
            <EmptyDescription>Save the sample card first to create a Style Card from it.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Confirm before creating — Rule 12 */}
      <AlertDialog open={createStyleConfirmOpen} onOpenChange={setCreateStyleConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Style Card</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a brand-new, independent Style Card with its own Style Code, copying this Sample Card's own fields
              (Name, Description, Season, Year, Size, Colorway, Attachments). This Sample Card will not be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitCreateStyleCard} disabled={creatingStyle}>{creatingStyle ? "Creating..." : "Create"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success — show new code, allow opening it (Rule 12) */}
      <Dialog open={!!createdStyleDialog} onOpenChange={(open) => !open && setCreatedStyleDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Style Card Created</DialogTitle>
            <DialogDescription>A new, independent Style Card <span className="font-mono text-foreground">{createdStyleDialog?.styleNumber}</span> was created from this Sample Card.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedStyleDialog(null)}>Close</Button>
            <Button onClick={() => { if (createdStyleDialog) navigateOrOpenTab(router, `/dashboard/plm/style-cards/${createdStyleDialog.id}`); setCreatedStyleDialog(null); }}>
              <ExternalLink className="h-3.5 w-3.5 mr-2" />Open Style Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RowContextMenu>
  );
}
