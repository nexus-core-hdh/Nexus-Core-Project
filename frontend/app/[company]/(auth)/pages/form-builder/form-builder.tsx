"use client";

import * as React from "react";
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
  useDraggable,
  CollisionDetection
} from "@dnd-kit/core";
import { pointerWithin } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Pencil, Type, Hash, Mail, Phone, Calendar, FileText, CheckSquare, Radio, List, Image, Link2, MapPin, Building2, User, DollarSign, Percent, Clock, Folder, Edit2, X, Lock, Search, Palette, Sliders, AlignLeft, PenTool, Star, ToggleLeft, EyeOff, Tag, CreditCard, Fingerprint, Globe, Shield, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FieldConfigDialog } from "./field-config-dialog";
import { SectionItem } from "./section-item";
import { FieldPermissionsDialog } from "./field-permissions-dialog";
import { toast } from "sonner";
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

export type FormSection = {
  id: string;
  title: string;
  description?: string;
  order: number;
  position?: "left" | "right" | "top" | "bottom" | "center"; // Position where section should be displayed
  columns?: number; // Number of columns out of 12 (1-12), default 12
  dbId?: number; // Database ID for permissions
};

export type FormField = {
  id: string;
  sectionId?: string; // Field belongs to a section
  type: string;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  options?: Array<{ label: string; value: string }>;
  databaseConfig?: {
    model: string;
    displayField: string;
    valueField: string;
    filter?: any;
  };
  helpText?: string;
  width?: "full" | "half" | "third" | "quarter";
  conditional?: {
    field: string;
    operator: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";
    value: any;
  };
  readonly?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
  customClass?: string;
  typeOptions?: string[]; // Options for phone/email/website fields (e.g., ["Work", "Mobile", "Home"])
  allowMultiple?: boolean; // Allow multiple entries for phone/email/website fields
  dbId?: number; // Database ID for permissions
};

const fieldTypes = [
  { type: "text", label: "Text", icon: Type, description: "Single line text input" },
  { type: "textarea", label: "Textarea", icon: FileText, description: "Multi-line text input" },
  { type: "number", label: "Number", icon: Hash, description: "Numeric input" },
  { type: "email", label: "Email", icon: Mail, description: "Email address input" },
  { type: "phone", label: "Phone", icon: Phone, description: "Phone number input" },
  { type: "password", label: "Password", icon: Lock, description: "Password input (masked)" },
  { type: "search", label: "Search", icon: Search, description: "Search input field" },
  { type: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { type: "time", label: "Time", icon: Clock, description: "Time picker" },
  { type: "datetime", label: "Date & Time", icon: Clock, description: "Date and time picker" },
  { type: "month", label: "Month", icon: Calendar, description: "Month picker" },
  { type: "week", label: "Week", icon: Calendar, description: "Week picker" },
  { type: "select", label: "Select", icon: List, description: "Dropdown select" },
  { type: "multiselect", label: "Multi-Select", icon: CheckSquare, description: "Multiple selection dropdown" },
  { type: "radio", label: "Radio", icon: Radio, description: "Radio button group" },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, description: "Checkbox input" },
  { type: "toggle", label: "Toggle", icon: ToggleLeft, description: "Toggle switch" },
  { type: "file", label: "File Upload", icon: Image, description: "File upload input" },
  { type: "image", label: "Image Upload", icon: Image, description: "Image upload input" },
  { type: "url", label: "URL", icon: Link2, description: "URL input" },
  { type: "website", label: "Website", icon: Globe, description: "Website URL input" },
  { type: "address", label: "Address", icon: MapPin, description: "Address input with street, city, state, zip" },
  { type: "color", label: "Color Picker", icon: Palette, description: "Color picker input" },
  { type: "range", label: "Range Slider", icon: Sliders, description: "Range slider input" },
  { type: "rating", label: "Rating", icon: Star, description: "Star rating input" },
  { type: "tags", label: "Tags", icon: Tag, description: "Tags input (multiple tags)" },
  { type: "richText", label: "Rich Text", icon: AlignLeft, description: "Rich text editor" },
  { type: "signature", label: "Signature", icon: PenTool, description: "Digital signature pad" },
  { type: "hidden", label: "Hidden", icon: EyeOff, description: "Hidden field (not visible)" },
  { type: "company", label: "Company", icon: Building2, description: "Company selector" },
  { type: "user", label: "User", icon: User, description: "User selector" },
  { type: "currency", label: "Currency", icon: DollarSign, description: "Currency input" },
  { type: "percentage", label: "Percentage", icon: Percent, description: "Percentage input" },
  { type: "creditCard", label: "Credit Card", icon: CreditCard, description: "Credit card number input" },
  { type: "ssn", label: "SSN", icon: Fingerprint, description: "Social Security Number input" }
];

interface FormBuilderProps {
  fields: FormField[];
  sections?: FormSection[];
  onFieldsChange: (fields: FormField[]) => void;
  onSectionsChange: (sections: FormSection[]) => void;
  entityType?: string; // Entity type for filtering existing fields
}

function FieldPaletteItem({ fieldType, isSection = false }: { fieldType?: typeof fieldTypes[0]; isSection?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: isSection ? "palette-section" : `palette-${fieldType!.type}`,
    data: {
      type: "palette",
      fieldType: isSection ? "section" : fieldType!.type
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1
  };

  if (isSection) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="flex items-center gap-2 p-3 border rounded-lg cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors border-primary/50 bg-primary/5"
      >
        <Folder className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-medium">Section</div>
          <div className="text-xs text-muted-foreground">Group fields into sections</div>
        </div>
      </div>
    );
  }

  const Icon = fieldType!.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 p-3 border rounded-lg cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-sm font-medium">{fieldType!.label}</div>
        <div className="text-xs text-muted-foreground">{fieldType!.description}</div>
      </div>
    </div>
  );
}

function FormFieldItem({ 
  field, 
  onEdit, 
  onDelete,
  onFieldUpdate,
  allFields,
  onFieldsChange
}: { 
  field: FormField; 
  onEdit: () => void; 
  onDelete: () => void;
  onFieldUpdate?: (field: FormField) => void;
  allFields?: FormField[];
  onFieldsChange?: (fields: FormField[]) => void;
}) {
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: {
      type: "field",
      field
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const fieldType = fieldTypes.find((ft) => ft.type === field.type);
  const Icon = fieldType?.icon || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative border rounded-lg p-4 bg-background hover:border-primary/50 transition-colors",
        field.width === "half" && "w-1/2",
        field.width === "third" && "w-1/3",
        field.width === "quarter" && "w-1/4"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing mt-1"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{field.label}</span>
                {field.required && <span className="text-destructive text-xs">*</span>}
                <Badge variant="outline" className="text-xs">{field.type}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {field.name} {field.placeholder && `• ${field.placeholder}`}
              </div>
            </div>
          </div>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('Shield clicked for field:', field);
              // Check for database ID first, then fall back to parsing the string ID
              const fieldIdNum = (field as any).dbId || (typeof field.id === 'number' ? field.id : parseInt(String(field.id)));
              console.log('Field ID (dbId/parsed):', fieldIdNum, 'isNaN:', isNaN(fieldIdNum));
              if (isNaN(fieldIdNum) || fieldIdNum <= 0) {
                toast.error("Please save the field to database first before managing permissions");
                return;
              }
              console.log('Opening permissions dialog for field:', fieldIdNum);
              setPermissionsDialogOpen(true);
            }}
            title="Manage permissions"
          >
            <Shield className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {(() => {
        // Check for database ID first, then fall back to parsing the string ID
        const fieldIdNum = (field as any).dbId || (typeof field.id === 'number' ? field.id : parseInt(String(field.id)));
        console.log('Field ID check:', { originalId: field.id, dbId: (field as any).dbId, parsedId: fieldIdNum, isNaN: isNaN(fieldIdNum) });
        if (isNaN(fieldIdNum) || fieldIdNum <= 0) {
          return null;
        }
        return (
          <FieldPermissionsDialog
            open={permissionsDialogOpen}
            onOpenChange={setPermissionsDialogOpen}
            fieldId={fieldIdNum}
            fieldLabel={field.label}
          />
        );
      })()}
    </div>
  );
}

function FormCanvas({ 
  fields, 
  sections, 
  onEdit, 
  onDelete, 
  onUpdateSection, 
  onDeleteSection,
  onAddFieldToSection,
  onAddFieldsToSection,
  onFieldUpdate,
  onFieldsChange,
  entityType
}: { 
  fields: FormField[]; 
  sections: FormSection[];
  onEdit: (field: FormField) => void; 
  onDelete: (id: string) => void;
  onUpdateSection: (section: FormSection) => void;
  onDeleteSection: (id: string) => void;
  onAddFieldToSection: (sectionId: string, field: FormField) => void;
  onAddFieldsToSection?: (sectionId: string, fields: FormField[]) => void;
  onFieldUpdate?: (field: FormField) => void;
  onFieldsChange?: (fields: FormField[]) => void;
  entityType?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas",
    data: {
      type: "canvas"
    }
  });

  // Group fields by section
  const fieldsBySection = sections.reduce((acc, section) => {
    acc[section.id] = fields.filter((f) => f.sectionId === section.id);
    return acc;
  }, {} as Record<string, FormField[]>);

  const fieldsWithoutSection = fields.filter((f) => !f.sectionId);

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[400px] p-4 space-y-4 rounded-lg border-2 border-dashed transition-colors",
        isOver ? "border-primary bg-primary/5" : "border-muted"
      )}
    >
      {fields.length === 0 && sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[400px] text-center">
          <Plus className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Drag fields here to build your form</p>
          <p className="text-sm text-muted-foreground mt-2">Or click on a field type from the palette</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Render sections with their fields using grid system */}
          {(() => {
            // Group sections into rows based on column count and available space
            const rows: FormSection[][] = [];
            let currentRow: FormSection[] = [];
            let currentRowUsed = 0;

            sortedSections.forEach((section) => {
              const position = section.position || "center";
              const columns = section.columns || 12;
              
              // If section takes full width (12 columns), always start a new row
              if (columns >= 12) {
                if (currentRow.length > 0) {
                  rows.push([...currentRow]);
                  currentRow = [];
                  currentRowUsed = 0;
                }
                rows.push([section]);
                currentRow = [];
                currentRowUsed = 0;
              } 
              // For sections with less than 12 columns, try to fit in current row
              else {
                if (currentRowUsed + columns <= 12) {
                  // Can fit in current row
                  currentRow.push(section);
                  currentRowUsed += columns;
                } else {
                  // Start new row
                  if (currentRow.length > 0) {
                    rows.push([...currentRow]);
                  }
                  currentRow = [section];
                  currentRowUsed = columns;
                }
              }
            });

            // Add remaining row
            if (currentRow.length > 0) {
              rows.push(currentRow);
            }

            return rows.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid grid-cols-12 gap-4">
                {row.map((section) => {
                  const sectionFields = fieldsBySection[section.id] || [];
                  const isEmpty = sectionFields.length === 0;
                  const position = section.position || "center";
                  const columns = section.columns || 12;
                  
                  // Determine column span and alignment
                  const colSpan = Math.min(Math.max(columns, 1), 12);
                  const colSpanClasses: Record<number, string> = {
                    1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
                    5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
                    9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12"
                  };
                  const colSpanClass = colSpanClasses[colSpan] || "col-span-12";
                  
                  // For center position, center the section within its columns
                  const justifyClass = position === "center" ? "justify-self-center" : 
                                      position === "right" ? "justify-self-end" : 
                                      "justify-self-start";
                  
                  return (
                    <div
                      key={section.id}
                      className={cn(colSpanClass, justifyClass, "w-full")}
                    >
                      <SectionItem
                        section={section}
                        onUpdate={onUpdateSection}
                        onDelete={onDeleteSection}
                        onAddField={(field) => onAddFieldToSection(section.id, field)}
                        onAddFields={onAddFieldsToSection ? (fieldsToAdd) => onAddFieldsToSection(section.id, fieldsToAdd) : undefined}
                        entityType={entityType}
                        existingFieldIds={fields.map(f => f.id)}
                        isEmpty={isEmpty}
                      >
                        <SortableContext
                          items={sectionFields.map((f) => f.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="flex flex-wrap gap-4">
                            {sectionFields.map((field) => (
                              <FormFieldItem
                                key={field.id}
                                field={field}
                                onEdit={() => onEdit(field)}
                                onDelete={() => onDelete(field.id)}
                                onFieldUpdate={onFieldUpdate}
                                allFields={fields}
                                onFieldsChange={onFieldsChange}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </SectionItem>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
          

          {/* Fields without section */}
          {fieldsWithoutSection.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {fieldsWithoutSection.map((field) => (
                <FormFieldItem
                  key={field.id}
                  field={field}
                  onEdit={() => onEdit(field)}
                  onDelete={() => onDelete(field.id)}
                  onFieldUpdate={onFieldUpdate}
                  allFields={fields}
                  onFieldsChange={onFieldsChange}
                />
              ))}
            </div>
          )}
          
          {/* Empty drop zone at the bottom to ensure canvas is always droppable */}
          <div className="h-8" />
        </div>
      )}
    </div>
  );
}

export function FormBuilder({ fields, sections = [], onFieldsChange, onSectionsChange, entityType }: FormBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);
  
  // Ensure sections is always an array
  const currentSections: FormSection[] = Array.isArray(sections) ? sections : [];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activeData = active.data.current;
    const overData = over.data.current;

    // Use refs to get current values to avoid stale closures
    const currentFields = fieldsRef.current;
    const currentOnFieldsChange = onFieldsChangeRef.current;
    const currentSections = sectionsRef.current;

    // FIRST PRIORITY: Check if dropping a field into ANY section (content area or header)
    // This must come before canvas checks to ensure section drops work correctly
    // This handles drops on newly created sections and prevents fields from going to default section
    if (activeData?.type === "palette" && activeData.fieldType !== "section") {
      let targetSectionId: string | undefined;
      
      // CRITICAL: Check section-content- ID pattern FIRST - this is the most reliable indicator
      // When you drop on a section's content area, over.id will be "section-content-${sectionId}"
      if (over.id && typeof over.id === "string" && over.id.startsWith("section-content-")) {
        const extractedSectionId = over.id.replace("section-content-", "");
        if (currentSections.some(s => s.id === extractedSectionId)) {
          targetSectionId = extractedSectionId;
        }
      }
      
      // Method 2: Check overData.sectionId (from section content droppable data) - high priority
      // This should match Method 1, but check both for redundancy
      if (!targetSectionId && overData?.sectionId && typeof overData.sectionId === "string") {
        const sectionId = overData.sectionId;
        if (currentSections.some(s => s.id === sectionId)) {
          targetSectionId = sectionId;
        }
      }
      
      // Method 3: Check overData.section object (if section object is provided)
      if (!targetSectionId && overData?.section?.id) {
        if (currentSections.some(s => s.id === overData.section.id)) {
          targetSectionId = overData.section.id;
        }
      }
      
      // Method 4: Check if dropping on section header (section ID directly from useSortable)
      // Only check if not already matched and ID doesn't match section-content pattern
      // This should be last as it might match incorrectly
      if (!targetSectionId && over.id && typeof over.id === "string" && !over.id.startsWith("section-content-") && !over.id.startsWith("field-") && !over.id.startsWith("canvas") && !over.id.startsWith("palette-")) {
        if (currentSections.some(s => s.id === over.id)) {
          targetSectionId = over.id;
        }
      }
      
      // If we found a valid section, add the field to that specific section
      if (targetSectionId && currentSections.some(s => s.id === targetSectionId)) {
        const fieldType = activeData.fieldType;
        const newField: FormField = {
          id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sectionId: targetSectionId, // Explicitly set to the detected target section
          type: fieldType,
          label: fieldTypes.find((ft) => ft.type === fieldType)?.label || fieldType,
          name: fieldType.toLowerCase().replace(/\s+/g, "-"),
          required: false,
          width: "full"
        };
        // Use refs to avoid stale closures
        const currentFields = fieldsRef.current;
        const currentOnFieldsChange = onFieldsChangeRef.current;
        currentOnFieldsChange([...currentFields, newField]);
        setActiveId(null);
        return;
      }
    }

    // If dragging section from palette - can drop on canvas, existing section, or field
    if (activeData?.type === "palette" && activeData.fieldType === "section") {
      // If dropping on an existing section, add the new section after it
      if (overData?.type === "section") {
        const targetSectionIndex = currentSections.findIndex((s) => s.id === over.id);
        if (targetSectionIndex !== -1) {
          const newSection: FormSection = {
            id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: `Section ${currentSections.length + 1}`,
            order: targetSectionIndex + 1,
            position: "center",
            columns: 12
          };
          const updatedSections = [...currentSections];
          updatedSections.splice(targetSectionIndex + 1, 0, newSection);
          const reordered = updatedSections.map((s, idx) => ({ ...s, order: idx }));
          onSectionsChange(reordered);
          setActiveId(null);
          return;
        }
      }
      // If dropping on a field, add section after the field's section (or at end if no section)
      else if (overData?.type === "field") {
        const targetField = fields.find((f) => f.id === over.id);
        if (targetField?.sectionId) {
          const targetSectionIndex = currentSections.findIndex((s) => s.id === targetField.sectionId);
          if (targetSectionIndex !== -1) {
            const newSection: FormSection = {
              id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: `Section ${currentSections.length + 1}`,
              order: targetSectionIndex + 1,
              position: "center"
            };
            const updatedSections = [...currentSections];
            updatedSections.splice(targetSectionIndex + 1, 0, newSection);
            const reordered = updatedSections.map((s, idx) => ({ ...s, order: idx }));
            onSectionsChange(reordered);
            setActiveId(null);
            return;
          }
        } else {
          // Field has no section, add section at the end
            const newSection: FormSection = {
              id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: `Section ${currentSections.length + 1}`,
              order: currentSections.length,
              position: "center",
              columns: 12
            };
          onSectionsChange([...currentSections, newSection]);
          setActiveId(null);
          return;
        }
      }
      // Default: Check if dropping on canvas (either by data type or by ID) - this should catch empty space
      // If none of the above conditions match, assume we're dropping on canvas
      if (overData?.type === "canvas" || over.id === "canvas" || !overData?.type) {
            const newSection: FormSection = {
              id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: `Section ${currentSections.length + 1}`,
              order: currentSections.length,
              position: "center",
              columns: 12
            };
        onSectionsChange([...currentSections, newSection]);
        setActiveId(null);
        return;
      }
    }
    // If dragging an existing section onto the canvas (reordering to the end)
    else if (activeData?.type === "section" && overData?.type === "canvas") {
      // Reorder to the end
      const oldIndex = currentSections.findIndex((s) => s.id === active.id);
      if (oldIndex !== -1) {
        const reordered = [...currentSections];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.push(moved);
        const updated = reordered.map((s, idx) => ({ ...s, order: idx }));
        onSectionsChange(updated);
      }
    }
    
    // If dragging from palette to canvas (for regular fields, not sections - sections are handled above)
    // Only add to canvas if we're NOT dropping on a section
    if (activeData?.type === "palette" && activeData.fieldType !== "section" && (overData?.type === "canvas" || over.id === "canvas") && !over.id?.toString().startsWith("section-content-") && !currentSections.some(s => s.id === over.id)) {
      const fieldType = activeData.fieldType;
      const newField: FormField = {
        id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: fieldType,
        label: fieldTypes.find((ft) => ft.type === fieldType)?.label || fieldType,
        name: fieldType.toLowerCase().replace(/\s+/g, "-"),
        required: false,
        width: "full",
        // If it's a tabs field, initialize with default tabs
        ...(fieldType === "tabs" && {
          tabs: [
            { id: `tab-${Date.now()}-1`, label: "Tab 1", fields: [] },
            { id: `tab-${Date.now()}-2`, label: "Tab 2", fields: [] }
          ]
        })
      };
      // Use refs to avoid stale closures
      const currentFields = fieldsRef.current;
      const currentOnFieldsChange = onFieldsChangeRef.current;
      currentOnFieldsChange([...currentFields, newField]);
      setActiveId(null);
      return;
    }
    // If reordering sections - check if dropping on section directly
    else if (activeData?.type === "section" && overData?.type === "section") {
      if (onSectionsChange && currentSections.length > 0) {
        const oldIndex = currentSections.findIndex((s) => s.id === active.id);
        const newIndex = currentSections.findIndex((s) => s.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(currentSections, oldIndex, newIndex);
          // Update order numbers
          const updated = reordered.map((s, idx) => ({ ...s, order: idx }));
          onSectionsChange(updated);
        }
      }
    }
    // If dragging a section over a field, treat it as dropping on that field's section
    else if (activeData?.type === "section" && overData?.type === "field") {
      // Use refs to avoid stale closures
      const currentFields = fieldsRef.current;
      const targetField = currentFields.find((f) => f.id === over.id);
      if (targetField?.sectionId) {
        // Find the section this field belongs to
        const targetSectionId = targetField.sectionId;
        const oldIndex = currentSections.findIndex((s) => s.id === active.id);
        const newIndex = currentSections.findIndex((s) => s.id === targetSectionId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex && onSectionsChange) {
          const reordered = arrayMove(currentSections, oldIndex, newIndex);
          const updated = reordered.map((s, idx) => ({ ...s, order: idx }));
          onSectionsChange(updated);
        }
      }
    }
    // If reordering fields
    else if (activeData?.type === "field" && overData?.type === "field") {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Use refs to avoid stale closures
        const currentFields = fieldsRef.current;
        const currentOnFieldsChange = onFieldsChangeRef.current;
        currentOnFieldsChange(arrayMove(currentFields, oldIndex, newIndex));
      }
    }
    // If dragging from palette to a field position
    if (activeData?.type === "palette" && activeData.fieldType !== "section" && overData?.type === "field") {
      const fieldType = activeData.fieldType;
      const targetIndex = fields.findIndex((f) => f.id === over.id);
      const targetField = fields[targetIndex];
      if (targetIndex !== -1) {
        const newField: FormField = {
          id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sectionId: targetField.sectionId,
          type: fieldType,
          label: fieldTypes.find((ft) => ft.type === fieldType)?.label || fieldType,
          name: fieldType.toLowerCase().replace(/\s+/g, "-"),
          required: false,
          width: "full"
        };
        const newFields = [...fields];
        newFields.splice(targetIndex, 0, newField);
        onFieldsChange(newFields);
        setActiveId(null);
        return;
      }
    }

    setActiveId(null);
  };

  const handleEdit = (field: FormField) => {
    setEditingField(field);
    setConfigDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setFieldToDelete(id);
  };

  const confirmDelete = () => {
    if (fieldToDelete) {
      onFieldsChange(fields.filter((f) => f.id !== fieldToDelete));
      setFieldToDelete(null);
    }
  };


  const handleUpdateSection = (updatedSection: FormSection) => {
    const index = currentSections.findIndex((s) => s.id === updatedSection.id);
    if (index !== -1) {
      const newSections = [...currentSections];
      newSections[index] = updatedSection;
      onSectionsChange(newSections);
    }
  };

  const handleDeleteSection = (id: string) => {
    // Remove section and reassign its fields to no section
    const sectionFields = fields.filter((f) => f.sectionId === id);
    const updatedFields = fields.map((f) => 
      f.sectionId === id ? { ...f, sectionId: undefined } : f
    );
    onFieldsChange(updatedFields);
    
    // Remove section and update order
    const filtered = currentSections.filter((s) => s.id !== id);
    const reordered = filtered.map((s, idx) => ({ ...s, order: idx }));
    onSectionsChange(reordered);
  };

  const handleAddFieldToSection = (sectionId: string, field: FormField) => {
    // Generate a new ID for the field
    const newField: FormField = {
      ...field,
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sectionId: sectionId
    };
    // Use refs to avoid stale closures
    const currentFields = fieldsRef.current;
    const currentOnFieldsChange = onFieldsChangeRef.current;
    currentOnFieldsChange([...currentFields, newField]);
  };

  const handleAddFieldsToSection = (sectionId: string, fieldsToAdd: FormField[]) => {
    // Generate new IDs for all fields
    const newFields: FormField[] = fieldsToAdd.map(field => ({
      ...field,
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sectionId: sectionId
    }));
    // Use refs to avoid stale closures
    const currentFields = fieldsRef.current;
    const currentOnFieldsChange = onFieldsChangeRef.current;
    currentOnFieldsChange([...currentFields, ...newFields]);
  };

  // Use refs to avoid dependency issues that cause infinite loops
  const fieldsRef = React.useRef(fields);
  const onFieldsChangeRef = React.useRef(onFieldsChange);
  const sectionsRef = React.useRef(currentSections);
  
  React.useEffect(() => {
    fieldsRef.current = fields;
    onFieldsChangeRef.current = onFieldsChange;
    sectionsRef.current = currentSections;
  }, [fields, onFieldsChange, currentSections]);
  
  const handleFieldUpdate = React.useCallback((updatedField: FormField) => {
    const currentFields = fieldsRef.current;
    const currentOnFieldsChange = onFieldsChangeRef.current;
    
    const index = currentFields.findIndex((f) => f.id === updatedField.id);
    if (index === -1) {
      return; // Field not found, skip update
    }
    
    const currentField = currentFields[index];
    
    // Deep comparison for field types
    const currentFieldStr = JSON.stringify(currentField);
    const updatedFieldStr = JSON.stringify(updatedField);
    
    if (currentFieldStr === updatedFieldStr) {
      return; // No change, skip update to prevent infinite loops
    }
    
    const newFields = [...currentFields];
    newFields[index] = updatedField;
    currentOnFieldsChange(newFields);
  }, []); // No dependencies - uses refs instead
  
  const handleTabFieldUpdate = React.useCallback((updatedField: FormField) => {
    handleFieldUpdate(updatedField);
  }, [handleFieldUpdate]);

  const activeField = activeId ? fields.find((f) => f.id === activeId) : null;
  const activeSection = activeId ? currentSections.find((s) => s.id === activeId) : null;

  const activePaletteItem = activeId === "palette-section"
    ? { type: "section", label: "Section", icon: Folder }
    : activeId?.startsWith("palette-") 
    ? fieldTypes.find((ft) => `palette-${ft.type}` === activeId)
    : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          // First try pointerWithin to find droppables under the cursor
          const pointerCollisions = pointerWithin(args);
          
          // Prioritize section content areas - these are the actual drop targets for fields
          const sectionContentCollisions = pointerCollisions.filter(
            (collision) => typeof collision.id === "string" && collision.id.startsWith("section-content-")
          );
          
          // If we find section content areas, return them (prioritized first)
          // This ensures drops on sections are detected before canvas or other droppables
          if (sectionContentCollisions.length > 0) {
            // Return all section content collisions (in order of detection)
            // The first one should be the topmost/highest z-index one
            return sectionContentCollisions;
          }
          
          // If no section or tab content areas found, fall back to closestCorners
          // This will handle canvas drops and section header drops
          
          // Otherwise, fall back to closestCorners for canvas and other collisions
          return closestCorners(args);
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-full gap-4">
          {/* Field Palette */}
          <div className="w-64 border-r p-4 overflow-y-auto">
            <h3 className="font-semibold mb-4">Field Types</h3>
            <div className="space-y-2">
              <FieldPaletteItem isSection />
              {fieldTypes.map((fieldType) => (
                <FieldPaletteItem key={fieldType.type} fieldType={fieldType} />
              ))}
            </div>
          </div>

          {/* Form Canvas */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Form Builder</h3>
              <div className="text-sm text-muted-foreground">
                {fields.length} field{fields.length !== 1 ? "s" : ""} • {currentSections.length} section{currentSections.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="space-y-4">
              <SortableContext 
                items={[...fields.map((f) => f.id), ...currentSections.map((s) => s.id)]} 
                strategy={verticalListSortingStrategy}
              >
                <FormCanvas
                  fields={fields}
                  sections={currentSections}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onUpdateSection={handleUpdateSection}
                  onDeleteSection={handleDeleteSection}
                  onAddFieldToSection={handleAddFieldToSection}
                  onAddFieldsToSection={handleAddFieldsToSection}
                  onFieldUpdate={handleTabFieldUpdate}
                  onFieldsChange={onFieldsChange}
                  entityType={entityType}
                />
              </SortableContext>
            </div>
          </div>
        </div>
        <DragOverlay>
          {activeField ? (
            <div className="border rounded-lg p-4 bg-background shadow-lg">
              <div className="flex items-center gap-2">
                <span className="font-medium">{activeField.label}</span>
                <Badge variant="outline">{activeField.type}</Badge>
              </div>
            </div>
          ) : activeSection ? (
            <div className="border rounded-lg p-3 bg-background shadow-lg flex items-center gap-2">
              <Folder className="h-4 w-4 text-primary" />
              <span className="font-medium">{activeSection.title}</span>
            </div>
          ) : activePaletteItem ? (
            <div className="border rounded-lg p-3 bg-background shadow-lg flex items-center gap-2">
              {activePaletteItem.type === "section" ? (
                <Folder className="h-4 w-4 text-primary" />
              ) : (
                <activePaletteItem.icon className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">{activePaletteItem.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editingField && (
        <FieldConfigDialog
          open={configDialogOpen}
          onOpenChange={(open) => {
            setConfigDialogOpen(open);
            if (!open) setEditingField(null);
          }}
          field={editingField}
          onSave={handleFieldUpdate}
        />
      )}

      <AlertDialog open={!!fieldToDelete} onOpenChange={(open) => !open && setFieldToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this field? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

