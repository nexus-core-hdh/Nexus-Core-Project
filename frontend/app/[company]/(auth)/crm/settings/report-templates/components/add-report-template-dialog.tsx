"use client";

import React, { useState, useEffect } from "react";
import { Plus, X, GripVertical, Eye, EyeOff, Search, Filter, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { reportTemplateApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

const ENTITY_TYPES = [
  { value: "LEAD", label: "Lead" },
  { value: "DEAL", label: "Deal" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "ORDER", label: "Order" },
  { value: "PRODUCT", label: "Product" },
  { value: "CONTACT", label: "Contact" },
  { value: "COMPANY", label: "Company" },
  { value: "OPPORTUNITY", label: "Opportunity" },
  { value: "QUOTE", label: "Quote" },
  { value: "INVOICE", label: "Invoice" },
];

// Entity relationships - defines which entities can be joined via foreign keys
const ENTITY_RELATIONSHIPS: Record<string, Array<{ entity: string; label: string; foreignKey: string; joinType: 'left' | 'inner' }>> = {
  ORDER: [
    { entity: "CUSTOMER", label: "Customer", foreignKey: "customerId", joinType: "left" },
    { entity: "PRODUCT", label: "Product (via Order Items)", foreignKey: "orderItems.productId", joinType: "left" },
  ],
  DEAL: [
    { entity: "LEAD", label: "Lead", foreignKey: "leadId", joinType: "left" },
    { entity: "CUSTOMER", label: "Customer", foreignKey: "customerId", joinType: "left" },
  ],
  CUSTOMER: [
    { entity: "ORDER", label: "Orders", foreignKey: "orders.customerId", joinType: "left" },
  ],
  PRODUCT: [
    { entity: "ORDER", label: "Orders (via Order Items)", foreignKey: "orderItems.productId", joinType: "left" },
  ],
};

// Common fields for different entity types
const ENTITY_FIELDS: Record<string, Array<{ field: string; label: string; type?: string }>> = {
  LEAD: [
    { field: "id", label: "ID", type: "number" },
    { field: "name", label: "Name", type: "string" },
    { field: "email", label: "Email", type: "string" },
    { field: "phone", label: "Phone", type: "string" },
    { field: "company", label: "Company", type: "string" },
    { field: "status", label: "Status", type: "string" },
    { field: "source", label: "Source", type: "string" },
    { field: "createdAt", label: "Created At", type: "date" },
    { field: "updatedAt", label: "Updated At", type: "date" },
  ],
  DEAL: [
    { field: "id", label: "ID", type: "number" },
    { field: "name", label: "Deal Name", type: "string" },
    { field: "amount", label: "Amount", type: "number" },
    { field: "stage", label: "Stage", type: "string" },
    { field: "probability", label: "Probability", type: "number" },
    { field: "closeDate", label: "Close Date", type: "date" },
    { field: "createdAt", label: "Created At", type: "date" },
    { field: "updatedAt", label: "Updated At", type: "date" },
  ],
  CUSTOMER: [
    { field: "id", label: "ID", type: "number" },
    { field: "name", label: "Name", type: "string" },
    { field: "email", label: "Email", type: "string" },
    { field: "phone", label: "Phone", type: "string" },
    { field: "address", label: "Address", type: "string" },
    { field: "city", label: "City", type: "string" },
    { field: "state", label: "State", type: "string" },
    { field: "country", label: "Country", type: "string" },
    { field: "createdAt", label: "Created At", type: "date" },
  ],
  ORDER: [
    { field: "id", label: "ID", type: "number" },
    { field: "orderNumber", label: "Order Number", type: "string" },
    { field: "totalAmount", label: "Total Amount", type: "number" },
    { field: "status", label: "Status", type: "string" },
    { field: "orderDate", label: "Order Date", type: "date" },
    { field: "createdAt", label: "Created At", type: "date" },
  ],
  PRODUCT: [
    { field: "id", label: "ID", type: "number" },
    { field: "name", label: "Product Name", type: "string" },
    { field: "sku", label: "SKU", type: "string" },
    { field: "price", label: "Price", type: "number" },
    { field: "quantity", label: "Quantity", type: "number" },
    { field: "category", label: "Category", type: "string" },
    { field: "status", label: "Status", type: "string" },
    { field: "createdAt", label: "Created At", type: "date" },
  ],
};

type ColumnConfig = {
  field: string;
  label: string;
  visible: boolean;
  order: number;
  entity: string; // Which entity this column belongs to
  entityLabel?: string; // Display label for the entity
};

type ReportParameter = {
  id: string;
  field: string;
  label: string;
  type: "string" | "number" | "date" | "boolean" | "select";
  operator: "equals" | "contains" | "greaterThan" | "lessThan" | "between" | "in";
  required: boolean;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>; // For select type
  entity?: string; // Which entity this parameter belongs to
};

type AddReportTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function AddReportTemplateDialog({
  open,
  onOpenChange,
  onSuccess
}: AddReportTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState<string>("");
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [parameters, setParameters] = useState<ReportParameter[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("columns");
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());

  // Update columns when entity type changes
  useEffect(() => {
    if (entityType) {
      const mainEntityFields = ENTITY_FIELDS[entityType] || [];
      const mainColumns: ColumnConfig[] = mainEntityFields.map((field, index) => ({
        field: field.field,
        label: field.label,
        visible: true,
        order: index,
        entity: entityType,
        entityLabel: ENTITY_TYPES.find(e => e.value === entityType)?.label || entityType,
      }));

      // Add related entities
      const relationships = ENTITY_RELATIONSHIPS[entityType] || [];
      setSelectedEntities(new Set([entityType, ...relationships.map(r => r.entity)]));
      setExpandedEntities(new Set([entityType, ...relationships.map(r => r.entity)]));

      // Add columns from related entities
      const relatedColumns: ColumnConfig[] = [];
      relationships.forEach((rel, relIndex) => {
        const relatedFields = ENTITY_FIELDS[rel.entity] || [];
        relatedFields.forEach((field, fieldIndex) => {
          relatedColumns.push({
            field: `${rel.entity}.${field.field}`,
            label: `${rel.label} - ${field.label}`,
            visible: false,
            order: mainColumns.length + (relIndex * 100) + fieldIndex,
            entity: rel.entity,
            entityLabel: rel.label,
          });
        });
      });

      setColumns([...mainColumns, ...relatedColumns]);
    } else {
      setColumns([]);
      setSelectedEntities(new Set());
    }
  }, [entityType]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setEntityType("");
      setColumns([]);
      setSelectedEntities(new Set());
      setParameters([]);
      setPreviewData([]);
      setActiveTab("columns");
      setExpandedEntities(new Set());
    }
  }, [open]);

  const toggleEntityExpansion = (entity: string) => {
    setExpandedEntities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entity)) {
        newSet.delete(entity);
      } else {
        newSet.add(entity);
      }
      return newSet;
    });
  };

  const toggleColumnVisibility = (index: number) => {
    setColumns(prev => prev.map((col, i) =>
      i === index ? { ...col, visible: !col.visible } : col
    ));
  };

  const updateColumnLabel = (index: number, label: string) => {
    setColumns(prev => prev.map((col, i) =>
      i === index ? { ...col, label } : col
    ));
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    setColumns(prev => {
      const newColumns = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newColumns.length) return prev;

      const tempOrder = newColumns[index].order;
      newColumns[index].order = newColumns[targetIndex].order;
      newColumns[targetIndex].order = tempOrder;

      return newColumns.sort((a, b) => a.order - b.order);
    });
  };

  const addParameter = () => {
    const availableFields = columns.filter(c => c.visible);
    if (availableFields.length === 0) {
      toast.error("Please select at least one visible column first");
      return;
    }

    const firstField = availableFields[0];
    const fieldInfo = ENTITY_FIELDS[firstField.entity]?.find(f => f.field === firstField.field.split('.').pop()) ||
      ENTITY_FIELDS[entityType]?.find(f => f.field === firstField.field);

    const newParam: ReportParameter = {
      id: `param-${Date.now()}`,
      field: firstField.field,
      label: firstField.label,
      type: fieldInfo?.type === "number" ? "number" : fieldInfo?.type === "date" ? "date" : "string",
      operator: "equals",
      required: false,
      entity: firstField.entity,
    };

    setParameters(prev => [...prev, newParam]);
  };

  const updateParameter = (id: string, updates: Partial<ReportParameter>) => {
    setParameters(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const removeParameter = (id: string) => {
    setParameters(prev => prev.filter(p => p.id !== id));
  };

  const loadPreviewData = async () => {
    if (!entityType || columns.filter(c => c.visible).length === 0) {
      toast.error("Please select entity type and at least one visible column");
      return;
    }

    setIsLoadingPreview(true);
    try {
      const user = getCurrentUser();
      const params: any = {
        companyId: user?.companyId,
        branchId: user?.branchId
      };

      // Import APIs dynamically
      const { customerApi, orderApi, productApi, entityDataApi } = await import('@/lib/api');

      let data: any[] = [];
      switch (entityType) {
        case 'CUSTOMER':
          data = await customerApi.getCustomers(params);
          break;
        case 'ORDER':
          data = await orderApi.getOrders(params);
          break;
        case 'PRODUCT':
          data = await productApi.getProducts(params);
          break;
        case 'LEAD':
        case 'DEAL':
          data = await entityDataApi.getEntityDataByType(entityType, params);
          break;
        default:
          data = [];
      }

      // Limit preview to 10 rows
      setPreviewData(data.slice(0, 10));
      toast.success(`Preview loaded: ${data.length} records found`);
    } catch (error: any) {
      console.error("Error loading preview:", error);
      toast.error("Failed to load preview data", {
        description: error.message || "Please try again."
      });
      setPreviewData([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!entityType) {
      toast.error("Entity type is required");
      return;
    }
    if (columns.filter(c => c.visible).length === 0) {
      toast.error("At least one visible column is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = getCurrentUser();
      if (!user) {
        throw new Error("User not found");
      }

      const visibleColumns = columns
        .filter(c => c.visible)
        .sort((a, b) => a.order - b.order);

      await reportTemplateApi.createReportTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        entityType,
        columns: visibleColumns.map((col, index) => ({
          field: col.field,
          label: col.label,
          visible: true,
          order: index
        })),
        filters: parameters.length > 0 ? {
          parameters: parameters.map(p => ({
            field: p.field,
            operator: p.operator,
            type: p.type,
            required: p.required,
            defaultValue: p.defaultValue,
            options: p.options,
          }))
        } : undefined,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      });

      toast.success("Report template created successfully!");
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error creating report template:", error);
      toast.error("Failed to create report template", {
        description: error.message || "Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleColumns = columns.filter(c => c.visible).sort((a, b) => a.order - b.order);
  const columnsByEntity = columns.reduce((acc, col) => {
    const entity = col.entity;
    if (!acc[entity]) acc[entity] = [];
    acc[entity].push(col);
    return acc;
  }, {} as Record<string, ColumnConfig[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>Create Report Template</DialogTitle>
          <DialogDescription>
            Configure columns from multiple entities, preview data, and set report parameters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-4 flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                placeholder="e.g. Customer Order Report"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-type">Primary Entity Type *</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger id="entity-type" className="w-full">
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter template description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="columns">Columns</TabsTrigger>
              <TabsTrigger value="parameters">Parameters</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent
              value="columns"
              className="flex-1 flex flex-col overflow-hidden mt-4 min-h-0"
            >
              {entityType && Object.keys(columnsByEntity).length > 0 ? (
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-4 pr-4">
                    {Object.entries(columnsByEntity).map(([entity, entityColumns]) => {
                      const entityLabel = ENTITY_TYPES.find(e => e.value === entity)?.label || entity;
                      const isExpanded = expandedEntities.has(entity);
                      const isMainEntity = entity === entityType;

                      return (
                        <Card key={entity}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => toggleEntityExpansion(entity)}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                                <CardTitle className="text-base">
                                  {entityLabel}
                                  {isMainEntity && <Badge variant="default" className="ml-2">Primary</Badge>}
                                </CardTitle>
                              </div>
                            </div>
                          </CardHeader>
                          {isExpanded && (
                            <CardContent>
                              <div className="space-y-3">
                                {entityColumns.map((column, index) => {
                                  const globalIndex = columns.findIndex(c => c.field === column.field && c.entity === column.entity);
                                  return (
                                    <div
                                      key={`${column.entity}-${column.field}`}
                                      className="flex items-center gap-3 p-3 border rounded-lg"
                                    >
                                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                                      <div className="flex-1 grid gap-2 md:grid-cols-2">
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Field</Label>
                                          <div className="text-sm font-medium">{column.field}</div>
                                        </div>
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Label</Label>
                                          <Input
                                            value={column.label}
                                            onChange={(e) => updateColumnLabel(globalIndex, e.target.value)}
                                            className="h-8"
                                            placeholder="Column label"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => moveColumn(globalIndex, "up")}
                                          disabled={globalIndex === 0}
                                        >
                                          ↑
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => moveColumn(globalIndex, "down")}
                                          disabled={globalIndex === columns.length - 1}
                                        >
                                          ↓
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => toggleColumnVisibility(globalIndex)}
                                        >
                                          {column.visible ? (
                                            <Eye className="h-4 w-4" />
                                          ) : (
                                            <EyeOff className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </div>
                                      <Badge variant={column.visible ? "default" : "outline"}>
                                        {column.visible ? "Visible" : "Hidden"}
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {entityType ? "No fields available for this entity type" : "Please select an entity type"}
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="parameters"
              className="flex-1 flex flex-col overflow-hidden mt-4 min-h-0"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-medium">Report Parameters</h3>
                  <p className="text-xs text-muted-foreground">
                    Define filters that users can set when generating reports
                  </p>
                </div>
                <Button onClick={addParameter} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Parameter
                </Button>
              </div>
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-3 pr-4">
                  {parameters.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No parameters defined. Click "Add Parameter" to create one.
                    </div>
                  ) : (
                    parameters.map((param) => {
                      const column = columns.find(c => c.field === param.field);
                      return (
                        <Card key={param.id}>
                          <CardContent className="pt-6">
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-5 items-end">
                              <div className="space-y-2">
                                <Label>Field</Label>
                                <Select
                                  value={param.field}
                                  onValueChange={(value) => updateParameter(param.id, { field: value })}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {visibleColumns.map((col) => (
                                      <SelectItem key={col.field} value={col.field}>
                                        {col.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Label</Label>
                                <Input
                                  value={param.label}
                                  onChange={(e) => updateParameter(param.id, { label: e.target.value })}
                                  placeholder="Parameter label"
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Operator</Label>
                                <Select
                                  value={param.operator}
                                  onValueChange={(value: any) => updateParameter(param.id, { operator: value })}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="contains">Contains</SelectItem>
                                    <SelectItem value="greaterThan">Greater Than</SelectItem>
                                    <SelectItem value="lessThan">Less Than</SelectItem>
                                    <SelectItem value="between">Between</SelectItem>
                                    <SelectItem value="in">In</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Type</Label>
                                <Select
                                  value={param.type}
                                  onValueChange={(value: any) => updateParameter(param.id, { type: value })}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="string">String</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="boolean">Boolean</SelectItem>
                                    <SelectItem value="select">Select</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="sr-only">Required</Label>
                                <div className="flex items-center justify-between gap-3 h-10">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`required-${param.id}`}
                                      checked={param.required}
                                      onCheckedChange={(checked) => updateParameter(param.id, { required: !!checked })}
                                    />
                                    <Label htmlFor={`required-${param.id}`} className="text-sm">
                                      Required
                                    </Label>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeParameter(param.id)}
                                    className="text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="preview"
              className="flex-1 flex flex-col overflow-hidden mt-4 min-h-0"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-medium">Data Preview</h3>
                  <p className="text-xs text-muted-foreground">
                    Preview sample data based on selected columns
                  </p>
                </div>
                <Button onClick={loadPreviewData} disabled={isLoadingPreview || !entityType || visibleColumns.length === 0}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                  {isLoadingPreview ? "Loading..." : "Load Preview"}
                </Button>
              </div>
              <ScrollArea className="flex-1 border rounded-md">
                {previewData.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {visibleColumns.map((col) => (
                          <TableHead key={col.field}>{col.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {visibleColumns.map((col) => {
                            const fieldParts = col.field.split('.');
                            let value = row;
                            for (const part of fieldParts) {
                              value = value?.[part];
                            }
                            return (
                              <TableCell key={col.field}>
                                {value !== null && value !== undefined ? String(value) : "-"}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {isLoadingPreview ? "Loading preview data..." : "Click 'Load Preview' to see sample data"}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="px-6 pb-4 flex justify-end space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !name || !entityType}>
            {isSubmitting ? "Creating..." : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
