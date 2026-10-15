"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eye,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  User,
  Users,
  LayoutList,
} from "lucide-react";
import { PermissionData } from "./permission-tree-node";
import { PermissionResource, getVisibleMatrixLeaves } from "../utils/permission-tree";
import {
  getResourceAccessMeta,
  getActionResourceAccessMeta,
  type ActionResourceAccessKey,
} from "../utils/resource-access";
import { usersApi } from "@/lib/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Role = {
  id: number;
  name: string;
};

export type PermissionLevel = "all" | "users_items" | "deny";

interface PermissionMatrixViewProps {
  roles: Role[];
  permissions: Record<string, Record<number, PermissionData>>; // resourcePath -> roleId -> PermissionData
  onPermissionChange: (
    resourcePath: string,
    roleId: number,
    permission: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">,
    value: boolean | string
  ) => void;
  /** Prefer this for "Select all" — one parent update, persists correctly after refresh */
  onRoleSelectAll?: (roleId: number, grant: boolean) => void;
  /** Read uses __resourceAccess; other rows use __actionResourceAccess[canWrite | …]. */
  onResourceAccessLevelChange?: (
    resource: PermissionResource,
    roleId: number,
    scope: "read" | ActionResourceAccessKey,
    level: PermissionLevel,
    allowedUserIds?: number[]
  ) => void;
  selectedResource: string | null;
  onResourceSelect: (path: string | null) => void;
  permissionTree: PermissionResource[];
}

function roleInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export function PermissionMatrixView({
  roles,
  permissions,
  onPermissionChange,
  onRoleSelectAll,
  onResourceAccessLevelChange,
  selectedResource,
  onResourceSelect,
  permissionTree
}: PermissionMatrixViewProps) {
  const [visibleRoleStart, setVisibleRoleStart] = useState(0);
  const [visibleRolesCount, setVisibleRolesCount] = useState(4);
  const [companyUsers, setCompanyUsers] = React.useState<
    Array<{ id: number; name: string; roleId: number | null }>
  >([]);

  React.useEffect(() => {
    let cancelled = false;
    usersApi
      .getUsers()
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        setCompanyUsers(
          data.map((u: Record<string, unknown>) => ({
            id: Number(u.id),
            name: typeof u.name === "string" ? u.name : `User #${u.id}`,
            roleId: u.roleId != null ? Number(u.roleId) : null,
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCountOptions = useMemo(() => {
    const s = new Set<number>();
    [4, 6, 8, 10].forEach((n) => {
      if (n <= roles.length && n > 0) s.add(n);
    });
    if (roles.length > 0) s.add(roles.length);
    return Array.from(s).sort((a, b) => a - b);
  }, [roles.length]);

  React.useEffect(() => {
    if (roles.length === 0) return;
    setVisibleRolesCount((c) => Math.min(Math.max(c, 1), roles.length));
  }, [roles.length]);

  const visibleRoles = useMemo(() => {
    const count = Math.min(visibleRolesCount, roles.length);
    return roles.slice(visibleRoleStart, visibleRoleStart + count);
  }, [roles, visibleRoleStart, visibleRolesCount]);

  const allowedActionsFor = React.useCallback((resource: PermissionResource) => {
    const hasChildren = resource.children && resource.children.length > 0;
    if (hasChildren) return [];
    return resource.allowedActions || ["read", "write", "delete", "manage", "export", "import"];
  }, []);

  const visiblePermissionResources = useMemo(
    () => getVisibleMatrixLeaves(permissionTree, selectedResource),
    [permissionTree, selectedResource]
  );

  /** Booleans are authoritative; JSON only distinguishes All vs User's items. Stale `mode: "deny"` with a true flag must not show Deny. */
  const getReadCellLevel = (perm: PermissionData | undefined): PermissionLevel => {
    if (!perm?.canRead) return "deny";
    const meta = getResourceAccessMeta(perm.fieldPermissions);
    if (meta?.mode === "users_items") return "users_items";
    return "all";
  };

  const getActionCellLevel = (
    perm: PermissionData | undefined,
    key: ActionResourceAccessKey
  ): PermissionLevel => {
    if (!perm?.[key]) return "deny";
    const meta = getActionResourceAccessMeta(perm.fieldPermissions, key);
    if (meta?.mode === "users_items") return "users_items";
    return "all";
  };

  // Every matrix row set to "All" (not User's items / Deny)
  const isAllResourcesAllowed = (roleId: number): boolean => {
    if (visiblePermissionResources.length === 0) return false;

    return visiblePermissionResources.every((resource) => {
      const perm = permissions[resource.path]?.[roleId];
      if (!perm) return false;
      const allowed = new Set(allowedActionsFor(resource));
      if (allowed.has("read") && getReadCellLevel(perm) !== "all") return false;
      if (allowed.has("write")) {
        if (getActionCellLevel(perm, "canWrite") !== "all") return false;
        if (getActionCellLevel(perm, "canEdit") !== "all") return false;
      }
      if (allowed.has("delete") && getActionCellLevel(perm, "canDelete") !== "all") return false;
      if (allowed.has("manage") && getActionCellLevel(perm, "canManage") !== "all") return false;
      if (allowed.has("export") && getActionCellLevel(perm, "canExport") !== "all") return false;
      if (allowed.has("import") && getActionCellLevel(perm, "canImport") !== "all") return false;
      return true;
    });
  };

  // Handle role-level checkbox change
  const handleRoleCheckboxChange = (roleId: number, checked: boolean) => {
    if (onRoleSelectAll) {
      onRoleSelectAll(roleId, checked);
      return;
    }
    visiblePermissionResources.forEach((resource) => {
      if (checked) {
        onPermissionChange(resource.path, roleId, "canRead", true);
        onPermissionChange(resource.path, roleId, "canWrite", true);
        onPermissionChange(resource.path, roleId, "canEdit", true);
        onPermissionChange(resource.path, roleId, "canDelete", true);
        onPermissionChange(resource.path, roleId, "canManage", true);
        onPermissionChange(resource.path, roleId, "canExport", true);
        onPermissionChange(resource.path, roleId, "canImport", true);
      } else {
        onPermissionChange(resource.path, roleId, "canRead", false);
        onPermissionChange(resource.path, roleId, "canWrite", false);
        onPermissionChange(resource.path, roleId, "canEdit", false);
        onPermissionChange(resource.path, roleId, "canDelete", false);
        onPermissionChange(resource.path, roleId, "canManage", false);
        onPermissionChange(resource.path, roleId, "canExport", false);
        onPermissionChange(resource.path, roleId, "canImport", false);
      }
    });
  };

  const toggleAccessAllowUser = (
    resource: PermissionResource,
    roleId: number,
    scope: "read" | ActionResourceAccessKey,
    userId: number,
    checked: boolean
  ) => {
    if (!onResourceAccessLevelChange) return;
    const perm = permissions[resource.path]?.[roleId];
    const meta =
      scope === "read"
        ? getResourceAccessMeta(perm?.fieldPermissions)
        : getActionResourceAccessMeta(perm?.fieldPermissions, scope);
    const next = new Set(meta?.allowedUserIds ?? []);
    if (checked) next.add(userId);
    else next.delete(userId);
    onResourceAccessLevelChange(resource, roleId, scope, "users_items", Array.from(next));
  };

  const getResourceIcon = (resource: PermissionResource, size: "md" | "sm" = "md") => {
    const cls =
      size === "md"
        ? "h-8 w-8 rounded-md flex items-center justify-center shrink-0"
        : "h-5 w-5 rounded flex items-center justify-center shrink-0";
    if (resource.type === "PAGE" && resource.hasPermissions !== false) {
      return (
        <div className={`${cls} bg-primary/10 text-primary`}>
          <LayoutList className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </div>
      );
    }
    if (resource.type === "SECTION") {
      return (
        <div className={`${cls} bg-primary/10 text-primary`}>
          <LayoutList className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </div>
      );
    }
    return (
      <div className={`${cls} bg-muted text-muted-foreground`}>
        <LayoutList className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      </div>
    );
  };

  const renderPermissionCell = (
    resource: PermissionResource,
    role: Role,
    permType: {
      key: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">;
      label: string;
    }
  ) => {
    const roleId = role.id;
    const perm = permissions[resource.path]?.[roleId];
    const usersInRole = companyUsers.filter((u) => u.roleId === roleId);

    const triggerClass =
      "h-auto min-h-0 w-full max-w-[10rem] mx-auto border-0 bg-transparent shadow-none px-1 py-1 text-sm font-normal text-foreground focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-50";

    if (permType.key === "canRead") {
      const level = getReadCellLevel(perm);
      const meta = getResourceAccessMeta(perm?.fieldPermissions);
      const selectedIds = meta?.allowedUserIds ?? [];

      return (
        <div
          className="flex flex-col items-center gap-1.5 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Select
            value={level}
            onValueChange={(value) => {
              const v = value as PermissionLevel;
              if (!onResourceAccessLevelChange) return;
              if (v === "deny") onResourceAccessLevelChange(resource, roleId, "read", "deny");
              else if (v === "all") onResourceAccessLevelChange(resource, roleId, "read", "all");
              else
                onResourceAccessLevelChange(
                  resource,
                  roleId,
                  "read",
                  "users_items",
                  selectedIds.length ? selectedIds : []
                );
            }}
          >
            <SelectTrigger className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="users_items">User&apos;s items</SelectItem>
              <SelectItem value="deny">Deny access</SelectItem>
            </SelectContent>
          </Select>

          {level === "users_items" && onResourceAccessLevelChange && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs max-w-[10rem] truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  Users ({selectedIds.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-72 p-0"
                align="center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Who in &ldquo;{role.name}&rdquo; can use &ldquo;{permType.label}&rdquo;
                </div>
                <div className="max-h-52 overflow-y-auto p-2 space-y-2">
                  {usersInRole.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1">
                      No users assigned to this role yet.
                    </p>
                  ) : (
                    usersInRole.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/60 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedIds.includes(u.id)}
                          onCheckedChange={(c) =>
                            toggleAccessAllowUser(resource, roleId, "read", u.id, c === true)
                          }
                        />
                        <span className="truncate">{u.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      );
    }

    const actionKey = permType.key as ActionResourceAccessKey;
    const level = getActionCellLevel(perm, actionKey);
    const meta = getActionResourceAccessMeta(perm?.fieldPermissions, actionKey);
    const selectedIds = meta?.allowedUserIds ?? [];

    return (
      <div
        className="flex flex-col items-center gap-1.5 py-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Select
          value={level}
          onValueChange={(value) => {
            const v = value as PermissionLevel;
            if (!onResourceAccessLevelChange) return;
            if (v === "deny") onResourceAccessLevelChange(resource, roleId, actionKey, "deny");
            else if (v === "all") onResourceAccessLevelChange(resource, roleId, actionKey, "all");
            else
              onResourceAccessLevelChange(
                resource,
                roleId,
                actionKey,
                "users_items",
                selectedIds.length ? selectedIds : []
              );
          }}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="center">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="users_items">User&apos;s items</SelectItem>
            <SelectItem value="deny">Deny access</SelectItem>
          </SelectContent>
        </Select>

        {level === "users_items" && onResourceAccessLevelChange && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs max-w-[10rem] truncate"
                onClick={(e) => e.stopPropagation()}
              >
                Users ({selectedIds.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0"
              align="center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Who in &ldquo;{role.name}&rdquo; can use &ldquo;{permType.label}&rdquo;
              </div>
              <div className="max-h-52 overflow-y-auto p-2 space-y-2">
                {usersInRole.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">
                    No users assigned to this role yet.
                  </p>
                ) : (
                  usersInRole.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/60 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.includes(u.id)}
                        onCheckedChange={(c) =>
                          toggleAccessAllowUser(resource, roleId, actionKey, u.id, c === true)
                        }
                      />
                      <span className="truncate">{u.name}</span>
                    </label>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  const maxStart = Math.max(0, roles.length - Math.min(visibleRolesCount, roles.length || 1));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-muted/60 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-foreground shrink-0">Roles</span>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-4 w-4 shrink-0 opacity-70" />
            <span className="whitespace-nowrap">
              {visibleRoles.length} out of {roles.length}
            </span>
            <Select
              value={String(Math.min(visibleRolesCount, roles.length || 1))}
              onValueChange={(v) => {
                const n = parseInt(v, 10);
                setVisibleRolesCount(n);
                setVisibleRoleStart(0);
              }}
            >
              <SelectTrigger className="h-8 w-[4.5rem] text-xs bg-background border-border shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleCountOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === roles.length ? `All (${n})` : `${n}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border bg-background shadow-sm"
            onClick={() => setVisibleRoleStart((s) => Math.max(0, s - 1))}
            disabled={visibleRoleStart === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border bg-background shadow-sm"
            onClick={() => setVisibleRoleStart((s) => Math.min(maxStart, s + 1))}
            disabled={visibleRoleStart >= maxStart}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-w-full inline-block align-middle">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted shadow-sm">
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium min-w-[260px] max-w-[320px] sticky left-0 z-20 bg-muted align-top border-r border-border shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]">
                  <span className="text-muted-foreground font-normal">Access for object</span>
                </th>
                {visibleRoles.map((role, ri) => (
                  <th
                    key={role.id}
                    className="text-center p-3 font-medium min-w-[168px] align-top border-l border-border/80 bg-muted"
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-2 w-full justify-center min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background border border-border text-xs font-semibold text-primary shadow-sm">
                          {roleInitials(role.name)}
                        </div>
                        <span className="text-sm font-medium text-foreground leading-tight line-clamp-2 text-center max-w-[7rem]">
                          {role.name}
                        </span>
                      </div>
                      <div className="text-primary opacity-80" title="Role type">
                        {ri % 2 === 0 ? (
                          <User className="h-4 w-4 mx-auto" />
                        ) : (
                          <Users className="h-4 w-4 mx-auto" />
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-1.5 pt-0.5">
                        <Checkbox
                          checked={isAllResourcesAllowed(role.id)}
                          onCheckedChange={(checked) => handleRoleCheckboxChange(role.id, checked as boolean)}
                          className="h-3.5 w-3.5 border-input"
                        />
                        <span className="text-[11px] text-muted-foreground">Select all</span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiblePermissionResources.map((resource) => {
                const shouldShowPermissions = resource.hasPermissions !== false;
                
                const getPermissionTypes = (node: PermissionResource) => {
                  const allowed = new Set(allowedActionsFor(node));
                  const types: Array<{
                    key: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">;
                    label: string;
                  }> = [];
                  if (allowed.has("read")) types.push({ key: "canRead", label: "Read" });
                  if (allowed.has("write")) {
                    types.push({ key: "canWrite", label: "Add" });
                    types.push({ key: "canEdit", label: "Edit" });
                  }
                  if (allowed.has("delete")) types.push({ key: "canDelete", label: "Delete" });
                  if (allowed.has("export")) types.push({ key: "canExport", label: "Export" });
                  if (allowed.has("import")) types.push({ key: "canImport", label: "Import" });
                  if (allowed.has("manage")) types.push({ key: "canManage", label: "Allow custom view form" });
                  return types;
                };

                const permissionTypes = getPermissionTypes(resource);

                return (
                  <React.Fragment key={resource.path}>
                    {/* Resource Header Row */}
                    <tr 
                      className={`border-b border-border cursor-pointer transition-colors ${
                        selectedResource === resource.path
                          ? "!bg-primary/10 hover:!bg-primary/15"
                          : "bg-background hover:bg-muted/40"
                      }`}
                      onClick={() => onResourceSelect(resource.path)}
                    >
                      <td className="p-3 sticky left-0 z-10 bg-background border-r border-border shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center gap-2 min-w-0">
                          {getResourceIcon(resource)}
                          <span className="font-medium">{resource.name}</span>
                        </div>
                      </td>
                      {visibleRoles.map((role) => (
                        <td key={role.id} className="p-2 align-middle border-l border-border/60 bg-background" />
                      ))}
                    </tr>
                    {/* Permission Type Rows — always visible (no collapsing in matrix) */}
                    {shouldShowPermissions && permissionTypes.map((permType, idx) => (
                      <tr key={`${resource.path}-${permType.key}-${idx}`} className="border-b border-border bg-background hover:bg-muted/40">
                        <td className="p-3 pl-12 sticky left-0 z-10 text-sm text-muted-foreground bg-background border-r border-border shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]">
                          {permType.label}
                        </td>
                        {visibleRoles.map((role) => (
                          <td key={role.id} className="p-2 align-middle border-l border-border/60 bg-background">
                            {renderPermissionCell(resource, role, permType)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

