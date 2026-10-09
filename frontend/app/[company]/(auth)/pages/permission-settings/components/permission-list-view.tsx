"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PermissionData } from "./permission-tree-node";
import { flattenPermissionTree, PermissionResource } from "../utils/permission-tree";
import { supportsFieldPermissions } from "../utils/field-definitions";
import { FieldPermissionsDialog } from "./field-permissions-dialog";
import { Settings2 } from "lucide-react";

interface PermissionListViewProps {
  permissions: Record<string, PermissionData>;
  allResources: PermissionResource[];
  onPermissionChange: (
    path: string,
    permission: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">,
    value: boolean
  ) => void;
  onFieldPermissionChange: (
    path: string,
    fieldPermissions: Record<string, { canRead: boolean; canWrite: boolean }>
  ) => void;
  searchQuery?: string;
}

export function PermissionListView({
  permissions,
  allResources,
  onPermissionChange,
  onFieldPermissionChange,
  searchQuery = ""
}: PermissionListViewProps) {
  const [showFieldDialog, setShowFieldDialog] = React.useState<{ path: string; name: string } | null>(null);

  const getTypeBadge = (type: string) => {
    const badges: Record<string, string> = {
      MENU: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      PAGE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      SECTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      FIELD: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
    };
    return badges[type] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  };

  const filteredResources = React.useMemo(() => {
    if (!searchQuery) return allResources;
    const query = searchQuery.toLowerCase();
    return allResources.filter(resource => 
      resource.name.toLowerCase().includes(query) ||
      resource.path.toLowerCase().includes(query)
    );
  }, [allResources, searchQuery]);

  const handleManageChange = (path: string, checked: boolean) => {
    if (checked) {
      onPermissionChange(path, "canRead", true);
      onPermissionChange(path, "canWrite", true);
      onPermissionChange(path, "canEdit", true);
      onPermissionChange(path, "canDelete", true);
      onPermissionChange(path, "canManage", true);
      onPermissionChange(path, "canExport", true);
      onPermissionChange(path, "canImport", true);
    } else {
      onPermissionChange(path, "canManage", false);
    }
  };

  const handleOtherPermissionChange = (
    path: string,
    permKey: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">,
    checked: boolean
  ) => {
    onPermissionChange(path, permKey, checked);
    if (!checked && permKey !== "canManage") {
      onPermissionChange(path, "canManage", false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        {filteredResources.map((resource) => {
          const hasChildren = resource.children && resource.children.length > 0;
          // If resource has children, it should NOT have permissions (only children do)
          // If resource has NO children, it should have permissions
          const shouldShowPermissions = !hasChildren || resource.hasPermissions === true;
          
          const perm = permissions[resource.path] || {
            resourcePath: resource.path,
            canRead: false,
            canWrite: false,
            canEdit: false,
            canDelete: false,
            canManage: false,
            canExport: false,
            canImport: false
          };

          const hasFieldPermissions = supportsFieldPermissions(resource.path);
          const hasFieldPermissionsConfigured = perm.fieldPermissions && Object.keys(perm.fieldPermissions).length > 0;

          return (
            <div
              key={resource.path}
              className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{resource.name}</span>
                    <Badge variant="outline" className={`text-xs ${getTypeBadge(resource.type)}`}>
                      {resource.type}
                    </Badge>
                    {shouldShowPermissions && hasFieldPermissions && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowFieldDialog({ path: resource.path, name: resource.name })}>
                        <Settings2 className="h-3 w-3 mr-1" />
                        Fields
                        {hasFieldPermissionsConfigured && (
                          <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                            {Object.keys(perm.fieldPermissions || {}).length}
                          </Badge>
                        )}
                      </Button>
                    )}
                    {!shouldShowPermissions && (
                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        Parent Menu
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate mt-1">
                    {resource.path}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 ml-4">
                {shouldShowPermissions ? (
                  <>
                    <Checkbox
                      checked={perm.canRead}
                      onCheckedChange={(checked) => handleOtherPermissionChange(resource.path, "canRead", checked as boolean)}
                    />
                    <Checkbox
                      checked={perm.canWrite}
                      onCheckedChange={(checked) => handleOtherPermissionChange(resource.path, "canWrite", checked as boolean)}
                    />
                    <Checkbox
                      checked={perm.canEdit}
                      onCheckedChange={(checked) => handleOtherPermissionChange(resource.path, "canEdit", checked as boolean)}
                    />
                    <Checkbox
                      checked={perm.canDelete}
                      onCheckedChange={(checked) => handleOtherPermissionChange(resource.path, "canDelete", checked as boolean)}
                    />
                    <Checkbox
                      checked={perm.canManage}
                      onCheckedChange={(checked) => handleManageChange(resource.path, checked as boolean)}
                    />
                    <Checkbox
                      checked={perm.canExport}
                      onCheckedChange={(checked) => handleOtherPermissionChange(resource.path, "canExport", checked as boolean)}
                    />
                    <Checkbox
                      checked={perm.canImport}
                      onCheckedChange={(checked) => handleOtherPermissionChange(resource.path, "canImport", checked as boolean)}
                    />
                  </>
                ) : (
                  <span className="text-muted-foreground text-xs">No permissions (parent menu)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showFieldDialog && (
        <FieldPermissionsDialog
          open={!!showFieldDialog}
          onOpenChange={(open) => !open && setShowFieldDialog(null)}
          resourcePath={showFieldDialog.path}
          resourceName={showFieldDialog.name}
          permission={permissions[showFieldDialog.path]}
          onFieldPermissionChange={onFieldPermissionChange}
        />
      )}
    </>
  );
}














