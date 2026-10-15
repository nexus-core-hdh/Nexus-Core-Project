"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "@/lib/app-navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Type,
  Hash,
  Table as TableIcon,
  Image as ImageIcon,
  FileText,
  Save,
  Eye,
  Printer,
  Settings,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { pdfReportApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReportElement = {
  id: string;
  type: "label" | "input" | "table" | "image" | "separator" | "text";
  position: { x: number; y: number; width: number; height: number };
  config: any;
  order: number;
};

type PaletteElementType = ReportElement["type"];
type FieldOption = { key: string; label: string };

type PdfReportBuilderProps = {
  reportId?: number;
};

const ENTITY_FIELDS: Record<string, FieldOption[]> = {
  LEAD: [
    { key: "lead.id", label: "Lead ID" },
    { key: "lead.name", label: "Lead Name" },
    { key: "lead.email", label: "Lead Email" },
    { key: "lead.phone", label: "Lead Phone" },
    { key: "lead.company", label: "Company" },
    { key: "lead.status", label: "Status" },
    { key: "lead.owner", label: "Owner" },
    { key: "lead.createdAt", label: "Created date" },
  ],
  DEAL: [
    { key: "deal.id", label: "Deal ID" },
    { key: "deal.name", label: "Deal Name" },
    { key: "deal.amount", label: "Amount" },
    { key: "deal.stage", label: "Stage" },
    { key: "deal.closeDate", label: "Close date" },
    { key: "deal.owner", label: "Owner" },
    { key: "deal.createdAt", label: "Created date" },
  ],
  CUSTOMER: [
    { key: "customer.id", label: "Customer ID" },
    { key: "customer.name", label: "Customer Name" },
    { key: "customer.email", label: "Customer Email" },
    { key: "customer.phone", label: "Customer Phone" },
    { key: "customer.address", label: "Address" },
    { key: "customer.createdAt", label: "Created date" },
  ],
  ORDER: [
    { key: "order.id", label: "Order ID" },
    { key: "order.number", label: "Order Number" },
    { key: "order.date", label: "Order date" },
    { key: "order.status", label: "Status" },
    { key: "order.total", label: "Total" },
    { key: "order.customerName", label: "Customer name" },
  ],
  PRODUCT: [
    { key: "product.id", label: "Product ID" },
    { key: "product.name", label: "Product Name" },
    { key: "product.sku", label: "SKU" },
    { key: "product.price", label: "Price" },
    { key: "product.stock", label: "Stock" },
    { key: "product.category", label: "Category" },
  ],
};

export default function PdfReportBuilder({ reportId }: PdfReportBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = reportId || (searchParams.get("id") ? parseInt(searchParams.get("id")!) : undefined);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState<string>("");
  const [elements, setElements] = useState<ReportElement[]>([]);
  const [activeElement, setActiveElement] = useState<ReportElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePaletteType, setActivePaletteType] = useState<PaletteElementType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!editId);
  const [pageSettings, setPageSettings] = useState({
    size: "A4",
    orientation: "portrait",
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    unit: "mm"
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const collisionDetectionStrategy = React.useCallback<typeof closestCenter>(
    (args) => {
      const collisions = closestCenter(args);
      const activeId = args.active?.id;
      // When reordering existing canvas items, ignore the canvas dropzone so "over"
      // resolves to a sortable item id instead of the container.
      if (typeof activeId === "string" && !activeId.startsWith("palette:")) {
        return collisions.filter((c) => c.id !== "canvas-drop");
      }
      return collisions;
    },
    []
  );

  useEffect(() => {
    if (editId) {
      loadReport();
    }
  }, [editId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      const report = await pdfReportApi.getPdfReportById(editId!);
      setName(report.name);
      setDescription(report.description || "");
      setEntityType(report.entityType || "");
      setElements(report.layout || []);
      setPageSettings(report.pageSettings || pageSettings);
    } catch (error: any) {
      console.error("Error loading report:", error);
      toast.error("Failed to load report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    if (id.startsWith("palette:")) {
      const type = id.replace("palette:", "") as PaletteElementType;
      setActivePaletteType(type);
    } else {
      setActivePaletteType(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActivePaletteType(null);

    // Palette -> Canvas drop: create new element
    if (over && over.id === "canvas-drop" && typeof active.id === "string" && active.id.startsWith("palette:")) {
      const type = active.id.replace("palette:", "") as PaletteElementType;
      addElement(type);
      return;
    }

    // Reorder existing elements
    if (over && active.id !== over.id && !(`${active.id}`.startsWith("palette:"))) {
      setElements((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addElement = (type: ReportElement["type"]) => {
    const newElement: ReportElement = {
      id: `element-${Date.now()}`,
      type,
      position: { x: 0, y: elements.length * 50, width: 100, height: 30 },
      config: getDefaultConfig(type),
      order: elements.length
    };
    setElements([...elements, newElement]);
    setActiveElement(newElement);
  };

  const getDefaultConfig = (type: ReportElement["type"]): any => {
    switch (type) {
      case "label":
        return { text: "Label", fontSize: 12, fontWeight: "normal", align: "left" };
      case "input":
        return { label: "Input", placeholder: "", required: false, type: "text" };
      case "table":
        return { columns: [], rows: [], header: true, borders: true };
      case "image":
        return { src: "", width: 100, height: 100, align: "center" };
      case "separator":
        return { style: "solid", thickness: 1 };
      case "text":
        return { content: "Text content", fontSize: 11, align: "left" };
      default:
        return {};
    }
  };

  const updateElement = (id: string, updates: Partial<ReportElement>) => {
    setElements((items) =>
      items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
    if (activeElement?.id === id) {
      setActiveElement({ ...activeElement, ...updates });
    }
  };

  const deleteElement = (id: string) => {
    setElements((items) => items.filter((item) => item.id !== id));
    if (activeElement?.id === id) {
      setActiveElement(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Report name is required");
      return;
    }

    setIsSaving(true);
    try {
      const user = getCurrentUser();
      const reportData = {
        name: name.trim(),
        description: description.trim() || undefined,
        entityType: entityType || undefined,
        layout: elements,
        pageSettings,
        isActive: true,
        companyId: user?.companyId ?? undefined,
        branchId: user?.branchId ?? undefined
      };

      if (editId) {
        await pdfReportApi.updatePdfReport(editId, reportData);
        toast.success("PDF report updated successfully");
      } else {
        await pdfReportApi.createPdfReport(reportData);
        toast.success("PDF report created successfully");
      }
      
      router.push("/crm/settings/pdf-reports");
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast.error("Failed to save PDF report", {
        description: error.message || "Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading report...</div>
      </div>
    );
  }

  const handleEntityTypeChange = (value: string) => {
    // Radix Select reserves "" for "clear selection", so items must never use it.
    setEntityType(value === "__none__" ? "" : value);
  };

  const availableFields = React.useMemo<FieldOption[]>(
    () => (entityType && ENTITY_FIELDS[entityType] ? ENTITY_FIELDS[entityType] : []),
    [entityType]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">
          {editId ? "Edit PDF Report" : "Create PDF Report"}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button variant="outline" onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Page Settings
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Report"}
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Sidebar - Element Palette */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Elements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <PaletteItem type="label" icon={<Type className="mr-2 h-4 w-4" />} label="Label" onClick={() => addElement("label")} />
              <PaletteItem type="input" icon={<Hash className="mr-2 h-4 w-4" />} label="Input Field" onClick={() => addElement("input")} />
              <PaletteItem type="table" icon={<TableIcon className="mr-2 h-4 w-4" />} label="Table" onClick={() => addElement("table")} />
              <PaletteItem type="text" icon={<FileText className="mr-2 h-4 w-4" />} label="Text Block" onClick={() => addElement("text")} />
              <PaletteItem type="image" icon={<ImageIcon className="mr-2 h-4 w-4" />} label="Image" onClick={() => addElement("image")} />
              <PaletteItem type="separator" icon={<Separator className="mr-2 h-4 w-4" />} label="Separator" onClick={() => addElement("separator")} />
            </CardContent>
          </Card>

          {/* Center - Canvas */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Report Canvas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Report Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter report name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Entity Type</Label>
                  <Select value={entityType} onValueChange={handleEntityTypeChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      <SelectItem value="LEAD">Lead</SelectItem>
                      <SelectItem value="DEAL">Deal</SelectItem>
                      <SelectItem value="CUSTOMER">Customer</SelectItem>
                      <SelectItem value="ORDER">Order</SelectItem>
                      <SelectItem value="PRODUCT">Product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter report description"
                  rows={2}
                />
              </div>

              <Separator />

                <CanvasDropzone>
                <SortableContext
                  items={elements.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 min-h-[400px] border-2 border-dashed rounded-lg p-4">
                    {elements.length === 0 ? (
                      <div className="flex items-center justify-center h-64 text-muted-foreground">
                        Drag elements from the left to build your report
                      </div>
                    ) : (
                      elements.map((element) => (
                        <ReportElementItem
                          key={element.id}
                          element={element}
                          isActive={activeElement?.id === element.id}
                          onSelect={() => setActiveElement(element)}
                          onUpdate={(updates) => updateElement(element.id, updates)}
                          onDelete={() => deleteElement(element.id)}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
                </CanvasDropzone>
            </div>
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activePaletteType ? (
            <div className="px-3 py-2 border rounded-md bg-background shadow-sm text-sm opacity-90">
              Add {activePaletteType}
            </div>
          ) : activeId ? (
            <div className="opacity-50">Dragging...</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Right Sidebar - Element Properties */}
      {activeElement && (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Element Properties</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActiveElement(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ElementPropertiesPanel
              element={activeElement}
              entityType={entityType}
              availableFields={availableFields}
              onUpdate={(updates) => updateElement(activeElement.id, updates)}
            />
          </CardContent>
        </Card>
      )}

      {/* Page Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Page Settings</DialogTitle>
            <DialogDescription>Configure page size, orientation, and margins</DialogDescription>
          </DialogHeader>
          <PageSettingsPanel settings={pageSettings} onUpdate={setPageSettings} />
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>Preview how your report will look when printed</DialogDescription>
          </DialogHeader>
          <ReportPreview elements={elements} pageSettings={pageSettings} />
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaletteItem({
  type,
  icon,
  label,
  onClick,
}: {
  type: PaletteElementType;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const id = `palette:${type}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Button
        variant="outline"
        className="w-full justify-start touch-none"
        onClick={onClick}
        {...attributes}
        {...listeners}
      >
        {icon}
        {label}
      </Button>
    </div>
  );
}

function CanvasDropzone({ children }: { children: React.ReactNode }) {
  // Use a lightweight wrapper so the entire canvas area counts as a drop target.
  const { setNodeRef } = useDroppable({ id: "canvas-drop" });
  return <div ref={setNodeRef}>{children}</div>;
}

// Report Element Item Component
function ReportElementItem({
  element,
  isActive,
  onSelect,
  onUpdate,
  onDelete,
}: {
  element: ReportElement;
  isActive: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ReportElement>) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderElement = () => {
    switch (element.type) {
      case "label":
        return (
          <div
            style={{
              fontSize: `${element.config.fontSize || 12}px`,
              fontWeight: element.config.fontWeight || "normal",
              textAlign: element.config.align || "left",
            }}>
            {element.config.bindingKey ? `{${element.config.bindingKey}}` : element.config.text || "Label"}
          </div>
        );
      case "input":
        return (
          <div>
            <Label>{element.config.label || "Input"}</Label>
            <Input
              placeholder={element.config.placeholder || ""}
              value={element.config.bindingKey ? `{${element.config.bindingKey}}` : ""}
              disabled
              className="mt-1"
            />
          </div>
        );
      case "table":
        return (
          <div className="border rounded overflow-hidden">
            <div className="p-2 bg-muted text-sm font-medium">Table</div>
            <div className="p-3">
              <div className="text-xs text-muted-foreground mb-2">
                {element.config.columns?.length || 0} columns, {element.config.rows?.length || 0} rows
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${element.config.borders ?? true ? "border border-border" : ""}`}>
                  {(element.config.header ?? true) && (
                    <thead className="bg-muted/50">
                      <tr>
                        {(element.config.columns || []).map((c: any, idx: number) => (
                          <th
                            key={`${c?.key ?? idx}`}
                            className={`px-2 py-1 font-medium ${
                              element.config.borders ?? true ? "border-b border-border" : ""
                            }`}
                            style={{
                              width: c?.width ? `${c.width}px` : undefined,
                              textAlign: c?.align || "left",
                              height: element.config.rowHeight ? `${element.config.rowHeight}px` : undefined,
                            }}
                          >
                            {c?.label || `Column ${idx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {Array.from({ length: Math.max(1, element.config.rows?.length || 0) }).map((_, rIdx) => (
                      <tr
                        key={rIdx}
                        className={`text-muted-foreground ${element.config.zebra && rIdx % 2 === 1 ? "bg-muted/30" : ""}`}
                        style={{
                          height: element.config.rowHeight ? `${element.config.rowHeight}px` : undefined,
                        }}
                      >
                        {(element.config.columns || []).map((c: any, cIdx: number) => (
                          <td
                            key={`${c?.key ?? cIdx}-${rIdx}`}
                            className={`px-2 py-1 ${
                              element.config.borders ?? true ? "border-t border-border" : ""
                            }`}
                            style={{
                              width: c?.width ? `${c.width}px` : undefined,
                              textAlign: c?.align || "left",
                            }}
                          >
                            {c?.key ? `{${c.key}}` : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      case "text":
        return (
          <div
            style={{
              fontSize: `${element.config.fontSize || 11}px`,
              textAlign: element.config.align || "left",
            }}>
            {element.config.content || "Text content"}
          </div>
        );
      case "image":
        return (
          <div className="border rounded p-2 flex items-center justify-center" style={{ height: "100px" }}>
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Image</span>
          </div>
        );
      case "separator":
        return <Separator />;
      default:
        return <div>Unknown element type</div>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
        isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
      onClick={onSelect}>
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing touch-none select-none"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">{renderElement()}</div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// Element Properties Panel
function ElementPropertiesPanel({
  element,
  onUpdate,
  entityType,
  availableFields,
}: {
  element: ReportElement;
  onUpdate: (updates: Partial<ReportElement>) => void;
  entityType: string;
  availableFields: FieldOption[];
}) {
  const updateConfig = (configUpdates: any) => {
    onUpdate({ config: { ...element.config, ...configUpdates } });
  };

  const tableColumns: Array<{ key: string; label: string; width?: number; align?: "left" | "center" | "right" }> =
    Array.isArray(element.config.columns) ? element.config.columns : [];
  const tableRows: any[] = Array.isArray(element.config.rows) ? element.config.rows : [];

  const bindingOptions: FieldOption[] = React.useMemo(() => {
    const none: FieldOption = { key: "__none__", label: "None" };
    if (!entityType) return [none];
    return [none, ...availableFields];
  }, [availableFields, entityType]);

  const BindingSelect = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {bindingOptions.map((opt) => (
          <SelectItem key={opt.key} value={opt.key}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  switch (element.type) {
    case "label":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bind to field</Label>
            <BindingSelect
              value={element.config.bindingKey}
              onChange={(bindingKey) => updateConfig({ bindingKey })}
              placeholder={entityType ? "Select a field" : "Select entity type first"}
            />
          </div>
          <div className="space-y-2">
            <Label>Text</Label>
            <Input
              value={element.config.text || ""}
              onChange={(e) => updateConfig({ text: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Font Size</Label>
            <Input
              type="number"
              value={element.config.fontSize || 12}
              onChange={(e) => updateConfig({ fontSize: parseInt(e.target.value) || 12 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Font Weight</Label>
            <Select
              value={element.config.fontWeight || "normal"}
              onValueChange={(value) => updateConfig({ fontWeight: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
                <SelectItem value="600">Semi-bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Alignment</Label>
            <Select
              value={element.config.align || "left"}
              onValueChange={(value) => updateConfig({ align: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    case "input":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bind to field</Label>
            <BindingSelect
              value={element.config.bindingKey}
              onChange={(bindingKey) => updateConfig({ bindingKey })}
              placeholder={entityType ? "Select a field" : "Select entity type first"}
            />
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={element.config.label || ""}
              onChange={(e) => updateConfig({ label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Placeholder</Label>
            <Input
              value={element.config.placeholder || ""}
              onChange={(e) => updateConfig({ placeholder: e.target.value })}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              checked={element.config.required || false}
              onCheckedChange={(checked) => updateConfig({ required: checked })}
            />
            <Label>Required</Label>
          </div>
        </div>
      );
    case "table":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bind rows to</Label>
            <BindingSelect
              value={element.config.rowsBindingKey}
              onChange={(rowsBindingKey) => updateConfig({ rowsBindingKey })}
              placeholder={entityType ? "Select a list field (or keep None)" : "Select entity type first"}
            />
            <div className="text-xs text-muted-foreground">
              This stores the binding key for future runtime data population. The builder uses preview rows below.
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Columns</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextIndex = tableColumns.length + 1;
                  const next = [
                    ...tableColumns,
                    { key: `col${nextIndex}`, label: `Column ${nextIndex}`, width: 120, align: "left" },
                  ];
                  updateConfig({ columns: next });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>

            {tableColumns.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Add at least one column to configure the table.
              </div>
            ) : (
              <div className="space-y-2">
                {tableColumns.map((col, idx) => (
                  <div key={`${col.key}-${idx}`} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4 space-y-1">
                      <div className="text-xs text-muted-foreground">Label</div>
                      <Input
                        value={col.label ?? ""}
                        onChange={(e) => {
                          const next = tableColumns.map((c, i) =>
                            i === idx ? { ...c, label: e.target.value } : c
                          );
                          updateConfig({ columns: next });
                        }}
                        placeholder="Column label"
                      />
                    </div>
                    <div className="col-span-4 space-y-1">
                      <div className="text-xs text-muted-foreground">Key</div>
                      <Input
                        value={col.key ?? ""}
                        onChange={(e) => {
                          const next = tableColumns.map((c, i) =>
                            i === idx ? { ...c, key: e.target.value } : c
                          );
                          updateConfig({ columns: next });
                        }}
                        placeholder="columnKey"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <div className="text-xs text-muted-foreground">Width (px)</div>
                      <Input
                        type="number"
                        value={col.width ?? 120}
                        onChange={(e) => {
                          const width = Math.max(40, parseInt(e.target.value) || 120);
                          const next = tableColumns.map((c, i) => (i === idx ? { ...c, width } : c));
                          updateConfig({ columns: next });
                        }}
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <div className="text-xs text-muted-foreground">Align</div>
                      <Select
                        value={col.align ?? "left"}
                        onValueChange={(align) => {
                          const next = tableColumns.map((c, i) =>
                            i === idx ? { ...c, align: align as any } : c
                          );
                          updateConfig({ columns: next });
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex justify-end pb-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => {
                          const next = tableColumns.filter((_, i) => i !== idx);
                          updateConfig({ columns: next });
                        }}
                        aria-label="Remove column"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Appearance</Label>

            <div className="flex items-center space-x-2">
              <Switch
                checked={element.config.header ?? true}
                onCheckedChange={(checked) => updateConfig({ header: checked })}
              />
              <Label>Show header row</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={element.config.borders ?? true}
                onCheckedChange={(checked) => updateConfig({ borders: checked })}
              />
              <Label>Show borders</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={element.config.zebra ?? false}
                onCheckedChange={(checked) => updateConfig({ zebra: checked })}
              />
              <Label>Zebra striping</Label>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Row height (px)</div>
              <Input
                type="number"
                value={element.config.rowHeight ?? 32}
                onChange={(e) => updateConfig({ rowHeight: Math.max(18, parseInt(e.target.value) || 32) })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Rows (preview)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = [...tableRows, {}];
                  updateConfig({ rows: next });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Row
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={tableRows.length === 0}
                onClick={() => updateConfig({ rows: tableRows.slice(0, -1) })}
              >
                Remove Row
              </Button>
              <div className="text-sm text-muted-foreground">{tableRows.length} rows</div>
            </div>
            <div className="text-xs text-muted-foreground">
              Rows are currently used for builder preview only. Data binding can be added later.
            </div>
          </div>
        </div>
      );
    case "text":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={element.config.content || ""}
              onChange={(e) => updateConfig({ content: e.target.value })}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Font Size</Label>
            <Input
              type="number"
              value={element.config.fontSize || 11}
              onChange={(e) => updateConfig({ fontSize: parseInt(e.target.value) || 11 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Alignment</Label>
            <Select
              value={element.config.align || "left"}
              onValueChange={(value) => updateConfig({ align: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    default:
      return <div className="text-sm text-muted-foreground">No properties available</div>;
  }
}

// Page Settings Panel
function PageSettingsPanel({
  settings,
  onUpdate,
}: {
  settings: any;
  onUpdate: (settings: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Page Size</Label>
          <Select
            value={settings.size}
            onValueChange={(value) => onUpdate({ ...settings, size: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
              <SelectItem value="Legal">Legal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Orientation</Label>
          <Select
            value={settings.orientation}
            onValueChange={(value) => onUpdate({ ...settings, orientation: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="space-y-2">
          <Label>Top (mm)</Label>
          <Input
            type="number"
            value={settings.margins.top}
            onChange={(e) =>
              onUpdate({
                ...settings,
                margins: { ...settings.margins, top: parseInt(e.target.value) || 0 },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Right (mm)</Label>
          <Input
            type="number"
            value={settings.margins.right}
            onChange={(e) =>
              onUpdate({
                ...settings,
                margins: { ...settings.margins, right: parseInt(e.target.value) || 0 },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Bottom (mm)</Label>
          <Input
            type="number"
            value={settings.margins.bottom}
            onChange={(e) =>
              onUpdate({
                ...settings,
                margins: { ...settings.margins, bottom: parseInt(e.target.value) || 0 },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Left (mm)</Label>
          <Input
            type="number"
            value={settings.margins.left}
            onChange={(e) =>
              onUpdate({
                ...settings,
                margins: { ...settings.margins, left: parseInt(e.target.value) || 0 },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

// Report Preview Component
function ReportPreview({ elements, pageSettings }: { elements: ReportElement[]; pageSettings: any }) {
  return (
    <div
      className="bg-white p-8 shadow-lg"
      style={{
        width: pageSettings.size === "A4" ? "210mm" : "216mm",
        minHeight: pageSettings.size === "A4" ? "297mm" : "279mm",
        margin: "0 auto",
      }}>
      {elements.map((element) => {
        switch (element.type) {
          case "label":
            return (
              <div
                key={element.id}
                style={{
                  fontSize: `${element.config.fontSize || 12}px`,
                  fontWeight: element.config.fontWeight || "normal",
                  textAlign: element.config.align || "left",
                  marginBottom: "8px",
                }}>
                {element.config.text || "Label"}
              </div>
            );
          case "input":
            return (
              <div key={element.id} className="mb-4">
                <Label>{element.config.label || "Input"}</Label>
                <Input placeholder={element.config.placeholder || ""} disabled className="mt-1" />
              </div>
            );
          case "text":
            return (
              <div
                key={element.id}
                style={{
                  fontSize: `${element.config.fontSize || 11}px`,
                  textAlign: element.config.align || "left",
                  marginBottom: "8px",
                }}>
                {element.config.content || "Text content"}
              </div>
            );
          case "separator":
            return <Separator key={element.id} className="my-4" />;
          default:
            return null;
        }
      })}
    </div>
  );
}





