"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PermissionData } from "./permission-tree-node";
import { getFieldDefinitions, FieldDefinition } from "../utils/field-definitions";

interface FieldPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourcePath: string;
  resourceName: string;
  permission: PermissionData | undefined;
  onFieldPermissionChange: (resourcePath: string, fieldPermissions: Record<string, { canRead: boolean; canWrite: boolean }>) => void;
}

export function FieldPermissionsDialog({
  open,
  onOpenChange,
  resourcePath,
  resourceName,
  permission,
  onFieldPermissionChange
}: FieldPermissionsDialogProps) {
  const fields = getFieldDefinitions(resourcePath);
  const [fieldPerms, setFieldPerms] = useState<Record<string, { canRead: boolean; canWrite: boolean }>>(
    permission?.fieldPermissions || {}
  );

  useEffect(() => {
    if (permission?.fieldPermissions) {
      setFieldPerms(permission.fieldPermissions);
    } else {
      // Initialize with all fields having read/write if parent has canRead/canWrite
      const initial: Record<string, { canRead: boolean; canWrite: boolean }> = {};
      fields.forEach(field => {
        initial[field.name] = {
          canRead: permission?.canRead || false,
          canWrite: permission?.canWrite || false
        };
      });
      setFieldPerms(initial);
    }
  }, [permission, fields]);

  const handleFieldPermissionChange = (fieldName: string, perm: "canRead" | "canWrite", value: boolean) => {
    setFieldPerms(prev => ({
      ...prev,
      [fieldName]: {
        ...(prev[fieldName] || { canRead: false, canWrite: false }),
        [perm]: value
      }
    }));
  };

  const handleSave = () => {
    onFieldPermissionChange(resourcePath, fieldPerms);
    onOpenChange(false);
  };

  const handleSelectAll = (perm: "canRead" | "canWrite", value: boolean) => {
    const updated: Record<string, { canRead: boolean; canWrite: boolean }> = {};
    fields.forEach(field => {
      updated[field.name] = {
        canRead: perm === "canRead" ? value : (fieldPerms[field.name]?.canRead || false),
        canWrite: perm === "canWrite" ? value : (fieldPerms[field.name]?.canWrite || false)
      };
    });
    setFieldPerms(updated);
  };

  if (fields.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Field Permissions</DialogTitle>
            <DialogDescription>
              No field definitions found for this resource.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Field Permissions - {resourceName}</DialogTitle>
          <DialogDescription>
            Configure field-level permissions. These override the general resource permissions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <span className="font-medium">Field</span>
            <div className="flex gap-8">
              <div className="flex items-center gap-2">
                <span className="text-sm">Read</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleSelectAll("canRead", true)}>
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleSelectAll("canRead", false)}>
                  None
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Write</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleSelectAll("canWrite", true)}>
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleSelectAll("canWrite", false)}>
                  None
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {fields.map((field) => {
              const fieldPerm = fieldPerms[field.name] || { canRead: false, canWrite: false };
              
              return (
                <div key={field.name} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50">
                  <div className="flex-1">
                    <div className="font-medium">{field.label}</div>
                    {field.description && (
                      <div className="text-sm text-muted-foreground">{field.description}</div>
                    )}
                    <Badge variant="outline" className="mt-1 text-xs">
                      {field.type}
                    </Badge>
                  </div>
                  <div className="flex gap-8">
                    <Checkbox
                      checked={fieldPerm.canRead}
                      onCheckedChange={(checked) => 
                        handleFieldPermissionChange(field.name, "canRead", checked as boolean)
                      }
                    />
                    <Checkbox
                      checked={fieldPerm.canWrite}
                      onCheckedChange={(checked) => 
                        handleFieldPermissionChange(field.name, "canWrite", checked as boolean)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Field Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}






























































