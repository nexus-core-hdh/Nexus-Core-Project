"use client";

import * as React from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Loader2, GripVertical, X, Check, MessageSquare, Send, Clock, User } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { companiesApi, formSectionsApi, formFieldsApi, activitiesApi, commentsApi, messagesApi } from "@/lib/api";

// Field types
const fieldTypes = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select" },
  { value: "number", label: "Number" },
  { value: "url", label: "URL" },
  { value: "image", label: "Image" },
] as const;

type FieldType = (typeof fieldTypes)[number]["value"];

// Dynamic field schema
const dynamicFieldSchema = z.object({
  id: z.string(),
  dbId: z.number().optional(), // Database ID
  label: z.string().min(1, "Field label is required"),
  type: z.enum(["text", "email", "phone", "textarea", "select", "number", "url", "image"]),
  value: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
});

// Dynamic section schema
const dynamicSectionSchema = z.object({
  id: z.string(),
  dbId: z.number().optional(), // Database ID
  title: z.string().min(1, "Section title is required"),
  description: z.string().optional(),
  fields: z.array(dynamicFieldSchema),
});

// Branch form schema
const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required").max(100, "Name is too long"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").or(z.literal("")).optional(),
});

// Combined form schema
const formSchema = z.object({
  sections: z.array(dynamicSectionSchema).min(1, "At least one section is required"),
  branches: z.array(branchSchema).min(1, "At least one branch is required"),
});

type FormValues = z.infer<typeof formSchema>;

// Generic Dialog Configuration Types
export type TabConfig = {
  id: string;
  label: string;
  content: React.ReactNode;
  enabled?: boolean;
};

export type DialogConfig = {
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  tabs?: TabConfig[];
  showFormSections?: boolean;
  showBranches?: boolean;
  showActivityTabs?: boolean;
  defaultTab?: string;
  formSchema?: z.ZodSchema<any>;
  onSubmit?: (data: any) => Promise<void> | void;
  onCancel?: () => void;
  initialSections?: z.infer<typeof dynamicSectionSchema>[];
  initialBranches?: Array<{
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  }>;
  loadSectionsFromDb?: (companyId?: number) => Promise<void>;
  saveSectionsToDb?: boolean;
  companyId?: number; // For loading existing company data including feed
};

export interface DynamicFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DialogConfig;
  onSuccess?: () => void;
}

interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Add Field Dialog Component
function AddFieldDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (field: z.infer<typeof dynamicFieldSchema>) => void;
}) {
  const [fieldType, setFieldType] = React.useState<FieldType>("text");
  const [label, setLabel] = React.useState("");
  const [required, setRequired] = React.useState(false);
  const [options, setOptions] = React.useState("");
  const [value, setValue] = React.useState("");

  const handleAdd = () => {
    if (!label.trim()) {
      toast.error("Field label is required");
      return;
    }

    const newField: z.infer<typeof dynamicFieldSchema> = {
      id: `field-${Date.now()}`,
      label: label.trim(),
      type: fieldType,
      value: value || undefined,
      required,
      options: fieldType === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
    };

    onAdd(newField);
    setLabel("");
    setValue("");
    setOptions("");
    setRequired(false);
    setFieldType("text");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Field</DialogTitle>
          <DialogDescription>Create a new field to add to this section.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Field Label *</label>
            <Input
              placeholder="Enter field label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Field Type *</label>
            <Select value={fieldType} onValueChange={(value) => setFieldType(value as FieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldType === "select" && (
            <div>
              <label className="text-sm font-medium mb-2 block">Options (comma-separated) *</label>
              <Input
                placeholder="Option 1, Option 2, Option 3"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-2 block">Default Value</label>
            {fieldType === "textarea" ? (
              <Textarea
                placeholder="Enter default value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <Input
                type={fieldType === "number" ? "number" : "text"}
                placeholder="Enter default value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="required"
              checked={required}
              onCheckedChange={(checked) => setRequired(checked === true)}
            />
            <label htmlFor="required" className="text-sm font-medium cursor-pointer">
              Required field
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd}>Add Field</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Select Field Dialog Component
function SelectFieldDialog({
  open,
  onOpenChange,
  availableFields,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableFields: z.infer<typeof dynamicFieldSchema>[];
  onSelect: (field: z.infer<typeof dynamicFieldSchema>) => void;
}) {
  const [selectedFieldIds, setSelectedFieldIds] = React.useState<Set<string>>(new Set());

  const handleToggleField = (fieldId: string) => {
    setSelectedFieldIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  };

  const handleSelect = () => {
    if (selectedFieldIds.size === 0) {
      toast.error("Please select at least one field");
      return;
    }

    // Add all selected fields
    selectedFieldIds.forEach((fieldId) => {
      const field = availableFields.find((f) => f.id === fieldId);
      if (field) {
        // Create a new instance with a new ID to avoid conflicts
        const newField: z.infer<typeof dynamicFieldSchema> = {
          ...field,
          id: `field-${Date.now()}-${Math.random()}`,
          value: "",
        };
        onSelect(newField);
      }
    });

    setSelectedFieldIds(new Set());
    onOpenChange(false);
  };

  if (availableFields.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Select Field</DialogTitle>
            <DialogDescription>No fields available to select.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Select Field</DialogTitle>
          <DialogDescription>
            Choose one or more fields from previously created fields.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
          {availableFields.map((field) => {
            const isSelected = selectedFieldIds.has(field.id);
            return (
              <div
                key={field.id}
                className={`p-3 border rounded-lg transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`field-${field.id}`}
                    checked={isSelected}
                    onCheckedChange={() => handleToggleField(field.id)}
                  />
                  <label
                    htmlFor={`field-${field.id}`}
                    className="flex-1 cursor-pointer">
                    <div className="font-medium">
                      {field.label}
                      {field.required && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={selectedFieldIds.size === 0}>
            Select {selectedFieldIds.size > 0 ? `(${selectedFieldIds.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Sortable Section Component
function SortableSection({
  sectionIndex,
  form,
  onRemove,
  allFields,
  onAddSection,
  isLastSection,
}: {
  sectionIndex: number;
  form: any;
  onRemove: () => void;
  allFields: z.infer<typeof dynamicFieldSchema>[];
  onAddSection?: () => void;
  isLastSection?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `section-${sectionIndex}` });

  const [addFieldDialogOpen, setAddFieldDialogOpen] = React.useState(false);
  const [selectFieldDialogOpen, setSelectFieldDialogOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: `sections.${sectionIndex}.fields`,
  });

  const sectionFields = form.watch(`sections.${sectionIndex}.fields`);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleAddField = async (field: z.infer<typeof dynamicFieldSchema>) => {
    const section = form.getValues(`sections.${sectionIndex}`);
    const sectionId = section.dbId; // Store DB ID in section
    
    if (sectionId) {
      try {
        const savedField = await formFieldsApi.createField({
          label: field.label,
          type: field.type,
          value: field.value || null,
          options: field.options || [],
          required: field.required,
          sectionId: sectionId,
          order: fields.length,
        });
        
        // Append with DB ID
        append({
          ...field,
          id: `field-${savedField.id}`,
          dbId: savedField.id,
        });
        toast.success("Field saved successfully");
      } catch (error: any) {
        toast.error("Failed to save field", {
          description: error.message || "An error occurred",
        });
        // Still append locally if save fails
        append(field);
      }
    } else {
      // If section not saved yet, just append locally
      append(field);
    }
  };

  const handleSelectField = (field: z.infer<typeof dynamicFieldSchema>) => {
    append(field);
  };

  const handleDeleteSection = async () => {
    const section = form.getValues(`sections.${sectionIndex}`);
    const sectionId = section.dbId;
    
    if (sectionId) {
      try {
        await formSectionsApi.deleteSection(sectionId);
        toast.success("Section deleted from database");
      } catch (error: any) {
        toast.error("Failed to delete section from database", {
          description: error.message || "An error occurred",
        });
      }
    }
    
    onRemove();
    setDeleteConfirmOpen(false);
  };

  // Get available fields (all fields from all sections except current section)
  const availableFields = React.useMemo(() => {
    const allSections = form.watch("sections");
    const fieldsFromOtherSections: z.infer<typeof dynamicFieldSchema>[] = [];
    
    allSections.forEach((section: any, idx: number) => {
      if (idx !== sectionIndex && section.fields) {
        section.fields.forEach((field: any) => {
          fieldsFromOtherSections.push(field);
        });
      }
    });

    return [...allFields, ...fieldsFromOtherSections].filter(
      (field, index, self) => index === self.findIndex((f) => f.label === field.label && f.type === field.type)
    );
  }, [allFields, form, sectionIndex]);

  return (
    <>
      <Card ref={setNodeRef} style={style} className="relative">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <FormField
                  control={form.control}
                  name={`sections.${sectionIndex}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Section Title"
                          className="font-semibold border-none p-0 h-auto"
                          {...field}
                          onBlur={async (e) => {
                            field.onBlur();
                            const section = form.getValues(`sections.${sectionIndex}`);
                            if (section.dbId && e.target.value.trim()) {
                              try {
                                await formSectionsApi.updateSection(section.dbId, {
                                  title: e.target.value,
                                  description: section.description,
                                  order: sectionIndex,
                                });
                              } catch (error) {
                                console.error("Failed to update section:", error);
                              }
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SortableFields
            sectionIndex={sectionIndex}
            form={form}
            fields={fields}
            remove={remove}
            move={move}
          />
        </CardContent>
        <div className="px-6 pb-4 pt-2 border-t">
          <div className="flex gap-2 justify-center flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddFieldDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectFieldDialogOpen(true)}
              disabled={availableFields.length === 0}>
              <Check className="mr-2 h-4 w-4" />
              Select Field
            </Button>
            {isLastSection && onAddSection && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddSection}>
                <Plus className="mr-2 h-4 w-4" />
                Add Section
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              className="text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Section
            </Button>
          </div>
        </div>
      </Card>

      <AddFieldDialog
        open={addFieldDialogOpen}
        onOpenChange={setAddFieldDialogOpen}
        onAdd={handleAddField}
      />

      <SelectFieldDialog
        open={selectFieldDialogOpen}
        onOpenChange={setSelectFieldDialogOpen}
        availableFields={availableFields}
        onSelect={handleSelectField}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this section? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSection} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Sortable Fields Component
function SortableFields({
  sectionIndex,
  form,
  fields,
  remove,
  move,
}: {
  sectionIndex: number;
  form: any;
  fields: any[];
  remove: (index: number) => void;
  move: (from: number, to: number) => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field: any) => {
        const fieldId = `field-${field.id}`;
        return fieldId === active.id || fieldId === String(active.id);
      });
      const newIndex = fields.findIndex((field: any) => {
        const fieldId = `field-${field.id}`;
        return fieldId === over.id || fieldId === String(over.id);
      });
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
    setActiveId(null);
  };

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No fields added. Click "Add Field" to get started.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}>
      <SortableContext
        items={fields.map((field: any, idx: number) => field?.id ? `field-${field.id}` : `field-${idx}`)}
        strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {fields.map((field: any, fieldIndex: number) => (
            <SortableField
              key={field.id}
              sectionIndex={sectionIndex}
              fieldIndex={fieldIndex}
              form={form}
              onRemove={() => remove(fieldIndex)}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="opacity-50 bg-background border rounded-lg p-4">
            Dragging field...
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Sortable Field Component
function SortableField({
  sectionIndex,
  fieldIndex,
  form,
  onRemove,
}: {
  sectionIndex: number;
  fieldIndex: number;
  form: any;
  onRemove: () => void;
}) {
  const handleRemove = async () => {
    const field = form.getValues(`sections.${sectionIndex}.fields.${fieldIndex}`);
    const fieldId = field.dbId;
    
    if (fieldId) {
      try {
        await formFieldsApi.deleteField(fieldId);
        toast.success("Field deleted from database");
      } catch (error: any) {
        toast.error("Failed to delete field from database", {
          description: error.message || "An error occurred",
        });
      }
    }
    
    onRemove();
  };
  const field = form.watch(`sections.${sectionIndex}.fields.${fieldIndex}`);
  const fieldId = field?.id ? `field-${field.id}` : `field-${fieldIndex}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fieldId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium">
            {field?.label || ""}
            {field?.required && <span className="text-destructive ml-1">*</span>}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          className="h-8 w-8 text-destructive hover:text-destructive">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Field value input based on type */}
      {field?.type === "select" ? (
        <div className="space-y-2">
          {field.options && field.options.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Options: {field.options.join(", ")}
            </div>
          )}
          <FormField
            control={form.control}
            name={`sections.${sectionIndex}.fields.${fieldIndex}.value`}
            render={({ field: valueField }) => (
              <FormItem>
                <FormControl>
                  <Select onValueChange={valueField.onChange} value={valueField.value || ""}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option: string) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : field?.type === "image" ? (
        <FormField
          control={form.control}
          name={`sections.${sectionIndex}.fields.${fieldIndex}.value`}
          render={({ field: valueField }) => (
            <FormItem>
              <FormControl>
                <div className="space-y-2">
                  <Input
                    type="url"
                    placeholder="Enter image URL or upload file"
                    value={valueField.value || ""}
                    onChange={valueField.onChange}
                    onBlur={valueField.onBlur}
                    name={valueField.name}
                    ref={valueField.ref}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-sm"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Create a preview URL
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            valueField.onChange(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                  {valueField.value && (
                    <div className="mt-2">
                      <img
                        src={valueField.value}
                        alt={field?.label || "Preview"}
                        className="max-w-full h-auto max-h-48 rounded-md border"
                        onError={(e) => {
                          // Hide broken images
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={form.control}
          name={`sections.${sectionIndex}.fields.${fieldIndex}.value`}
          render={({ field: valueField }) => (
            <FormItem>
              <FormControl>
                {field?.type === "textarea" ? (
                  <Textarea 
                    placeholder="Enter value" 
                    value={valueField.value || ""}
                    onChange={valueField.onChange}
                    onBlur={valueField.onBlur}
                    name={valueField.name}
                    ref={valueField.ref}
                  />
                ) : (
                  <Input
                    type={field?.type === "number" ? "number" : field?.type === "email" ? "email" : "text"}
                    placeholder="Enter value"
                    value={valueField.value || ""}
                    onChange={valueField.onChange}
                    onBlur={valueField.onBlur}
                    name={valueField.name}
                    ref={valueField.ref}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

// Generic Dynamic Form Dialog Component
export function DynamicFormDialog({
  open,
  onOpenChange,
  config,
  onSuccess,
}: DynamicFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeSectionId, setActiveSectionId] = React.useState<string | null>(null);
  const [allFields, setAllFields] = React.useState<z.infer<typeof dynamicFieldSchema>[]>([]);
  
  // Activity, Comment, and Message state
  const [activities, setActivities] = React.useState<Array<{
    id: number;
    type: string;
    message: string;
    createdAt: string;
    userId?: number;
  }>>([]);
  
  const [comments, setComments] = React.useState<Array<{
    id: number;
    text: string;
    createdAt: string;
    userId?: number;
  }>>([]);
  
  const [messages, setMessages] = React.useState<Array<{
    id: number;
    text: string;
    createdAt: string;
    userId?: number;
    isSent: boolean;
  }>>([]);
  
  const [newComment, setNewComment] = React.useState("");
  const [newMessage, setNewMessage] = React.useState("");
  const [currentCompanyId, setCurrentCompanyId] = React.useState<number | null>(config.companyId || null);
  
  // Use config values with defaults
  const dialogTitle = config.title || "Create";
  const dialogDescription = config.description;
  const submitLabel = config.submitLabel || "Submit";
  const cancelLabel = config.cancelLabel || "Cancel";
  const showFormSections = config.showFormSections !== false; // Default true
  const showBranches = config.showBranches !== false; // Default true
  const showActivityTabs = config.showActivityTabs !== false; // Default true
  const customTabs = config.tabs || [];
  const defaultTab = config.defaultTab || (customTabs.length > 0 ? customTabs[0].id : "general");

  // Initialize with Company Information section
  const defaultCompanySection: z.infer<typeof dynamicSectionSchema> = {
    id: "company-info",
    title: "Company Information",
    description: "Enter the main company details. A unique URL will be generated automatically.",
    fields: [
      {
        id: "company-name",
        label: "Company Name",
        type: "text",
        value: "",
        required: true,
      },
      {
        id: "company-email",
        label: "Company Email",
        type: "email",
        value: "",
        required: true,
      },
      {
        id: "company-phone",
        label: "Phone",
        type: "phone",
        value: "",
        required: false,
      },
      {
        id: "company-website",
        label: "Website",
        type: "url",
        value: "",
        required: false,
      },
      {
        id: "company-address",
        label: "Address",
        type: "textarea",
        value: "",
        required: false,
      },
      {
        id: "company-industry",
        label: "Industry",
        type: "select",
        value: "",
        required: false,
        options: [
          "Technology",
          "Finance",
          "Healthcare",
          "Retail",
          "Manufacturing",
          "Education",
          "Real Estate",
          "Consulting",
          "Other",
        ],
      },
    ],
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sections: [defaultCompanySection],
      branches: [
        {
          name: "",
          address: "",
          phone: "",
          email: "",
        },
      ],
    },
  });

  const { fields: branchFields, append: appendBranch, remove: removeBranch } = useFieldArray({
    control: form.control,
    name: "branches",
  });

  const {
    fields: sectionFields,
    append: appendSection,
    remove: removeSection,
    move: moveSection,
  } = useFieldArray({
    control: form.control,
    name: "sections",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sectionFields.findIndex(
        (_: any, index: number) => {
          const sectionId = `section-${index}`;
          return sectionId === active.id || sectionId === String(active.id);
        }
      );
      const newIndex = sectionFields.findIndex(
        (_: any, index: number) => {
          const sectionId = `section-${index}`;
          return sectionId === over.id || sectionId === String(over.id);
        }
      );
      if (oldIndex !== -1 && newIndex !== -1) {
        moveSection(oldIndex, newIndex);
      }
    }
    setActiveSectionId(null);
  };

  const handleSectionDragStart = (event: DragStartEvent) => {
    setActiveSectionId(event.active.id as string);
  };

  const addSection = async () => {
    try {
      const newSection = {
        id: `section-${Date.now()}`,
        title: "",
        description: "",
        fields: [],
      };
      
      // Save to database immediately
      const savedSection = await formSectionsApi.createSection({
        title: "New Section",
        description: "",
        companyId: null, // Will be set when company is created
        isDefault: false,
        order: sectionFields.length,
        fields: [],
      });
      
      appendSection({
        ...newSection,
        dbId: savedSection.id,
      });
      
      toast.success("Section created and saved");
    } catch (error: any) {
      console.error("Error creating section:", error);
      const errorMessage = error?.message || error?.toString() || "An error occurred";
      toast.error("Failed to save section", {
        description: errorMessage,
      });
      // Still add locally if save fails
      appendSection({
        id: `section-${Date.now()}`,
        title: "",
        description: "",
        fields: [],
      });
    }
  };

  // Update allFields when sections change
  React.useEffect(() => {
    const sections = form.watch("sections");
    const fields: z.infer<typeof dynamicFieldSchema>[] = [];
    sections.forEach((section: any) => {
      if (section.fields) {
        section.fields.forEach((field: any) => {
          fields.push(field);
        });
      }
    });
    setAllFields(fields);
  }, [form.watch("sections")]);

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      // If custom onSubmit is provided, use it
      if (config.onSubmit) {
        await config.onSubmit(data);
        if (onSuccess) onSuccess();
        onOpenChange(false);
        setIsSubmitting(false);
        return;
      }
      
      // Default company creation logic
      // Extract company info from the first section (Company Information)
      const companySection = data.sections.find((s) => s.id === "company-info") || data.sections[0];
      
      if (!companySection || !companySection.fields || companySection.fields.length === 0) {
        toast.error("Company Information section is required");
        setIsSubmitting(false);
        return;
      }
      
      const nameField = companySection.fields.find((f) => f.label === "Company Name");
      const emailField = companySection.fields.find((f) => f.label === "Company Email");
      const phoneField = companySection.fields.find((f) => f.label === "Phone");
      const websiteField = companySection.fields.find((f) => f.label === "Website");
      const addressField = companySection.fields.find((f) => f.label === "Address");
      const industryField = companySection.fields.find((f) => f.label === "Industry");
      
      // Validate required fields
      if (!nameField?.value || !emailField?.value) {
        toast.error("Company Name and Email are required");
        setIsSubmitting(false);
        return;
      }

      const companyData = {
        name: nameField?.value || "",
        email: emailField?.value || "",
        phone: phoneField?.value || undefined,
        address: addressField?.value || undefined,
        website: websiteField?.value || undefined,
        industry: industryField?.value || undefined,
        branches: data.branches.map((branch) => ({
          name: branch.name,
          address: branch.address || undefined,
          phone: branch.phone || undefined,
          email: branch.email || undefined,
        })),
      };

      console.log("Creating company with data:", companyData);
      const response = await companiesApi.createCompany(companyData);
      console.log("Company created successfully:", response);
      
      // Set the current company ID for feed operations
      setCurrentCompanyId(response.id);

      // Link all sections to the created company
      const sections = form.getValues("sections");
      for (const section of sections) {
        if (section.dbId) {
          try {
            await formSectionsApi.updateSection(section.dbId, {
              title: section.title,
              description: section.description || "",
              companyId: response.id,
              order: sections.indexOf(section),
            });
          } catch (error) {
            console.error("Failed to link section to company:", error);
          }
        }
      }
      
      // Create initial activity for company creation
      try {
        await activitiesApi.createActivity({
          type: "company_created",
          message: `Company "${response.name}" was created`,
          companyId: response.id,
        });
      } catch (error) {
        console.error("Failed to create activity:", error);
      }

      toast.success("Company created successfully!", {
        description: `${response.name} has been registered with ${response.branches.length} branch(es).`,
      });

      form.reset({
        sections: [defaultCompanySection],
        branches: [
          {
            name: "",
            address: "",
            phone: "",
            email: "",
          },
        ],
      });
      onOpenChange(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error creating company:", error);
      toast.error("Failed to create company", {
        description: error.message || "An error occurred while creating the company.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addBranch = () => {
    appendBranch({
      name: "",
      address: "",
      phone: "",
      email: "",
    });
  };

  const removeBranchHandler = (index: number) => {
    if (branchFields.length > 1) {
      removeBranch(index);
    } else {
      toast.error("At least one branch is required");
    }
  };

  // Load Feed data (activities, comments, messages) when dialog opens
  React.useEffect(() => {
    if (open && currentCompanyId) {
      const loadFeedData = async () => {
        try {
          // Load activities
          const activitiesData = await activitiesApi.getActivities({ companyId: currentCompanyId });
          setActivities(activitiesData || []);
          
          // Load comments
          const commentsData = await commentsApi.getComments(currentCompanyId);
          setComments(commentsData || []);
          
          // Load messages
          const messagesData = await messagesApi.getMessages(currentCompanyId);
          setMessages(messagesData || []);
        } catch (error) {
          console.error("Failed to load feed data:", error);
        }
      };
      
      loadFeedData();
    } else if (open && !currentCompanyId) {
      // Reset feed data when opening without companyId
      setActivities([]);
      setComments([]);
      setMessages([]);
    }
  }, [open, currentCompanyId]);

  // Load existing sections and fields when dialog opens
  React.useEffect(() => {
    if (open) {
      const loadSections = async () => {
        try {
          const sections = await formSectionsApi.getSections();
          
          // Transform DB sections to form format
          const transformedSections = (sections || []).map((section: any) => ({
            id: `section-${section.id}`,
            dbId: section.id,
            title: section.title,
            description: section.description || "",
            fields: (section.fields || []).map((field: any) => ({
              id: `field-${field.id}`,
              dbId: field.id,
              label: field.label,
              type: field.type,
              value: field.value || "",
              options: field.options || [],
              required: field.required || false,
            })),
          }));
          
          // Check if default "Company Information" section exists in DB
          const defaultSectionInDb = transformedSections.find(
            (s: any) => s.title === "Company Information" || 
            (s.dbId && sections.find((sec: any) => sec.id === s.dbId)?.isDefault)
          );
          
          let finalSections = transformedSections;
          
          // If no default section exists in DB, create it
          if (!defaultSectionInDb) {
            try {
              const createdDefaultSection = await formSectionsApi.createSection({
                title: "Company Information",
                description: "Enter the main company details. A unique URL will be generated automatically.",
                companyId: null,
                isDefault: true,
                order: 0,
                fields: defaultCompanySection.fields.map((field, index) => ({
                  label: field.label,
                  type: field.type,
                  value: field.value || null,
                  options: field.options || [],
                  required: field.required || false,
                  order: index,
                })),
              });
              
              // Transform the created section and prepend it
              const createdSection = {
                id: `section-${createdDefaultSection.id}`,
                dbId: createdDefaultSection.id,
                title: createdDefaultSection.title,
                description: createdDefaultSection.description || "",
                fields: (createdDefaultSection.fields || []).map((field: any) => ({
                  id: `field-${field.id}`,
                  dbId: field.id,
                  label: field.label,
                  type: field.type,
                  value: field.value || "",
                  options: field.options || [],
                  required: field.required || false,
                })),
              };
              
              // Ensure default section is first
              finalSections = [createdSection, ...transformedSections];
            } catch (error) {
              console.error("Failed to create default section:", error);
              // If creation fails, use local default and prepend it
              finalSections = [defaultCompanySection, ...transformedSections];
            }
          } else {
            // Default section exists, ensure it's first
            const otherSections = transformedSections.filter((s: any) => s.dbId !== defaultSectionInDb.dbId);
            finalSections = [defaultSectionInDb, ...otherSections];
          }
          
          form.reset({
            sections: finalSections.length > 0 ? finalSections : [defaultCompanySection],
            branches: [
              {
                name: "",
                address: "",
                phone: "",
                email: "",
              },
            ],
          });
        } catch (error) {
          console.error("Failed to load sections:", error);
          // Use default on error
          form.reset({
            sections: [defaultCompanySection],
            branches: [
              {
                name: "",
                address: "",
                phone: "",
                email: "",
              },
            ],
          });
        }
      };
      
      loadSections();
    } else {
      form.reset({
        sections: [defaultCompanySection],
        branches: [
          {
            name: "",
            address: "",
            phone: "",
            email: "",
          },
        ],
      });
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] flex flex-col p-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {dialogDescription && (
              <DialogDescription>{dialogDescription}</DialogDescription>
            )}
          </DialogHeader>
        </div>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit, (errors) => {
              console.error("Form validation errors:", errors);
              toast.error("Please fill in all required fields");
            })} 
            className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className={`grid w-full grid-cols-${customTabs.length > 0 ? customTabs.length : 5}`}>
                  {customTabs.length > 0 ? (
                    customTabs.map((tab) => (
                      <TabsTrigger key={tab.id} value={tab.id} disabled={tab.enabled === false}>
                        {tab.label}
                      </TabsTrigger>
                    ))
                  ) : (
                    <>
                      <TabsTrigger value="general">General</TabsTrigger>
                      <TabsTrigger value="deals">Deals</TabsTrigger>
                      <TabsTrigger value="estimates">Estimates</TabsTrigger>
                      <TabsTrigger value="invoices">Invoices</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </>
                  )}
                </TabsList>

                {/* Custom Tabs */}
                {customTabs.length > 0 && customTabs.map((tab) => (
                  <TabsContent key={tab.id} value={tab.id} className="mt-6">
                    {tab.content}
                  </TabsContent>
                ))}

                {/* Default General Tab */}
                {customTabs.length === 0 && (
                <TabsContent value="general" className="mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Form Information */}
                    <div className="space-y-6">
                      <Card>
                        <CardContent className="space-y-6 pt-6">
                          {/* Dynamic Sections */}
                          <div>
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragStart={handleSectionDragStart}
                              onDragEnd={handleSectionDragEnd}>
                              <SortableContext
                                items={sectionFields.map((_: any, index: number) => `section-${index}`)}
                                strategy={verticalListSortingStrategy}>
                                <div className="space-y-4">
                                  {sectionFields.map((section: any, index: number) => (
                                    <SortableSection
                                      key={section.id}
                                      sectionIndex={index}
                                      form={form}
                                      onRemove={() => {
                                        if (sectionFields.length > 1) {
                                          removeSection(index);
                                        } else {
                                          toast.error("At least one section is required");
                                        }
                                      }}
                                      allFields={allFields}
                                      onAddSection={addSection}
                                      isLastSection={index === sectionFields.length - 1}
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                              <DragOverlay>
                                {activeSectionId ? (
                                  <div className="opacity-50 bg-background border rounded-lg p-4">
                                    Dragging section...
                                  </div>
                                ) : null}
                              </DragOverlay>
                            </DndContext>
                          </div>

                          {/* Branches Section */}
                          <div>
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                                <h3 className="text-sm font-semibold mb-1">Branches</h3>
                                <p className="text-xs text-muted-foreground">
                                  Add at least one branch for this company.
                                </p>
                              </div>
                              <Button type="button" variant="outline" size="sm" onClick={addBranch}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Branch
                              </Button>
                            </div>
                            <div className="space-y-4">
                              {branchFields.map((field, index) => (
                                <Card key={field.id} className="relative">
                                  <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">Branch {index + 1}</CardTitle>
                                        {index === 0 && <Badge variant="secondary">Main Branch</Badge>}
                                      </div>
                                      {branchFields.length > 1 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removeBranchHandler(index)}
                                          className="h-8 w-8 text-destructive hover:text-destructive">
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                    <FormField
                                      control={form.control}
                                      name={`branches.${index}.name`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Branch Name *</FormLabel>
                                          <FormControl>
                                            <Input placeholder="Headquarters" {...field} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <div className="grid grid-cols-1 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`branches.${index}.email`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                              <Input type="email" placeholder="branch@acme.com" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />

                                      <FormField
                                        control={form.control}
                                        name={`branches.${index}.phone`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Phone</FormLabel>
                                            <FormControl>
                                              <Input placeholder="+1 (555) 123-4567" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>

                                    <FormField
                                      control={form.control}
                                      name={`branches.${index}.address`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Address</FormLabel>
                                          <FormControl>
                                            <Textarea placeholder="Branch address" {...field} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  </CardContent>
                                  {index < branchFields.length - 1 && <Separator className="mt-4" />}
                                </Card>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Right Column: Activity, Comments, Messages */}
                    <div>
                      <Card className="h-full">
                        <CardContent className="pt-6">
                          <Tabs defaultValue="activity" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="activity">Activity</TabsTrigger>
                              <TabsTrigger value="comment">Comment</TabsTrigger>
                              <TabsTrigger value="message">Message</TabsTrigger>
                            </TabsList>

                            <TabsContent value="activity" className="mt-4">
                              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                                {activities.length === 0 ? (
                                  <div className="text-center py-8 text-sm text-muted-foreground">
                                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>No activities yet</p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {activities.map((activity) => (
                                      <div key={activity.id} className="flex gap-3 pb-3 border-b last:border-0">
                                        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{activity.message}</p>
                                          <div className="flex items-center gap-2 mt-1">
                                            {activity.userId && (
                                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                User #{activity.userId}
                                              </span>
                                            )}
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {new Date(activity.createdAt).toLocaleString()}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TabsContent>

                            <TabsContent value="comment" className="mt-4">
                              <div className="space-y-4 flex flex-col h-[500px]">
                                <div className="flex-1 overflow-y-auto space-y-3">
                                  {comments.length === 0 ? (
                                    <div className="text-center py-8 text-sm text-muted-foreground">
                                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No comments yet</p>
                                    </div>
                                  ) : (
                                    comments.map((comment) => (
                                      <div key={comment.id} className="p-3 bg-muted rounded-lg">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="flex items-center gap-2">
                                            {comment.userId && (
                                              <span className="text-xs font-medium flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                User #{comment.userId}
                                              </span>
                                            )}
                                          </div>
                                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {new Date(comment.createdAt).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-sm">{comment.text}</p>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="border-t pt-4">
                                  <div className="flex gap-2">
                                    <Textarea
                                      placeholder="Add a comment..."
                                      value={newComment}
                                      onChange={(e) => setNewComment(e.target.value)}
                                      className="min-h-[80px]"
                                    />
                                    <Button
                                      type="button"
                                      onClick={async () => {
                                        if (newComment.trim() && currentCompanyId) {
                                          try {
                                            const newCommentData = await commentsApi.createComment({
                                              text: newComment,
                                              companyId: currentCompanyId,
                                            });
                                            setComments([newCommentData, ...comments]);
                                            setNewComment("");
                                            toast.success("Comment added");
                                          } catch (error: any) {
                                            toast.error("Failed to add comment", {
                                              description: error.message || "An error occurred",
                                            });
                                          }
                                        } else if (newComment.trim() && !currentCompanyId) {
                                          toast.error("Please create the company first");
                                        }
                                      }}
                                      disabled={!newComment.trim() || !currentCompanyId}>
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </TabsContent>

                            <TabsContent value="message" className="mt-4">
                              <div className="space-y-4 flex flex-col h-[500px]">
                                <div className="flex-1 overflow-y-auto space-y-3">
                                  {messages.length === 0 ? (
                                    <div className="text-center py-8 text-sm text-muted-foreground">
                                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No messages yet</p>
                                    </div>
                                  ) : (
                                    messages.map((message) => (
                                      <div
                                        key={message.id}
                                        className={`flex ${message.isSent ? "justify-end" : "justify-start"}`}>
                                        <div
                                          className={`max-w-[80%] p-3 rounded-lg ${
                                            message.isSent
                                              ? "bg-primary text-primary-foreground"
                                              : "bg-muted"
                                          }`}>
                                          <div className="flex items-center gap-2 mb-1">
                                            {message.userId && (
                                              <span className="text-xs font-medium flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                User #{message.userId}
                                              </span>
                                            )}
                                            <span
                                              className={`text-xs flex items-center gap-1 ${
                                                message.isSent
                                                  ? "text-primary-foreground/70"
                                                  : "text-muted-foreground"
                                              }`}>
                                              <Clock className="h-3 w-3" />
                                              {new Date(message.createdAt).toLocaleString()}
                                            </span>
                                          </div>
                                          <p className="text-sm">{message.text}</p>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="border-t pt-4">
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="Type a message..."
                                      value={newMessage}
                                      onChange={(e) => setNewMessage(e.target.value)}
                                      onKeyDown={async (e) => {
                                        if (e.key === "Enter" && newMessage.trim() && currentCompanyId) {
                                          try {
                                            const newMessageData = await messagesApi.createMessage({
                                              text: newMessage,
                                              companyId: currentCompanyId,
                                              isSent: true,
                                            });
                                            setMessages([newMessageData, ...messages]);
                                            setNewMessage("");
                                            toast.success("Message sent");
                                          } catch (error: any) {
                                            toast.error("Failed to send message", {
                                              description: error.message || "An error occurred",
                                            });
                                          }
                                        }
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      onClick={async () => {
                                        if (newMessage.trim() && currentCompanyId) {
                                          try {
                                            const newMessageData = await messagesApi.createMessage({
                                              text: newMessage,
                                              companyId: currentCompanyId,
                                              isSent: true,
                                            });
                                            setMessages([newMessageData, ...messages]);
                                            setNewMessage("");
                                            toast.success("Message sent");
                                          } catch (error: any) {
                                            toast.error("Failed to send message", {
                                              description: error.message || "An error occurred",
                                            });
                                          }
                                        } else if (newMessage.trim() && !currentCompanyId) {
                                          toast.error("Please create the company first");
                                        }
                                      }}
                                      disabled={!newMessage.trim() || !currentCompanyId}>
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>
                )}

                {/* Other Default Tabs */}
                {customTabs.length === 0 && (
                <>
                <TabsContent value="deals" className="space-y-6 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Deals</CardTitle>
                      <CardDescription>Configure deals settings for this company.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Deals configuration will be available here.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="estimates" className="space-y-6 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Estimates</CardTitle>
                      <CardDescription>
                        Configure estimates settings for this company.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Estimates configuration will be available here.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="invoices" className="space-y-6 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Invoices</CardTitle>
                      <CardDescription>Configure invoice settings for this company.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Invoice configuration will be available here.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history" className="space-y-6 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>History</CardTitle>
                      <CardDescription>
                        View company creation and modification history.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Company history will be displayed here after creation.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
                </>
                )}
              </Tabs>
            </div>

            {/* Form Actions - Sticky Footer */}
            <div className="sticky bottom-0 border-t bg-background px-6 py-4 flex justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (config.onCancel) {
                    config.onCancel();
                  }
                  onOpenChange(false);
                }}
                disabled={isSubmitting}>
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// CreateCompanyDialog - Wrapper using DynamicFormDialog with company-specific config
export function CreateCompanyDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateCompanyDialogProps) {
  const companyConfig: DialogConfig = {
    title: "Create New Company",
    description: "Register a new company and its branches. Each company will have a unique URL for access.",
    submitLabel: "Create Company",
    cancelLabel: "Cancel",
    showFormSections: true,
    showBranches: true,
    showActivityTabs: true,
    defaultTab: "general",
    // Default tabs will be used (General, Deals, Estimates, Invoices, History)
    tabs: [],
    // Don't provide onSubmit - let DynamicFormDialog use the default company creation logic
  };

  return (
    <DynamicFormDialog
      open={open}
      onOpenChange={onOpenChange}
      config={companyConfig}
      onSuccess={onSuccess}
    />
  );
}
