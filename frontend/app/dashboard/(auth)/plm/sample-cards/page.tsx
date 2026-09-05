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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plmApi } from "@/lib/nexuscore-api";
import { customerApi, uploadApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Save, FilePlus2, Shirt, Lock, ExternalLink, Wand2, X, Plus, Ruler, Upload, ClipboardPaste, File as FileIcon, ImageOff } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useDraftForm } from "@/hooks/legacy-erp/use-draft-form";
import { FormGrid } from "@/components/forms/form-grid";
import { FormTextField as FieldText, FormSelectField, FieldLabel, spanClass } from "@/components/forms/form-field";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { SelectSizesDialog } from "../_components/select-sizes-dialog";

// Tab components below are the SAME files Style Card's own detail page uses
// (style-cards/[id]/_components/*-tab.tsx), each generalized with an optional `sampleCardId`
// prop alongside their existing `styleCardId` prop — reused wholesale rather than duplicated,
// so every one persists to its own genuinely independent SampleCard-owned data (own BOM/
// Wash&Care/Attributes tables, own explanations/measurementChartId/images/attachments columns,
// own Study/Costing/Order tags) — never the linked Style Card's.
import { ExplanationTab } from "../style-cards/[id]/_components/explanation-tab";
import { AttributesTab } from "../style-cards/[id]/_components/attributes-tab";
import { MeasurementChartTab } from "../style-cards/[id]/_components/measurement-chart-tab";
import { StudyTab } from "../style-cards/[id]/_components/study-tab";
import { BomTab } from "../style-cards/[id]/_components/bom-tab";
import { WashCareTab } from "../style-cards/[id]/_components/wash-care-tab";
import { OrderInfoTab } from "../style-cards/[id]/_components/order-info-tab";
import { CostTab } from "../style-cards/[id]/_components/cost-tab";
import { AttachmentsTab } from "../style-cards/[id]/_components/attachments-tab";
import { PictureGalleryTab } from "../style-cards/[id]/_components/picture-gallery-tab";
import { CustomizedFieldsTab } from "../style-cards/[id]/_components/customized-fields-tab";

// Sample Card detail — the REAL SampleCard model (plmApi.sampleCards), a genuinely separate,
// independent record type from StyleCard. Previously this screen silently edited a StyleCard
// instead (plmApi.styleCards.*) with borrowed BOM/Measurement/Wash&Care tabs that don't exist on
// SampleCard at all — fixed per the explicit business rule: Sample Card and Style Card must
// never behave like the same record. "Create Style Card" (below) is the only sanctioned way a
// Style Card is ever produced from here, and it always creates a brand-new, independent
// StyleCard — it never links back to or mutates this Sample Card.
//
// General tab rebuilt to match the legacy reference screenshot's field set (Brand/Department/
// Group Code/Gender/Category, Customer Info, Access/Special Code, Designer/Representative/
// Garment Wash-Dye) — the exact same fields/lookups Style Card's own general-tab.tsx already
// uses, now genuinely SampleCard-owned columns — plus the Master Size + Sizes[] + Colorways[]
// Colorway/Sizes Set widget (SelectSizesDialog + swatch-picker Colorways), replacing the old
// flat colorway/size text fields for that functionality. Sample Card's own fields (Sample Type,
// Status, Route, Quantity, Assigned To, Due Date, Cost, Currency, Description, Notes) stay
// alongside these, since Style Card's General tab has no equivalent for them.
const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in-progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

const TABS = [
  "General", "Explanation", "Attributes", "Measurement Chart", "Study", "BOM",
  "Wash & Care", "Order Info", "Cost", "Attachments", "Picture Gallery", "Customized Fields",
];

const emptyHeader = {
  title: "", description: "", sampleTypeId: "", season: "", year: "", status: "draft",
  colorway: "", size: "", quantity: "", assignedTo: "", dueDate: "", cost: "", currency: "PKR", notes: "",
  // "Route" — an existing RouteCard selected by name, id stored here. Does not load/copy that
  // Route's Processes (RouteCardLine) — a separate future task.
  routeCardId: "",
  // General tab parity with Style Card's own general-tab.tsx.
  brand: "", departmentId: "", groupCode: "", gender: "", category: "",
  customerId: "", customerStyleNo: "", contactPerson: "",
  accessCode: "", specialCode: "",
  designerId: "", representativeId: "", garmentWash: "", garmentDye: "",
  masterSize: "", sizes: [] as string[], colorways: [] as { swatchCardId: string; colorName: string; pantoneCode?: string }[],
};

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3 space-y-3">
      {title && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>}
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

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
  const [routeCards, setRouteCards] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("General");

  // General tab parity lookups — same sources Style Card's own general-tab.tsx already uses.
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [customerLabel, setCustomerLabel] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [colorwayPick, setColorwayPick] = useState<{ id: string; colorName: string; pantoneCode?: string; color?: string } | null>(null);
  const [sizesDialogOpen, setSizesDialogOpen] = useState(false);
  const [colorCards, setColorCards] = useState<{ id: string; code: string; name: string; color: string }[]>([]);
  const colorById = new Map(colorCards.map((c) => [String(c.id), c]));

  // Attachments — combined Document (SampleCard.attachments) + Picture (SampleCard.images)
  // list inline in General, matching the legacy reference screenshot. Independent of the
  // separate Attachments/Picture Gallery tabs (which read/write the same two columns) — both
  // surfaces stay in sync since they persist to the same fields, never a third copy.
  const [attachments, setAttachments] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);

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
        routeCardId: r.routeCardId || "",
        brand: r.brand || "", departmentId: r.departmentId || "", groupCode: r.groupCode || "",
        gender: r.gender || "", category: r.category || "",
        customerId: r.customerId || "", customerStyleNo: r.customerStyleNo || "", contactPerson: r.contactPerson || "",
        accessCode: r.accessCode || "", specialCode: r.specialCode || "",
        designerId: r.designerId || "", representativeId: r.representativeId || "",
        garmentWash: r.garmentWash || "", garmentDye: r.garmentDye || "",
        masterSize: r.masterSize || "", sizes: Array.isArray(r.sizes) ? r.sizes : [], colorways: Array.isArray(r.colorways) ? r.colorways : [],
      };
      setHeader(h);
      lastSavedRef.current = h;
      setRecordId(r.id);
      setCustomerLabel(r.customer?.name || "");
      setAttachments(Array.isArray(r.attachments) ? r.attachments : []);
      setImages(Array.isArray(r.images) ? r.images : []);
    } catch (e: any) {
      toast.error(e.message || "Could not load sample card");
    } finally {
      setLoading(false);
    }
  };

  const reloadCard = () => { if (recordId) load(recordId); };

  useEffect(() => {
    plmApi.sampleTypes.list().then((r: any) => setSampleTypes(Array.isArray(r) ? r : r?.data || [])).catch(() => setSampleTypes([]));
    plmApi.routeCards.list().then((r: any) => setRouteCards(Array.isArray(r) ? r : r?.data || [])).catch(() => setRouteCards([]));
    plmApi.departments.list().then((r: any) => setDepartments(Array.isArray(r) ? r : r?.data || [])).catch(() => setDepartments([]));
    plmApi.employees.list().then((r: any) => setEmployees(Array.isArray(r) ? r : r?.data || [])).catch(() => setEmployees([]));
    // No branchId filter — matches style-cards' own general-tab.tsx plmApi.colors.list() call.
    plmApi.colors.list().then((r: any) => setColorCards((Array.isArray(r) ? r : []).filter((c: any) => c.inUse !== false))).catch((e: any) => toast.error(e?.message || "Failed to load Color Cards"));
  }, []);

  useEffect(() => {
    if (isNew) return;
    load(initialId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setHeader((p) => ({ ...p, [k]: v }));

  const addSize = () => {
    const v = sizeInput.trim();
    if (!v) return;
    if (!header.sizes.includes(v)) set("sizes", [...header.sizes, v]);
    setSizeInput("");
  };
  const removeSize = (v: string) => set("sizes", header.sizes.filter((s: string) => s !== v));

  const addColorway = () => {
    if (!colorwayPick) return;
    if (header.colorways.some((c: any) => c.swatchCardId === colorwayPick.id)) return;
    set("colorways", [...header.colorways, { swatchCardId: colorwayPick.id, colorName: colorwayPick.colorName, pantoneCode: colorwayPick.pantoneCode }]);
    setColorwayPick(null);
  };
  const removeColorway = (swatchCardId: string) => set("colorways", header.colorways.filter((c: any) => c.swatchCardId !== swatchCardId));

  const employeeOptions = (t: string) =>
    Promise.resolve(employees.filter((e) => `${e.employeeNumber} ${e.name}`.toLowerCase().includes(t.toLowerCase())).map((e) => ({ id: e.id, code: e.employeeNumber, name: e.name })));

  // Persists straight to the server the moment a file is added/removed (same immediate-persist
  // convention AttachmentsTab/PictureGalleryTab already use for these same two columns) rather
  // than waiting for the General tab's own Save — an upload is its own action, not a form edit.
  const persistAttachments = async (next: any[]) => {
    setAttachments(next);
    try {
      await plmApi.sampleCards.update(recordId!, { attachments: next });
    } catch (e: any) {
      toast.error(e.message || "Failed to save attachments");
    }
  };
  const persistImages = async (next: any[]) => {
    setImages(next);
    try {
      await plmApi.sampleCards.update(recordId!, { images: next });
    } catch (e: any) {
      toast.error(e.message || "Failed to save picture gallery");
    }
  };
  const uploadDocument = async (file: File) => {
    setUploading(true);
    try {
      const user = getCurrentUser();
      const result = await uploadApi.uploadSingle(file, user?.id as any);
      const url = result.relativePath || result.url || `files/${result.type}/${result.name}`;
      await persistAttachments([...attachments, { id: `${Date.now()}`, name: file.name, type: file.type, url }]);
      toast.success("File uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const uploadPicture = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Only image files can be added to Pictures");
    setUploading(true);
    try {
      const user = getCurrentUser();
      const result = await uploadApi.uploadSingle(file, user?.id as any);
      const url = result.relativePath || result.url || `files/${result.type}/${result.name}`;
      await persistImages([...images, { id: `${Date.now()}`, name: file.name, type: file.type, url }]);
      toast.success("Picture added");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const onDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadDocument(file);
  };
  const onPictureSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadPicture(file);
  };
  const onPasteImage = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const file = new File([blob], `clipboard-${Date.now()}.${item.type.split("/")[1] || "png"}`, { type: item.type });
        await uploadPicture(file);
        return;
      }
    }
  };
  const removeAttachment = (id: string) => persistAttachments(attachments.filter((a) => a.id !== id));
  const removeImage = (id: string) => persistImages(images.filter((a) => a.id !== id));
  const attachmentUrl = (a: any) => (String(a.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a.url || "").replace(/^\//, "")}`);
  const combinedFiles = [
    ...attachments.map((a) => ({ ...a, kind: "Document" as const })),
    ...images.map((a) => ({ ...a, kind: "Picture" as const })),
  ];
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; type: string; kind: "Document" | "Picture" } | null>(null);

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
    // Explicit null (not undefined) so clearing these actually reaches the server — an
    // undefined key is dropped entirely by JSON.stringify and would leave the old value in place.
    routeCardId: header.routeCardId || null,
    brand: header.brand || undefined,
    departmentId: header.departmentId || null,
    groupCode: header.groupCode || undefined,
    gender: header.gender || undefined,
    category: header.category || undefined,
    customerId: header.customerId || null,
    customerStyleNo: header.customerStyleNo || undefined,
    contactPerson: header.contactPerson || undefined,
    accessCode: header.accessCode || undefined,
    specialCode: header.specialCode || undefined,
    designerId: header.designerId || null,
    representativeId: header.representativeId || null,
    garmentWash: header.garmentWash || undefined,
    garmentDye: header.garmentDye || undefined,
    masterSize: header.masterSize || undefined,
    sizes: header.sizes,
    colorways: header.colorways,
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
        setCustomerLabel(r.customer?.name || "");
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

  const saveRequired = (label: string) => (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>Save required</EmptyTitle>
        <EmptyDescription>Enter a Name and save the sample card first to manage {label.toLowerCase()}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  // Shared General-tab field JSX — identical whether the record already exists or is still
  // being created (Sample Card's own Name/Status/Sample Type/... fields double as the create
  // form itself, unlike Style Card's separate top-level Name field).
  const generalFormFields = (
    <>
      <FormSelectField label="Status" value={header.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} />
      <FormSelectField
        label="Sample Type"
        value={header.sampleTypeId}
        onChange={(v) => set("sampleTypeId", v)}
        options={sampleTypes.map((t) => ({ value: t.id, label: t.name }))}
      />
      <FieldText label="Year" type="number" value={header.year} onChange={(v) => set("year", v)} />

      {/* Existing RouteCard master, selected by name only — id stored on routeCardId. Plain
          native <select> (not FormSelectField) so a "—" option can fully clear the selection,
          matching the same "Route" picker on Style Card's BOM tab. Does not load/display that
          Route's Processes (RouteCardLine) — a separate future task. */}
      <div className={spanClass("normal")}>
        <FieldLabel>Route</FieldLabel>
        <select
          value={header.routeCardId}
          onChange={(e) => set("routeCardId", e.target.value)}
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="">—</option>
          {routeCards.map((rc) => <option key={rc.id} value={rc.id}>{rc.name}</option>)}
        </select>
      </div>
    </>
  );

  if (loading) {
    return <div className="mx-auto max-w-[1600px] p-6 lg:p-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <RowContextMenu actions={pageActions}>
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
        </TabsList>

        {!recordId ? (
          TABS.map((t) => (
            <TabsContent key={t} value={t} className="pt-4">
              {t === "General" ? (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 lg:col-span-7 space-y-3">
                    <FormGrid>
                      <div className={spanClass("normal")}>
                        <FieldLabel>Code</FieldLabel>
                        <InputGroup className="h-9">
                          <InputGroupInput value="Generated on Save" disabled readOnly className="text-sm text-muted-foreground" />
                        </InputGroup>
                      </div>
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
                      {generalFormFields}
                    </FormGrid>

                    <Section>
                      <MasterAutocompleteField label="Brand" masterKey="brand" displayValue={header.brand || ""}
                        fetchOptions={(t) => plmApi.brands.list({ search: t }) as Promise<any[]>}
                        lookupPath="/dashboard/plm/general-definitions/brand-cards"
                        onSelect={(o) => set("brand", o.code)} onClear={() => set("brand", "")} />
                      <MasterAutocompleteField label="Season" masterKey="season" displayValue={header.season || ""}
                        fetchOptions={(t) => plmApi.seasons.list({ search: t }) as Promise<any[]>}
                        lookupPath="/dashboard/plm/general-definitions/season-cards"
                        onSelect={(o) => set("season", o.code)} onClear={() => set("season", "")} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Department</Label>
                        <Select value={header.departmentId} onValueChange={(v) => set("departmentId", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                          <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <MasterAutocompleteField label="Gender" masterKey="gender" displayValue={header.gender || ""}
                        fetchOptions={(t) => plmApi.genders.list({ search: t }) as Promise<any[]>}
                        lookupPath="/dashboard/plm/general-definitions/gender-cards"
                        onSelect={(o) => set("gender", o.code)} onClear={() => set("gender", "")} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Group Code</Label>
                        <Input className="h-8 text-sm" value={header.groupCode} onChange={(e) => set("groupCode", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Category</Label>
                        <Input className="h-8 text-sm" value={header.category} onChange={(e) => set("category", e.target.value)} />
                      </div>
                    </Section>

                    <Section title="Customer Info">
                      <MasterAutocompleteField
                        label="Customer" masterKey="customer" displayValue={customerLabel}
                        fetchOptions={(t) => customerApi.getCustomers({ search: t }).then((r: any) => (Array.isArray(r) ? r : r?.data || []).map((c: any) => ({ id: c.id, name: c.name })))}
                        lookupPath="/dashboard/crm/customers"
                        onSelect={(o) => { set("customerId", String(o.id)); setCustomerLabel(o.name); }}
                        onClear={() => { set("customerId", ""); setCustomerLabel(""); }}
                      />
                      <div />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Customer Style No</Label>
                        <Input className="h-8 text-sm" value={header.customerStyleNo} onChange={(e) => set("customerStyleNo", e.target.value)} />
                      </div>
                      <MasterAutocompleteField label="Contact Person" masterKey="contact-person" displayValue={header.contactPerson || ""}
                        fetchOptions={employeeOptions}
                        lookupPath="/dashboard/plm/general-definitions/employee-cards"
                        onSelect={(o) => set("contactPerson", o.name)} onClear={() => set("contactPerson", "")}
                        onFreeTextCommit={(text) => set("contactPerson", text)} />
                    </Section>

                    <Section>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Access Code</Label>
                        <Input className="h-8 text-sm" value={header.accessCode} onChange={(e) => set("accessCode", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Special Code</Label>
                        <Input className="h-8 text-sm" value={header.specialCode} onChange={(e) => set("specialCode", e.target.value)} />
                      </div>
                    </Section>

                    <Section>
                      <MasterAutocompleteField label="Designer" masterKey="designer" displayValue={employees.find((e) => e.id === header.designerId)?.name || ""}
                        fetchOptions={employeeOptions}
                        lookupPath="/dashboard/plm/general-definitions/employee-cards"
                        onSelect={(o) => set("designerId", String(o.id))} onClear={() => set("designerId", "")} />
                      <MasterAutocompleteField label="Representative" masterKey="representative" displayValue={employees.find((e) => e.id === header.representativeId)?.name || ""}
                        fetchOptions={employeeOptions}
                        lookupPath="/dashboard/plm/general-definitions/employee-cards"
                        onSelect={(o) => set("representativeId", String(o.id))} onClear={() => set("representativeId", "")} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Garment Wash</Label>
                        <Input className="h-8 text-sm" value={header.garmentWash} onChange={(e) => set("garmentWash", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Garment Dye</Label>
                        <Input className="h-8 text-sm" value={header.garmentDye} onChange={(e) => set("garmentDye", e.target.value)} />
                      </div>
                    </Section>

                    <div className={spanClass("wide")}>
                      <FieldLabel>Description</FieldLabel>
                      <Textarea value={header.description} onChange={(e) => set("description", e.target.value)} rows={2} />
                    </div>
                    <div className={spanClass("wide")}>
                      <FieldLabel>Notes</FieldLabel>
                      <Textarea value={header.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-5 space-y-3">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Attachments</CardTitle></CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground py-2">Save the sample card first to add documents or pictures.</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Colorway / Sizes</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Master Size</Label>
                          <Input className="h-8 text-sm w-32" value={header.masterSize} onChange={(e) => set("masterSize", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sizes</Label>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {header.sizes.map((s: string) => (
                              <Badge key={s} variant="secondary" className="gap-1">
                                {s}
                                <button onClick={() => removeSize(s)}><X className="h-3 w-3" /></button>
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <Input className="h-8 text-sm" placeholder="e.g. 2Y" value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize())} />
                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addSize} title="Add typed size"><Plus className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setSizesDialogOpen(true)}><Ruler className="h-3.5 w-3.5 mr-1" />Select Sizes</Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Colorways</Label>
                          <div className="space-y-1 mb-1.5">
                            {header.colorways.map((c: any) => {
                              const cached = colorById.get(String(c.swatchCardId));
                              return (
                                <div key={c.swatchCardId} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1">
                                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ backgroundColor: cached?.color || "#e5e7eb" }} />
                                  <span className="flex-1">{c.colorName}{c.pantoneCode ? ` — ${c.pantoneCode}` : ""}</span>
                                  <button onClick={() => removeColorway(c.swatchCardId)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex gap-1.5 items-start">
                            <div className="h-8 w-8 shrink-0 rounded-md border" style={{ backgroundColor: colorwayPick?.color || "transparent" }} title={colorwayPick ? colorwayPick.colorName : "No color selected"} />
                            <div className="flex-1">
                              <MasterAutocompleteField label="Colourway" compact masterKey="colourway"
                                displayValue={colorwayPick ? colorwayPick.colorName + (colorwayPick.pantoneCode ? ` — ${colorwayPick.pantoneCode}` : "") : ""}
                                fetchOptions={(t) => {
                                  const term = t.trim().toLowerCase();
                                  const matches = term ? colorCards.filter((c) => c.code?.toLowerCase().includes(term) || c.name?.toLowerCase().includes(term)) : colorCards;
                                  return Promise.resolve(matches.map((c) => ({ id: c.id, code: c.code, name: c.code && c.code.trim().toLowerCase() !== c.name.trim().toLowerCase() ? `${c.name} — ${c.code}` : c.name })));
                                }}
                                lookupPath="/dashboard/plm/general-definitions/color-cards"
                                renderOption={(o) => {
                                  const cached = colorById.get(String(o.id));
                                  return <span className="flex min-w-0 items-center gap-2"><span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ backgroundColor: cached?.color || "#e5e7eb" }} /><span className="truncate">{o.name}</span></span>;
                                }}
                                onSelect={(o) => {
                                  const cached = colorById.get(String(o.id));
                                  const code = cached?.code && cached.code.trim().toLowerCase() !== cached.name?.trim().toLowerCase() ? cached.code : undefined;
                                  setColorwayPick({ id: String(o.id), colorName: cached?.name ?? o.name, pantoneCode: code, color: cached?.color });
                                }}
                                onClear={() => setColorwayPick(null)} />
                            </div>
                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addColorway} disabled={!colorwayPick}><Plus className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                saveRequired(t)
              )}
            </TabsContent>
          ))
        ) : (
          <>
            <TabsContent value="General" className="pt-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 lg:col-span-7 space-y-3">
                  <FormGrid>
                    <div className={spanClass("normal")}>
                      <FieldLabel>Code</FieldLabel>
                      <InputGroup className="h-9">
                        <InputGroupInput value={card?.sampleNumber} disabled readOnly className="text-sm text-muted-foreground" />
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
                      {generalFormFields}
                    </fieldset>
                  </FormGrid>

                  <fieldset disabled={readOnly} className="contents">
                    <Section>
                      <MasterAutocompleteField label="Brand" masterKey="brand" displayValue={header.brand || ""}
                        fetchOptions={(t) => plmApi.brands.list({ search: t }) as Promise<any[]>}
                        lookupPath="/dashboard/plm/general-definitions/brand-cards"
                        onSelect={(o) => set("brand", o.code)} onClear={() => set("brand", "")} />
                      <MasterAutocompleteField label="Season" masterKey="season" displayValue={header.season || ""}
                        fetchOptions={(t) => plmApi.seasons.list({ search: t }) as Promise<any[]>}
                        lookupPath="/dashboard/plm/general-definitions/season-cards"
                        onSelect={(o) => set("season", o.code)} onClear={() => set("season", "")} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Department</Label>
                        <Select value={header.departmentId} onValueChange={(v) => set("departmentId", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                          <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <MasterAutocompleteField label="Gender" masterKey="gender" displayValue={header.gender || ""}
                        fetchOptions={(t) => plmApi.genders.list({ search: t }) as Promise<any[]>}
                        lookupPath="/dashboard/plm/general-definitions/gender-cards"
                        onSelect={(o) => set("gender", o.code)} onClear={() => set("gender", "")} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Group Code</Label>
                        <Input className="h-8 text-sm" value={header.groupCode} onChange={(e) => set("groupCode", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Category</Label>
                        <Input className="h-8 text-sm" value={header.category} onChange={(e) => set("category", e.target.value)} />
                      </div>
                    </Section>

                    <Section title="Customer Info">
                      <MasterAutocompleteField
                        label="Customer" masterKey="customer" displayValue={customerLabel}
                        fetchOptions={(t) => customerApi.getCustomers({ search: t }).then((r: any) => (Array.isArray(r) ? r : r?.data || []).map((c: any) => ({ id: c.id, name: c.name })))}
                        lookupPath="/dashboard/crm/customers"
                        onSelect={(o) => { set("customerId", String(o.id)); setCustomerLabel(o.name); }}
                        onClear={() => { set("customerId", ""); setCustomerLabel(""); }}
                      />
                      <div />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Customer Style No</Label>
                        <Input className="h-8 text-sm" value={header.customerStyleNo} onChange={(e) => set("customerStyleNo", e.target.value)} />
                      </div>
                      <MasterAutocompleteField label="Contact Person" masterKey="contact-person" displayValue={header.contactPerson || ""}
                        fetchOptions={employeeOptions}
                        lookupPath="/dashboard/plm/general-definitions/employee-cards"
                        onSelect={(o) => set("contactPerson", o.name)} onClear={() => set("contactPerson", "")}
                        onFreeTextCommit={(text) => set("contactPerson", text)} />
                    </Section>

                    <Section>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Access Code</Label>
                        <Input className="h-8 text-sm" value={header.accessCode} onChange={(e) => set("accessCode", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Special Code</Label>
                        <Input className="h-8 text-sm" value={header.specialCode} onChange={(e) => set("specialCode", e.target.value)} />
                      </div>
                    </Section>

                    <Section>
                      <MasterAutocompleteField label="Designer" masterKey="designer" displayValue={employees.find((e) => e.id === header.designerId)?.name || ""}
                        fetchOptions={employeeOptions}
                        lookupPath="/dashboard/plm/general-definitions/employee-cards"
                        onSelect={(o) => set("designerId", String(o.id))} onClear={() => set("designerId", "")} />
                      <MasterAutocompleteField label="Representative" masterKey="representative" displayValue={employees.find((e) => e.id === header.representativeId)?.name || ""}
                        fetchOptions={employeeOptions}
                        lookupPath="/dashboard/plm/general-definitions/employee-cards"
                        onSelect={(o) => set("representativeId", String(o.id))} onClear={() => set("representativeId", "")} />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Garment Wash</Label>
                        <Input className="h-8 text-sm" value={header.garmentWash} onChange={(e) => set("garmentWash", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Garment Dye</Label>
                        <Input className="h-8 text-sm" value={header.garmentDye} onChange={(e) => set("garmentDye", e.target.value)} />
                      </div>
                    </Section>

                    <div className={spanClass("wide")}>
                      <FieldLabel>Description</FieldLabel>
                      <Textarea value={header.description} onChange={(e) => set("description", e.target.value)} rows={2} />
                    </div>
                    <div className={spanClass("wide")}>
                      <FieldLabel>Notes</FieldLabel>
                      <Textarea value={header.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
                    </div>
                  </fieldset>
                </div>

                <div className="col-span-12 lg:col-span-5 space-y-3">
                  <Card>
                    <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                      <CardTitle className="text-sm">Attachments</CardTitle>
                      {!readOnly && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-3.5 w-3.5 mr-1" />Add New Document
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => pictureInputRef.current?.click()}>
                            <ClipboardPaste className="h-3.5 w-3.5 mr-1" />Add Picture from Clipboard
                          </Button>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" className="hidden" onChange={onDocumentSelected} />
                      <input ref={pictureInputRef} type="file" accept="image/*" className="hidden" onChange={onPictureSelected} />
                    </CardHeader>
                    <CardContent className="flex gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        {!readOnly && (
                          <div
                            ref={pasteZoneRef}
                            tabIndex={0}
                            onPaste={onPasteImage}
                            className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                            title="Click here, then paste (Ctrl+V) an image from your clipboard"
                          >
                            <ClipboardPaste className="h-3 w-3 shrink-0" />
                            {uploading ? "Uploading..." : "Click, then Ctrl+V to paste a picture"}
                          </div>
                        )}
                        {!combinedFiles.length ? (
                          <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground py-6">
                            <ImageOff className="h-4 w-4" />
                            <p className="text-xs">No attachments yet</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {combinedFiles.map((a) => (
                              <div
                                key={`${a.kind}-${a.id}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => (a.kind === "Picture" ? setPreviewFile(a) : window.open(attachmentUrl(a), "_blank", "noopener,noreferrer"))}
                                onKeyDown={(e) => e.key === "Enter" && (a.kind === "Picture" ? setPreviewFile(a) : window.open(attachmentUrl(a), "_blank", "noopener,noreferrer"))}
                                className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-accent/50"
                              >
                                {a.kind === "Picture" ? <ImageOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{a.kind}</p>
                                  <p className="truncate">{a.name}</p>
                                </div>
                                {!readOnly && (
                                  <button onClick={(e) => { e.stopPropagation(); a.kind === "Picture" ? removeImage(a.id) : removeAttachment(a.id); }}>
                                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="w-20 shrink-0">
                        {images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={attachmentUrl(images[0])}
                            alt={images[0].name}
                            onClick={() => setPreviewFile({ ...images[0], kind: "Picture" })}
                            className="h-24 w-20 cursor-pointer rounded-md border object-cover"
                          />
                        ) : (
                          <div className="flex h-24 w-20 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                            <ImageOff className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Colorway / Sizes</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Master Size</Label>
                        <Input className="h-8 text-sm w-32" value={header.masterSize} onChange={(e) => set("masterSize", e.target.value)} disabled={readOnly} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Sizes</Label>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {header.sizes.map((s: string) => (
                            <Badge key={s} variant="secondary" className="gap-1">
                              {s}
                              {!readOnly && <button onClick={() => removeSize(s)}><X className="h-3 w-3" /></button>}
                            </Badge>
                          ))}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1.5">
                            <Input className="h-8 text-sm" placeholder="e.g. 2Y" value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize())} />
                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addSize} title="Add typed size"><Plus className="h-4 w-4" /></Button>
                            <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setSizesDialogOpen(true)}><Ruler className="h-3.5 w-3.5 mr-1" />Select Sizes</Button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Colorways</Label>
                        <div className="space-y-1 mb-1.5">
                          {header.colorways.map((c: any) => {
                            const cached = colorById.get(String(c.swatchCardId));
                            return (
                              <div key={c.swatchCardId} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1">
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ backgroundColor: cached?.color || "#e5e7eb" }} />
                                <span className="flex-1">{c.colorName}{c.pantoneCode ? ` — ${c.pantoneCode}` : ""}</span>
                                {!readOnly && <button onClick={() => removeColorway(c.swatchCardId)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
                              </div>
                            );
                          })}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1.5 items-start">
                            <div className="h-8 w-8 shrink-0 rounded-md border" style={{ backgroundColor: colorwayPick?.color || "transparent" }} title={colorwayPick ? colorwayPick.colorName : "No color selected"} />
                            <div className="flex-1">
                              <MasterAutocompleteField label="Colourway" compact masterKey="colourway"
                                displayValue={colorwayPick ? colorwayPick.colorName + (colorwayPick.pantoneCode ? ` — ${colorwayPick.pantoneCode}` : "") : ""}
                                fetchOptions={(t) => {
                                  const term = t.trim().toLowerCase();
                                  const matches = term ? colorCards.filter((c) => c.code?.toLowerCase().includes(term) || c.name?.toLowerCase().includes(term)) : colorCards;
                                  return Promise.resolve(matches.map((c) => ({ id: c.id, code: c.code, name: c.code && c.code.trim().toLowerCase() !== c.name.trim().toLowerCase() ? `${c.name} — ${c.code}` : c.name })));
                                }}
                                lookupPath="/dashboard/plm/general-definitions/color-cards"
                                renderOption={(o) => {
                                  const cached = colorById.get(String(o.id));
                                  return <span className="flex min-w-0 items-center gap-2"><span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ backgroundColor: cached?.color || "#e5e7eb" }} /><span className="truncate">{o.name}</span></span>;
                                }}
                                onSelect={(o) => {
                                  const cached = colorById.get(String(o.id));
                                  const code = cached?.code && cached.code.trim().toLowerCase() !== cached.name?.trim().toLowerCase() ? cached.code : undefined;
                                  setColorwayPick({ id: String(o.id), colorName: cached?.name ?? o.name, pantoneCode: code, color: cached?.color });
                                }}
                                onClear={() => setColorwayPick(null)} />
                            </div>
                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addColorway} disabled={!colorwayPick}><Plus className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="Explanation" className="pt-4">
              <ExplanationTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Attributes" className="pt-4">
              <AttributesTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Measurement Chart" className="pt-4">
              <MeasurementChartTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Study" className="pt-4">
              <StudyTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="BOM" className="pt-4">
              <BomTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Wash & Care" className="pt-4">
              <WashCareTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Order Info" className="pt-4">
              <OrderInfoTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Cost" className="pt-4">
              <CostTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Attachments" className="pt-4">
              <AttachmentsTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Picture Gallery" className="pt-4">
              <PictureGalleryTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
            <TabsContent value="Customized Fields" className="pt-4">
              <CustomizedFieldsTab sampleCardId={recordId} card={card} onReloadCard={reloadCard} />
            </TabsContent>
          </>
        )}
      </Tabs>

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

      {/* Picture click opens this full-size image popup in one step, same as Style Card's own
          Picture Gallery. Document click bypasses this entirely — it opens the file directly in
          a new tab (arbitrary file types can't be rendered inline as a popup), same one-click
          feel as a Picture, no intermediate "can't preview" step. */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachmentUrl(previewFile)} alt={previewFile.name} className="max-h-[70vh] w-full rounded-md border object-contain" />
          )}
        </DialogContent>
      </Dialog>

      <SelectSizesDialog
        open={sizesDialogOpen}
        onOpenChange={setSizesDialogOpen}
        sampleCardId={recordId || undefined}
        currentSizes={header.sizes || []}
        onSaved={reloadCard}
      />
    </div>
    </RowContextMenu>
  );
}
