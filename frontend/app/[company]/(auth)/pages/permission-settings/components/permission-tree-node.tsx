"use client";

import * as React from "react";
import { ChevronRight, ChevronDown, Settings2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PermissionResource, ResourceType } from "../utils/permission-tree";
import { supportsFieldPermissions } from "../utils/field-definitions";
import { FieldPermissionsDialog } from "./field-permissions-dialog";

export interface PermissionData {
  resourcePath: string;
  canRead: boolean;
  canWrite: boolean; // add / create
  canEdit: boolean; // update / edit
  canDelete: boolean;
  canManage: boolean;
  canExport: boolean;
  canImport: boolean;
  settingId?: number | null;
  fieldPermissions?: Record<string, any>;
}

interface PermissionTreeNodeProps {
  resource: PermissionResource;
  permission?: PermissionData;
  level: number;
  isExpanded: boolean;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onPermissionChange: (path: string, permission: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">, value: boolean) => void;
  onFieldPermissionChange: (path: string, fieldPermissions: Record<string, { canRead: boolean; canWrite: boolean }>) => void;
  allPermissions: Record<string, PermissionData>;
}

export function PermissionTreeNode({
  resource,
  permission,
  level,
  isExpanded,
  expandedPaths,
  onToggleExpand,
  onPermissionChange,
  onFieldPermissionChange,
  allPermissions
}: PermissionTreeNodeProps) {
  const [showFieldDialog, setShowFieldDialog] = React.useState(false);
  const hasChildren = resource.children && resource.children.length > 0;
  const indent = level * 24;
  
  // If resource has children, it should NOT have permissions (only children do)
  // If resource has NO children, it should have permissions
  const shouldShowPermissions = !hasChildren || resource.hasPermissions === true;

  const getTypeBadge = (type: ResourceType) => {
    const badges = {
      MENU: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      PAGE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      SECTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      FIELD: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
    };
    return badges[type];
  };

  const perm = permission || {
    resourcePath: resource.path,
    canRead: false,
    canWrite: false,
    canEdit: false,
    canDelete: false,
    canManage: false,
    canExport: false,
    canImport: false
  };

  const handleManageChange = (checked: boolean) => {
    if (checked) {
      // If canManage is checked, set all other permissions to true
      onPermissionChange(resource.path, "canRead", true);
      onPermissionChange(resource.path, "canWrite", true);
      onPermissionChange(resource.path, "canEdit", true);
      onPermissionChange(resource.path, "canDelete", true);
      onPermissionChange(resource.path, "canManage", true);
      onPermissionChange(resource.path, "canExport", true);
      onPermissionChange(resource.path, "canImport", true);
    } else {
      onPermissionChange(resource.path, "canManage", false);
    }
  };

  const handleOtherPermissionChange = (
    permKey: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">,
    checked: boolean
  ) => {
    onPermissionChange(resource.path, permKey, checked);
    // If any permission is unchecked, canManage should be false
    if (!checked && permKey !== "canManage") {
      onPermissionChange(resource.path, "canManage", false);
    }
  };

  // If parent has canManage, all children inherit it
  const parentPermission = resource.parentPath
    ? allPermissions[resource.parentPath]
    : null;
  const isInherited = parentPermission?.canManage === true && level > 0;
  const hasFieldPermissions = supportsFieldPermissions(resource.path);
  const hasFieldPermissionsConfigured = permission?.fieldPermissions && Object.keys(permission.fieldPermissions).length > 0;

  return (
    <>
      <tr className="border-b hover:bg-muted/50">
        <td className="p-3" style={{ paddingLeft: `${indent + 12}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onToggleExpand(resource.path)}>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            ) : (
              <div className="w-6" />
            )}
            <span className="font-medium">{resource.name}</span>
            <Badge variant="outline" className={`ml-2 text-xs ${getTypeBadge(resource.type)}`}>
              {resource.type}
            </Badge>
            {isInherited && (
              <Badge variant="outline" className="ml-1 text-xs bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                Inherited
              </Badge>
            )}
            {shouldShowPermissions && hasFieldPermissions && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-6 px-2 text-xs"
                onClick={() => setShowFieldDialog(true)}>
                <Settings2 className="h-3 w-3 mr-1" />
                Fields
                {hasFieldPermissionsConfigured && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                    {Object.keys(permission.fieldPermissions || {}).length}
                  </Badge>
                )}
              </Button>
            )}
            {!shouldShowPermissions && (
              <Badge variant="outline" className="ml-2 text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                Parent Menu
              </Badge>
            )}
          </div>
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canRead || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleOtherPermissionChange("canRead", checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canWrite || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleOtherPermissionChange("canWrite", checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canEdit || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleOtherPermissionChange("canEdit", checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canDelete || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleOtherPermissionChange("canDelete", checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canManage || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleManageChange(checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canExport || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleOtherPermissionChange("canExport", checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-center">
          {shouldShowPermissions ? (
            <Checkbox
              checked={perm.canImport || isInherited}
              disabled={isInherited}
              onCheckedChange={(checked) => handleOtherPermissionChange("canImport", checked as boolean)}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
      </tr>
      {hasChildren && isExpanded && resource.children?.map((child) => (
        <PermissionTreeNode
          key={child.path}
          resource={child}
          permission={allPermissions[child.path]}
          level={level + 1}
          isExpanded={expandedPaths.has(child.path)}
          expandedPaths={expandedPaths}
          onToggleExpand={onToggleExpand}
          onPermissionChange={onPermissionChange}
          onFieldPermissionChange={onFieldPermissionChange}
          allPermissions={allPermissions}
        />
      ))}
      {hasFieldPermissions && (
        <FieldPermissionsDialog
          open={showFieldDialog}
          onOpenChange={setShowFieldDialog}
          resourcePath={resource.path}
          resourceName={resource.name}
          permission={permission}
          onFieldPermissionChange={onFieldPermissionChange}
        />
      )}
    </>
  );
}

