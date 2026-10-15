"use client";

import * as React from "react";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Pencil, Folder, Edit2, X, Check, FileText, Plus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FormSection, FormField } from "./form-builder";
import { ExistingFieldsDialog } from "./existing-fields-dialog";
import { SectionPermissionsDialog } from "./section-permissions-dialog";
import { toast } from "sonner";

interface SectionItemProps {
  section: FormSection;
  onUpdate: (section: FormSection) => void;
  onDelete: (id: string) => void;
  onAddField?: (field: FormField) => void;
  onAddFields?: (fields: FormField[]) => void;
  entityType?: string;
  existingFieldIds?: string[];
  isEmpty?: boolean;
  children: React.ReactNode;
}

export function SectionItem({ section, onUpdate, onDelete, onAddField, onAddFields, entityType, existingFieldIds = [], isEmpty = false, children }: SectionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description || "");
  const [position, setPosition] = useState<"left" | "right" | "top" | "bottom" | "center">(section.position || "center");
  const [columns, setColumns] = useState<number>(section.columns || 12);
  const [existingFieldsDialogOpen, setExistingFieldsDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: section.id,
    data: {
      type: "section",
      section
    }
  });

  // Make the section's content area droppable for fields
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `section-content-${section.id}`,
    data: {
      type: "section",
      sectionId: section.id,
      section
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    onUpdate({
      ...section,
      title,
      description: description || undefined,
      position: position || "center",
      columns: columns || 12
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(section.title);
    setDescription(section.description || "");
    setPosition(section.position || "center");
    setColumns(section.columns || 12);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg bg-background"
    >
      <div className="border-b p-4 bg-muted/30">
        <div className="flex items-start gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing mt-1"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          
          {isEditing ? (
            <div className="flex-1 space-y-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Section title..."
                className="font-semibold"
                autoFocus
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Section description (optional)..."
                rows={2}
                className="text-sm"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Columns (out of 12)</label>
                  <Select 
                    value={columns.toString()} 
                    onValueChange={(value) => {
                      const newColumns = parseInt(value);
                      setColumns(newColumns);
                      // When columns is 1-3, adjust position to center if it's top/bottom
                      // Use setTimeout to avoid state update conflicts
                      if (newColumns <= 3 && (position === "top" || position === "bottom")) {
                        setTimeout(() => setPosition("center"), 0);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} {num === 12 ? "(Full)" : num === 6 ? "(Half)" : num === 4 ? "(Third)" : num === 3 ? "(Quarter)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Position</label>
                  <Select 
                    value={position} 
                    onValueChange={(value: "left" | "right" | "top" | "bottom" | "center") => setPosition(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="left" disabled={columns <= 3}>Left</SelectItem>
                      <SelectItem value="right" disabled={columns <= 3}>Right</SelectItem>
                      <SelectItem value="top" disabled={columns <= 3}>Top</SelectItem>
                      <SelectItem value="bottom" disabled={columns <= 3}>Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {columns <= 3 && (
                <p className="text-xs text-muted-foreground">
                  For sections with {columns} column{columns !== 1 ? "s" : ""}, position is automatically set to "Center" for better layout.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!title.trim()}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">{section.title}</h3>
                </div>
                {section.description && (
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                )}
              </div>
              <div className="flex gap-1">
                {entityType && onAddFields && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExistingFieldsDialogOpen(true)}
                    title="Add existing fields"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    console.log('Shield clicked for section:', section);
                    // Check for database ID first, then fall back to parsing the string ID
                    const sectionIdNum = (section as any).dbId || (typeof section.id === 'number' ? section.id : parseInt(String(section.id)));
                    console.log('Section ID (dbId/parsed):', sectionIdNum, 'isNaN:', isNaN(sectionIdNum));
                    if (isNaN(sectionIdNum) || sectionIdNum <= 0) {
                      toast.error("Please save the section to database first before managing permissions");
                      return;
                    }
                    console.log('Opening permissions dialog for section:', sectionIdNum);
                    setPermissionsDialogOpen(true);
                  }}
                  title="Manage permissions"
                >
                  <Shield className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete section "${section.title}"?`)) {
                      onDelete(section.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      <div 
        ref={setDroppableRef}
        className={cn(
          "p-4 space-y-4 min-h-[120px] transition-colors relative rounded-lg",
          isOver && "bg-primary/5 border-2 border-dashed border-primary",
          isEmpty && !isOver && "border-2 border-dashed border-muted-foreground/20"
        )}
      >
        {children}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
            {isOver ? (
              <span className="font-medium text-primary">Drop fields here</span>
            ) : (
              <span>Drag fields here to add them to this section</span>
            )}
          </div>
        )}
        {isOver && !isEmpty && (
          <div className={cn(
            "absolute inset-0 flex items-center justify-center text-sm font-medium text-primary pointer-events-none rounded-lg opacity-50",
            "bg-primary/5 border-2 border-dashed border-primary"
          )}>
            Drop fields here
          </div>
        )}
      </div>
      
      {entityType && onAddFields && (
        <ExistingFieldsDialog
          open={existingFieldsDialogOpen}
          onOpenChange={setExistingFieldsDialogOpen}
          entityType={entityType}
          onFieldsSelect={onAddFields}
          existingFieldIds={existingFieldIds}
        />
      )}
      {(() => {
        // Check for database ID first, then fall back to parsing the string ID
        const sectionIdNum = (section as any).dbId || (typeof section.id === 'number' ? section.id : parseInt(String(section.id)));
        console.log('Section ID check:', { originalId: section.id, dbId: (section as any).dbId, parsedId: sectionIdNum, isNaN: isNaN(sectionIdNum), dialogOpen: permissionsDialogOpen });
        if (isNaN(sectionIdNum) || sectionIdNum <= 0) {
          return null;
        }
        return (
          <SectionPermissionsDialog
            open={permissionsDialogOpen}
            onOpenChange={setPermissionsDialogOpen}
            sectionId={sectionIdNum}
            sectionTitle={section.title}
          />
        );
      })()}
    </div>
  );
}
