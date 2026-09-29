"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { bpmApi, entitySchemaApi } from "@/lib/api";
import { customEntityPageApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import {
  RefreshCw, Tags, Search, Plus, MoreHorizontal, Pencil, Trash2,
  Loader2, Lock, Unlock, X, ChevronDown,
} from "lucide-react";

// The stored user's companyId/branchId are backend UUID strings, although lib/auth.ts's User type
// declares them as numbers; the API helpers skip empty values, so null and undefined are equivalent.
const scopeIds = () => {
  const user = getCurrentUser();
  return {
    companyId: user?.companyId != null ? String(user.companyId) : undefined,
    branchId: user?.branchId != null ? String(user.branchId) : undefined,
  };
};

// ── Entity groups ──────────────────────────────────────────────────────────────
const ENTITY_GROUPS: { group: string; entities: { value: string; label: string }[] }[] = [
  { group: "CRM & Sales", entities: [
    { value: "Lead", label: "Lead" }, { value: "Deal", label: "Deal" },
    { value: "Contact", label: "Contact" }, { value: "Company", label: "Company" },
    { value: "Customer", label: "Customer" }, { value: "Supplier", label: "Supplier" },
    { value: "DealPipeline", label: "Deal Pipeline" }, { value: "PipelineStage", label: "Pipeline Stage" },
    { value: "Source", label: "Source" }, { value: "LeadStage", label: "Lead Stage" },
  ]},
  { group: "Finance", entities: [
    { value: "Invoice", label: "Invoice" }, { value: "Order", label: "Order" },
    { value: "OrderItem", label: "Order Item" }, { value: "OrderReturn", label: "Order Return" },
    { value: "CustomerPayment", label: "Customer Payment" }, { value: "SupplierPayment", label: "Supplier Payment" },
    { value: "Tax", label: "Tax" }, { value: "Currency", label: "Currency" },
    { value: "InvoiceStage", label: "Invoice Stage" }, { value: "EstimateStage", label: "Estimate Stage" },
  ]},
  { group: "Products & Inventory", entities: [
    { value: "Product", label: "Product" }, { value: "ProductCategory", label: "Product Category" },
    { value: "ProductSubCategory", label: "Product Sub-Category" },
    { value: "ProductProperty", label: "Product Property" }, { value: "UnitOfMeasurement", label: "Unit of Measurement" },
  ]},
  { group: "Users & Access", entities: [
    { value: "User", label: "User" }, { value: "Role", label: "Role" },
    { value: "Permission", label: "Permission" }, { value: "Employee", label: "Employee" },
    { value: "Branch", label: "Branch" },
  ]},
  { group: "Projects & Tasks", entities: [
    { value: "Project", label: "Project" }, { value: "ProjectMember", label: "Project Member" },
    { value: "Todo", label: "Todo" }, { value: "CalendarEvent", label: "Calendar Event" },
    { value: "Reminder", label: "Reminder" },
  ]},
  { group: "BPM", entities: [
    { value: "BpmProcess", label: "BPM Process" }, { value: "BpmTask", label: "BPM Task" },
    { value: "BpmRequestType", label: "BPM Request Type" }, { value: "BusinessProcess", label: "Business Process" },
  ]},
  { group: "PLM — Definitions", entities: [
    { value: "StyleCard", label: "Style Card" }, { value: "SampleCard", label: "Sample Card" },
    { value: "MoodBoard", label: "Mood Board" }, { value: "SwatchCard", label: "Swatch Card" },
    { value: "ProductCard", label: "Product Card" }, { value: "StyleSampleType", label: "Style Sample Type" },
    { value: "DesignDetailType", label: "Design Detail Type" },
  ]},
  { group: "PLM — Measurements", entities: [
    { value: "MeasurementDefinition", label: "Measurement Definition" },
    { value: "MeasurementChart", label: "Measurement Chart" },
    { value: "MeasurementChartLine", label: "Measurement Chart Line" },
  ]},
  { group: "PLM — Organisation", entities: [
    { value: "DepartmentCard", label: "Department Card" }, { value: "ProcessCard", label: "Process Card" },
    { value: "EmployeeCard", label: "Employee Card" }, { value: "ResourceCard", label: "Resource Card" },
    { value: "StudyTemplateCard", label: "Study Template Card" },
  ]},
  { group: "PLM — Operations", entities: [
    { value: "PlmOrder", label: "PLM Order" }, { value: "PlmTask", label: "PLM Task" },
    { value: "PlmDocument", label: "PLM Document" }, { value: "CriticalPath", label: "Critical Path" },
    { value: "CriticalPathTask", label: "Critical Path Task" }, { value: "PlmTemplate", label: "PLM Template" },
  ]},
  { group: "Manufacturing", entities: [
    { value: "FabricType", label: "Fabric Type" }, { value: "FabricRoll", label: "Fabric Roll" },
    { value: "CuttingOrder", label: "Cutting Order" }, { value: "CuttingBatch", label: "Cutting Batch" },
    { value: "CuttingOrderLine", label: "Cutting Order Line" }, { value: "MarkerPlan", label: "Marker Plan" },
    { value: "Shift", label: "Shift" },
  ]},
  { group: "Collaboration", entities: [
    { value: "Note", label: "Note" }, { value: "FeedPost", label: "Feed Post" },
    { value: "Collab", label: "Collab" }, { value: "WorkGroup", label: "Work Group" },
    { value: "Chat", label: "Chat" }, { value: "ChatMessage", label: "Chat Message" },
    { value: "RichDocument", label: "Online Document" },
  ]},
  { group: "Forms & Templates", entities: [
    { value: "FormTemplate", label: "Form Template" }, { value: "FormSection", label: "Form Section" },
    { value: "FormField", label: "Form Field" }, { value: "EntityData", label: "Entity Data" },
  ]},
  { group: "E-commerce & POS", entities: [
    { value: "TableCategory", label: "Table Category" }, { value: "RestaurantTable", label: "Restaurant Table" },
  ]},
  { group: "Files & Media", entities: [
    { value: "Folder", label: "Folder" }, { value: "MediaFile", label: "Media File" },
  ]},
  { group: "System", entities: [
    { value: "LoginHistory", label: "Login History" }, { value: "AuditLog", label: "Audit Log" },
    { value: "ExceptionLog", label: "Exception Log" }, { value: "Notification", label: "Notification" },
    { value: "SystemSetting", label: "System Setting" }, { value: "AutoNumbering", label: "Auto Numbering" },
    { value: "ReportTemplate", label: "Report Template" }, { value: "PdfReport", label: "PDF Report" },
  ]},
];

const ENTITY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ENTITY_GROUPS.flatMap((g) => g.entities.map((e) => [e.value, e.label]))
);

const FIELD_TYPES = ["text", "email", "phone", "number", "textarea", "select", "date", "boolean", "url", "image", "relation"];

const TYPE_BADGE: Record<string, string> = {
  text: "bg-blue-100 text-blue-700", email: "bg-indigo-100 text-indigo-700",
  phone: "bg-cyan-100 text-cyan-700", number: "bg-amber-100 text-amber-700",
  textarea: "bg-purple-100 text-purple-700", select: "bg-pink-100 text-pink-700",
  date: "bg-green-100 text-green-700", boolean: "bg-teal-100 text-teal-700",
  url: "bg-sky-100 text-sky-700", image: "bg-rose-100 text-rose-700",
  relation: "bg-orange-100 text-orange-700",
};

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#ef4444", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];
const ICON_OPTIONS = ["FileText", "ClipboardList", "Workflow", "Tag", "Layers", "Box", "Settings", "AlertCircle", "CheckCircle", "Users"];

const encodeCustom = (name: string) => `CUSTOM:${name}`;
const isCustomEncoded = (v: string) => v.startsWith("CUSTOM:");
const decodeCustomName = (v: string) => v.slice(7);

const emptyForm = {
  name: "", description: "", color: "#3b82f6", icon: "FileText",
  prefix: "", entityValue: "", manualCustomName: "", processId: "", slaDays: "", isActive: true,
};

const emptyNewField = { name: "", label: "", type: "text", required: false, options: "" };

type FormState = typeof emptyForm;
type RequestType = any;

export default function BpmRequestTypesPage() {
  const [data, setData]               = useState<RequestType[]>([]);
  const [processes, setProcesses]     = useState<any[]>([]);
  const [customPages, setCustomPages] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<RequestType | null>(null);
  const [form, setForm]               = useState<FormState>(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // Entity schema
  const [schema, setSchema]           = useState<{ defaultFields: any[]; customFields: any[] } | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [newField, setNewField]       = useState(emptyNewField);
  const [addingField, setAddingField] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const schemaEntityRef               = useRef<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { companyId, branchId } = scopeIds();
      const [rt, proc, pages]: any = await Promise.all([
        bpmApi.requestTypes.list(companyId, branchId),
        bpmApi.processes.list(),
        customEntityPageApi.getCustomEntityPages(companyId, branchId).catch(() => []),
      ]);
      setData(Array.isArray(rt) ? rt : []);
      const procList = proc?.data ?? proc;
      setProcesses(Array.isArray(procList) ? procList : []);
      setCustomPages(Array.isArray(pages) ? pages.filter((p: any) => p.isActive) : []);
    } catch { setData([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSchema = useCallback(async (entityName: string) => {
    if (!entityName || entityName === schemaEntityRef.current) return;
    schemaEntityRef.current = entityName;
    setSchemaLoading(true);
    setSchema(null);
    try {
      const s: any = await entitySchemaApi.getSchema(entityName);
      setSchema(s);
    } catch { setSchema({ defaultFields: [], customFields: [] }); }
    finally { setSchemaLoading(false); }
  }, []);

  // Resolve the actual entity name from the encoded select value
  const resolvedEntityName = (() => {
    const v = form.entityValue;
    if (!v || v === "__none__" || v === "CUSTOM_MANUAL") return "";
    if (isCustomEncoded(v)) return decodeCustomName(v);
    return v;
  })();

  useEffect(() => {
    if (dialogOpen && resolvedEntityName) {
      loadSchema(resolvedEntityName);
    } else if (!dialogOpen) {
      schemaEntityRef.current = "";
      setSchema(null);
    }
  }, [dialogOpen, resolvedEntityName, loadSchema]);

  const entityValueFromRecord = (rt: RequestType): string => {
    if (!rt.entityType) return "";
    if (rt.entityType === "CUSTOM" && rt.customEntityName) return encodeCustom(rt.customEntityName);
    if (rt.entityType === "CUSTOM") return "CUSTOM_MANUAL";
    return rt.entityType;
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setNewField(emptyNewField); setDialogOpen(true); };
  const openEdit   = (rt: RequestType) => {
    setEditing(rt);
    setForm({ name: rt.name ?? "", description: rt.description ?? "", color: rt.color ?? "#3b82f6",
      icon: rt.icon ?? "FileText", prefix: rt.prefix ?? "", entityValue: entityValueFromRecord(rt),
      manualCustomName: "", processId: rt.processId ?? "",
      slaDays: rt.slaDays != null ? String(rt.slaDays) : "", isActive: rt.isActive ?? true });
    setNewField(emptyNewField);
    setDialogOpen(true);
  };

  const resolveEntity = () => {
    const v = form.entityValue;
    if (!v || v === "__none__") return { entityType: undefined, customEntityName: undefined };
    if (isCustomEncoded(v)) return { entityType: "CUSTOM", customEntityName: decodeCustomName(v) };
    if (v === "CUSTOM_MANUAL") return { entityType: "CUSTOM", customEntityName: form.manualCustomName || undefined };
    return { entityType: v, customEntityName: undefined };
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const user = getCurrentUser();
      const { entityType, customEntityName } = resolveEntity();
      const payload: any = {
        name: form.name.trim(), description: form.description || undefined,
        color: form.color || undefined, icon: form.icon || undefined,
        prefix: form.prefix || undefined, entityType, customEntityName,
        processId: form.processId || undefined,
        slaDays: form.slaDays ? parseInt(form.slaDays) : undefined, isActive: form.isActive,
      };
      if (!editing) { payload.companyId = user?.companyId; payload.branchId = user?.branchId; }
      if (editing) { await bpmApi.requestTypes.update(editing.id, payload); toast.success("Updated"); }
      else { await bpmApi.requestTypes.create(payload); toast.success("Created"); }
      setDialogOpen(false); load();
    } catch (e: any) { toast.error(e.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleAddCustomField = async () => {
    if (!newField.name.trim()) { toast.error("Field name is required"); return; }
    if (!resolvedEntityName) { toast.error("Select an entity first"); return; }
    setAddingField(true);
    try {
      const options = newField.type === "select" && newField.options
        ? newField.options.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
      const created: any = await entitySchemaApi.addCustomField({
        entity: resolvedEntityName, name: newField.name.trim(),
        label: newField.label || newField.name.trim(),
        type: newField.type, required: newField.required,
        options, ...scopeIds(),
      });
      setSchema((prev) => prev ? { ...prev, customFields: [...prev.customFields, created] } : prev);
      setNewField(emptyNewField);
      toast.success("Custom field added");
    } catch (e: any) { toast.error(e.message || "Failed to add field"); }
    finally { setAddingField(false); }
  };

  const handleDeleteCustomField = async (id: string) => {
    setDeletingFieldId(id);
    try {
      await entitySchemaApi.deleteCustomField(id);
      setSchema((prev) => prev ? { ...prev, customFields: prev.customFields.filter((f) => f.id !== id) } : prev);
      toast.success("Field removed");
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setDeletingFieldId(null); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await bpmApi.requestTypes.remove(id);
      toast.success("Deleted");
      setData((prev) => prev.filter((rt) => rt.id !== id));
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setDeletingId(null); }
  };

  const set = (field: keyof FormState, value: any) => setForm((prev) => ({ ...prev, [field]: value }));
  const setNF = (field: keyof typeof emptyNewField, value: any) => setNewField((prev) => ({ ...prev, [field]: value }));

  const entityDisplayLabel = (rt: RequestType) => {
    if (!rt.entityType) return "—";
    if (rt.entityType === "CUSTOM") return rt.customEntityName ? `Custom: ${rt.customEntityName}` : "Custom Entity";
    return ENTITY_LABEL_MAP[rt.entityType] ?? rt.entityType;
  };

  const filtered = data.filter((rt) => !search || rt.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Request Types</h1>
            <p className="text-xs text-muted-foreground">Define and manage business process request categories</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Type</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search request types..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Entity</TableHead><TableHead>Process</TableHead>
              <TableHead>Prefix</TableHead><TableHead>SLA</TableHead><TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No request types yet.</TableCell></TableRow>
            ) : filtered.map((rt) => (
              <TableRow key={rt.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: rt.color || "#94a3b8" }} />
                    <div>
                      <p className="font-medium text-sm">{rt.name}</p>
                      {rt.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{rt.description}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{entityDisplayLabel(rt)}</TableCell>
                <TableCell className="text-sm">{rt.process?.name ?? "—"}</TableCell>
                <TableCell>{rt.prefix ? <Badge variant="outline" className="font-mono text-xs">{rt.prefix}</Badge> : "—"}</TableCell>
                <TableCell className="text-sm">{rt.slaDays ? `${rt.slaDays}d` : "—"}</TableCell>
                <TableCell><Badge variant={rt.isActive ? "default" : "outline"}>{rt.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={deletingId === rt.id}>
                        {deletingId === rt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(rt)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(rt.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Request Type" : "Add Request Type"}</DialogTitle>
            <DialogDescription>
              Map this request type to a database entity. Define default and custom fields that will be available in Form Designer templates.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
              <TabsTrigger value="fields" className="flex-1">
                Entity Fields
                {resolvedEntityName && schema && (
                  <Badge variant="secondary" className="ml-1.5 text-xs">
                    {schema.defaultFields.length + schema.customFields.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Details tab ────────────────────────────────────────────── */}
            <TabsContent value="details" className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Leave Request" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => set("color", c)}
                      className="h-6 w-6 rounded-full border-2 transition-all"
                      style={{ backgroundColor: c, borderColor: form.color === c ? "white" : "transparent", boxShadow: form.color === c ? `0 0 0 2px ${c}` : "none" }}
                    />
                  ))}
                  <input type="color" value={form.color} onChange={(e) => set("color", e.target.value)}
                    className="h-6 w-6 rounded cursor-pointer border-0 p-0" />
                  <span className="text-xs text-muted-foreground font-mono">{form.color}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Short description" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Prefix</Label>
                  <Input placeholder="e.g. LRQ" maxLength={10} value={form.prefix}
                    onChange={(e) => set("prefix", e.target.value.toUpperCase())} className="font-mono" />
                  <p className="text-xs text-muted-foreground">Auto-numbering (LRQ-001)</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Icon</Label>
                  <Select value={form.icon || "__none__"} onValueChange={(v) => set("icon", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select icon" /></SelectTrigger>
                    <SelectContent className="w-full">
                      <SelectItem value="__none__">— None —</SelectItem>
                      {ICON_OPTIONS.map((ic) => <SelectItem key={ic} value={ic}>{ic}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Entity mapping */}
              <div className="space-y-1.5">
                <Label>Entity Mapping</Label>
                <Select value={form.entityValue || "__none__"} onValueChange={(v) => { set("entityValue", v === "__none__" ? "" : v); schemaEntityRef.current = ""; }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a database entity..." /></SelectTrigger>
                  <SelectContent className="w-full">
                    <SelectItem value="__none__">— No entity —</SelectItem>
                    {ENTITY_GROUPS.map((group, gi) => (
                      <SelectGroup key={group.group}>
                        {gi > 0 && <SelectSeparator />}
                        <SelectLabel>{group.group}</SelectLabel>
                        {group.entities.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                      </SelectGroup>
                    ))}
                    {customPages.length > 0 && (
                      <SelectGroup>
                        <SelectSeparator /><SelectLabel>Custom Entity Pages</SelectLabel>
                        {customPages.map((page: any) => (
                          <SelectItem key={page.id} value={encodeCustom(page.customEntityName)}>{page.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectSeparator />
                      <SelectItem value="CUSTOM_MANUAL">Custom (manual entry)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {form.entityValue === "CUSTOM_MANUAL" && (
                  <Input placeholder="Custom entity name" value={form.manualCustomName}
                    onChange={(e) => set("manualCustomName", e.target.value)} className="mt-1.5" />
                )}
                {resolvedEntityName && (
                  <p className="text-xs text-primary font-medium mt-1">
                    → Switch to "Entity Fields" tab to view and manage fields for <strong>{ENTITY_LABEL_MAP[resolvedEntityName] ?? resolvedEntityName}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>BPM Process</Label>
                <Select value={form.processId || "__none__"} onValueChange={(v) => set("processId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Link to a process..." /></SelectTrigger>
                  <SelectContent className="w-full">
                    <SelectItem value="__none__">— No process —</SelectItem>
                    {processes.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label>SLA (Days)</Label>
                  <Input type="number" min={1} placeholder="e.g. 3" value={form.slaDays} onChange={(e) => set("slaDays", e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 h-9">
                  <Label className="text-sm cursor-pointer">Active</Label>
                  <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                </div>
              </div>
            </TabsContent>

            {/* ── Fields tab ─────────────────────────────────────────────── */}
            <TabsContent value="fields" className="pt-3 space-y-4">
              {!resolvedEntityName ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Select an entity in the Details tab to manage its fields.
                </div>
              ) : schemaLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <>
                  {/* Default fields */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">Default Fields</span>
                      <Badge variant="secondary" className="text-xs">{schema?.defaultFields.length ?? 0}</Badge>
                      <span className="text-xs text-muted-foreground ml-1">— built-in, read-only</span>
                    </div>
                    <div className="rounded-md border divide-y">
                      {schema?.defaultFields.length === 0 ? (
                        <p className="py-3 px-3 text-xs text-muted-foreground">No default fields defined for this entity.</p>
                      ) : schema?.defaultFields.map((f: any) => (
                        <div key={f.name} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-sm font-medium w-36 truncate">{f.label}</span>
                          <span className="text-xs text-muted-foreground font-mono flex-1">{f.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_BADGE[f.type] ?? "bg-gray-100 text-gray-700"}`}>{f.type}</span>
                          {f.required && <Badge variant="destructive" className="text-xs py-0">required</Badge>}
                          {f.isSystem && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Custom fields */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Unlock className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-medium">Custom Fields</span>
                      <Badge variant="secondary" className="text-xs">{schema?.customFields.length ?? 0}</Badge>
                      <span className="text-xs text-muted-foreground ml-1">— added via Form Designer</span>
                    </div>

                    <div className="rounded-md border divide-y mb-3">
                      {schema?.customFields.length === 0 ? (
                        <p className="py-3 px-3 text-xs text-muted-foreground">No custom fields yet. Add one below.</p>
                      ) : schema?.customFields.map((f: any) => (
                        <div key={f.id} className="flex items-center gap-3 px-3 py-2 group">
                          <span className="text-sm font-medium w-36 truncate">{f.label || f.name}</span>
                          <span className="text-xs text-muted-foreground font-mono flex-1">{f.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_BADGE[f.type] ?? "bg-gray-100 text-gray-700"}`}>{f.type}</span>
                          {f.required && <Badge variant="destructive" className="text-xs py-0">required</Badge>}
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                            disabled={deletingFieldId === f.id} onClick={() => handleDeleteCustomField(f.id)}>
                            {deletingFieldId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Add custom field form */}
                    <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground">Add Custom Field</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Field Name (key)</Label>
                          <Input placeholder="e.g. custom_colour" className="h-8 text-sm font-mono"
                            value={newField.name} onChange={(e) => setNF("name", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Display Label</Label>
                          <Input placeholder="e.g. Custom Colour" className="h-8 text-sm"
                            value={newField.label} onChange={(e) => setNF("label", e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select value={newField.type} onValueChange={(v) => setNF("type", v)}>
                            <SelectTrigger className="h-8 w-full text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent className="w-full">
                              {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end gap-2 pb-0.5">
                          <div className="flex items-center gap-1.5">
                            <Switch id="nf-req" className="h-4 w-7" checked={newField.required} onCheckedChange={(v) => setNF("required", v)} />
                            <Label htmlFor="nf-req" className="text-xs cursor-pointer">Required</Label>
                          </div>
                        </div>
                      </div>
                      {newField.type === "select" && (
                        <div className="space-y-1">
                          <Label className="text-xs">Options (comma separated)</Label>
                          <Input placeholder="e.g. option1, option2, option3" className="h-8 text-sm"
                            value={newField.options} onChange={(e) => setNF("options", e.target.value)} />
                        </div>
                      )}
                      <Button size="sm" onClick={handleAddCustomField} disabled={addingField} className="w-full">
                        {addingField ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                        Add Field
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
