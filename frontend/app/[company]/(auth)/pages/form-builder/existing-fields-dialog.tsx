"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { formTemplatesApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormField } from "./form-builder";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FormFieldWithDescription = FormField & { description?: string | null };

const ENTITY_TYPES = [
  { value: "LEAD", label: "Lead" },
  { value: "DEAL", label: "Deal" },
  { value: "CONTACT", label: "Contact" },
  { value: "COMPANY", label: "Company" },
  { value: "USER", label: "User" },
  { value: "TASK", label: "Task" },
  { value: "INVOICE", label: "Invoice" },
  { value: "QUOTE", label: "Quote" },
  { value: "PRODUCT", label: "Product" },
  { value: "CUSTOM", label: "Custom" }
];

interface ExistingFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string; // Default entity type (can be overridden by dropdown)
  onFieldsSelect: (fields: FormField[]) => void;
  existingFieldIds?: string[]; // IDs of fields already in the current template
}

export function ExistingFieldsDialog({
  open,
  onOpenChange,
  entityType: defaultEntityType,
  onFieldsSelect,
  existingFieldIds = []
}: ExistingFieldsDialogProps) {
  const [fields, setFields] = useState<FormFieldWithDescription[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntityType, setSelectedEntityType] = useState<string>(
    defaultEntityType && ENTITY_TYPES.some(e => e.value === defaultEntityType) 
      ? defaultEntityType 
      : ENTITY_TYPES[0]?.value || ""
  );
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());

  const loadFields = useCallback(async () => {
    if (!selectedEntityType) return;
    
    try {
      setLoading(true);
      // Fetch all templates for the selected entity type
      const templates = await formTemplatesApi.getFormTemplates(
        undefined,
        undefined,
        selectedEntityType,
        undefined // Get both active and inactive
      );
      
      // Extract all fields from all templates
      const allFields: FormFieldWithDescription[] = [];
      const fieldMap = new Map<string, FormFieldWithDescription>(); // Use map to deduplicate by name
      
      (Array.isArray(templates) ? templates : []).forEach((template: any) => {
        const templateFields = Array.isArray(template.formFields) ? template.formFields : [];
        templateFields.forEach((field: FormFieldWithDescription) => {
          // Only add if not already added (deduplicate by name)
          if (!fieldMap.has(field.name)) {
            fieldMap.set(field.name, field);
            allFields.push(field);
          }
        });
      });
      
      setFields(allFields);
    } catch (error: any) {
      console.error("Error loading existing fields:", error);
      toast.error("Failed to load existing fields", {
        description: error.message || "An error occurred while fetching fields"
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEntityType]);

  useEffect(() => {
    if (open) {
      const initialEntityType = (defaultEntityType && ENTITY_TYPES.some(e => e.value === defaultEntityType))
        ? defaultEntityType 
        : ENTITY_TYPES[0]?.value || "";
      setSelectedEntityType(initialEntityType);
      setSelectedFieldIds(new Set());
      setSearchQuery("");
    }
  }, [open, defaultEntityType]);

  useEffect(() => {
    if (open && selectedEntityType) {
      loadFields();
    }
  }, [open, selectedEntityType, loadFields]);

  const filteredFields = fields.filter((field) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        field.label?.toLowerCase().includes(query) ||
        field.name?.toLowerCase().includes(query) ||
        field.type?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleFieldToggle = (fieldId: string) => {
    const newSelected = new Set(selectedFieldIds);
    if (newSelected.has(fieldId)) {
      newSelected.delete(fieldId);
    } else {
      newSelected.add(fieldId);
    }
    setSelectedFieldIds(newSelected);
  };

  const handleAddSelected = () => {
    const selectedFields = fields.filter(field => selectedFieldIds.has(field.id));
    
    if (selectedFields.length === 0) {
      toast.error("Please select at least one field");
      return;
    }

    // Generate new IDs for the fields to avoid conflicts
    const newFields: FormField[] = selectedFields.map(field => ({
      ...field,
      id: `${field.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sectionId: undefined // Will be set when added to a section
    }));

    onFieldsSelect(newFields);
    setSelectedFieldIds(new Set());
    onOpenChange(false);
  };

  const selectedCount = selectedFieldIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-w-[95vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Existing Fields</DialogTitle>
          <DialogDescription>
            Select fields from existing templates to add to your form. You can select multiple fields.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="space-y-2">
            <div>
              <Label htmlFor="entity-type" className="text-xs text-muted-foreground mb-1 block">
                Entity Type
              </Label>
              <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
                <SelectTrigger id="entity-type" className="w-full">
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((entity) => (
                    <SelectItem key={entity.value} value={entity.value}>
                      {entity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="search" className="text-xs text-muted-foreground mb-1 block">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search fields..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 text-muted-foreground"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading fields...</p>
            </div>
          ) : filteredFields.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No fields found matching your search." : "No fields found for this entity type."}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredFields.map((field) => {
                  const isExisting = existingFieldIds.includes(field.id);
                  const isSelected = selectedFieldIds.has(field.id);
                  return (
                    <Card
                      key={field.id}
                      className={cn(
                        "transition-all hover:shadow-md",
                        isExisting && "opacity-50",
                        isSelected && !isExisting && "ring-2 ring-primary"
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={isExisting}
                            onCheckedChange={() => handleFieldToggle(field.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm truncate">{field.label}</h4>
                              <Badge variant="outline" className="text-xs">
                                {field.type}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              Name: {field.name}
                            </p>
                            {field.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {field.description}
                              </p>
                            )}
                          </div>
                          {isExisting && (
                            <Badge variant="secondary" className="text-xs">Added</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedCount > 0 ? `${selectedCount} field${selectedCount > 1 ? 's' : ''} selected` : "No fields selected"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selectedCount === 0}
              >
                Add Selected ({selectedCount})
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
