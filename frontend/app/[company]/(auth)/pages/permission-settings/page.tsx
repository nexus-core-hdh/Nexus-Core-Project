"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { permissionSettingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2, Save, ChevronRight, ChevronDown, LayoutGrid, List, Layers, Table2, HelpCircle } from "lucide-react";
import { PermissionTreeNode, PermissionData } from "./components/permission-tree-node";
import { PermissionListView } from "./components/permission-list-view";
import { PermissionGroupedView } from "./components/permission-grouped-view";
import { PermissionMatrixView } from "./components/permission-matrix-view";
import { ResourceSidebar } from "./components/resource-sidebar";
import {
  permissionTree,
  PermissionResource,
  flattenPermissionTree,
  findResourceByPath,
  updatePermissionTree,
  getVisibleMatrixLeaves,
} from "./utils/permission-tree";
import {
  getResourceAccessMeta,
  getActionResourceAccessMeta,
  type ActionResourceAccessKey,
} from "./utils/resource-access";
import { menuItemsApi, dealPipelinesApi, customEntityPageApi } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = {
  id: number;
  name: string;
};

/** API rows may have canWrite true but canEdit false (Add was saved without coupling Edit). Align for matrix display. */
function permissionDataFromApi(perm: {
  resourcePath?: string;
  canRead?: boolean;
  canWrite?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
  canExport?: boolean;
  canImport?: boolean;
  id?: number | null;
  fieldPermissions?: unknown;
}): PermissionData {
  const canRead = !!perm.canRead;
  const canWrite = !!perm.canWrite;
  let canEdit = !!perm.canEdit;
  let fieldPermissions = perm.fieldPermissions;

  if (canWrite && !canEdit) {
    const wm = getActionResourceAccessMeta(fieldPermissions, "canWrite");
    const em = getActionResourceAccessMeta(fieldPermissions, "canEdit");
    const writeAllowed =
      !wm || wm.mode === "all" || wm.mode === "users_items";
    if (writeAllowed && (!em || em.mode === "deny")) {
      canEdit = true;
      const metaToCopy = wm ?? { mode: "all" as const, allowedUserIds: [] as number[] };
      if (fieldPermissions && typeof fieldPermissions === "object") {
        const fp = { ...(fieldPermissions as Record<string, unknown>) };
        const prevBucket =
          fp.__actionResourceAccess && typeof fp.__actionResourceAccess === "object"
            ? { ...(fp.__actionResourceAccess as Record<string, unknown>) }
            : {};
        fp.__actionResourceAccess = { ...prevBucket, canEdit: metaToCopy };
        fieldPermissions = fp;
      }
    }
  }

  // Replace stale mode:"deny" in JSON when booleans still grant access (fixes refresh + next Save)
  if (fieldPermissions && typeof fieldPermissions === "object") {
    const fp = { ...(fieldPermissions as Record<string, unknown>) };
    let touched = false;
    if (canRead) {
      const ra = getResourceAccessMeta(fp);
      if (ra?.mode === "deny") {
        fp.__resourceAccess = { mode: "all", allowedUserIds: [] };
        touched = true;
      }
    }
    const bucket =
      fp.__actionResourceAccess && typeof fp.__actionResourceAccess === "object"
        ? { ...(fp.__actionResourceAccess as Record<string, unknown>) }
        : {};
    const bools: Record<ActionResourceAccessKey, boolean> = {
      canWrite,
      canEdit,
      canDelete: !!perm.canDelete,
      canManage: !!perm.canManage,
      canExport: !!perm.canExport,
      canImport: !!perm.canImport,
    };
    const actionKeys: ActionResourceAccessKey[] = [
      "canWrite",
      "canEdit",
      "canDelete",
      "canManage",
      "canExport",
      "canImport",
    ];
    for (const k of actionKeys) {
      if (!bools[k]) continue;
      const m = getActionResourceAccessMeta(fp, k);
      if (m?.mode === "deny") {
        bucket[k] = { mode: "all", allowedUserIds: [] };
        touched = true;
      }
    }
    if (touched) {
      if (Object.keys(bucket).length > 0) {
        fp.__actionResourceAccess = bucket;
      }
      fieldPermissions = fp;
    }
  }

  return {
    resourcePath: perm.resourcePath || "",
    canRead,
    canWrite,
    canEdit,
    canDelete: !!perm.canDelete,
    canManage: !!perm.canManage,
    canExport: !!perm.canExport,
    canImport: !!perm.canImport,
    settingId: perm.id ?? null,
    fieldPermissions: fieldPermissions as PermissionData["fieldPermissions"],
  };
}

type DealPipelineListItem = {
  id: number;
  name: string;
  isActive?: boolean;
  order?: number;
};

function withPipelinesSection(
  baseTree: PermissionResource[],
  pipelines: DealPipelineListItem[]
): PermissionResource[] {
  const sectionPath = "pipelines";
  const next = baseTree.filter((n) => n.path !== sectionPath);

  const sorted = [...pipelines]
    .filter((p) => p && typeof p.id === "number" && typeof p.name === "string")
    .filter((p) => p.isActive !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

  const children: PermissionResource[] = sorted.map((p) => ({
    id: `pipelines.deals.${p.id}`,
    path: `pipelines.deals.${p.id}`,
    name: p.name,
    type: "PAGE" as any,
    parentPath: sectionPath,
    hasPermissions: true,
    allowedActions: ["read", "write", "delete", "manage", "export", "import"],
  }));

  const pipelinesSection: PermissionResource = {
    id: sectionPath,
    path: sectionPath,
    name: "Pipelines",
    type: "SECTION" as any,
    hasPermissions: false,
    children,
  };

  return [...next, pipelinesSection];
}

type CustomEntityPageListItem = {
  id: number;
  name: string;
  slug: string;
  isActive?: boolean;
};

function withCustomPagesInPagesSection(
  baseTree: PermissionResource[],
  pages: CustomEntityPageListItem[]
): PermissionResource[] {
  const active = [...pages]
    .filter((p) => p && typeof p.slug === "string" && p.slug.length > 0)
    .filter((p) => p.isActive !== false);

  if (active.length === 0) return baseTree;

  const pagesSectionPath = "group.pages";
  const idx = baseTree.findIndex((n) => n.path === pagesSectionPath);
  if (idx < 0) return baseTree;

  const section = baseTree[idx];
  const children = section.children ? [...section.children] : [];

  // Avoid duplicates if loadMenuItems runs multiple times.
  const existingCustomPagesNodeIndex = children.findIndex((c) => c.path === "pages.custom-pages");
  const customEntityLeaves: PermissionResource[] = active
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      id: `pages.custom-entities.${p.slug}`,
      path: `pages.custom-entities.${p.slug}`,
      name: p.name,
      type: "PAGE" as any,
      href: `/pages/custom-entities/${p.slug}`,
      parentPath: "pages.custom-pages",
      hasPermissions: true,
      allowedActions: ["read", "write", "delete", "manage", "export", "import"],
    }));

  const customPagesNode: PermissionResource = {
    id: "pages.custom-pages",
    path: "pages.custom-pages",
    name: "Custom Pages",
    type: "MENU" as any,
    parentPath: pagesSectionPath,
    hasPermissions: false,
    children: customEntityLeaves,
  };

  if (existingCustomPagesNodeIndex >= 0) {
    children[existingCustomPagesNodeIndex] = customPagesNode;
  } else {
    children.push(customPagesNode);
  }

  const nextSection: PermissionResource = { ...section, children };
  const next = [...baseTree];
  next[idx] = nextSection;
  return next;
}

export default function PermissionSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<Record<string, PermissionData>>({});
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [currentPermissionTree, setCurrentPermissionTree] = useState<PermissionResource[]>(permissionTree);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(currentPermissionTree.map(r => r.path)));
  const [viewMode, setViewMode] = useState<"hierarchy" | "list" | "grouped" | "matrix">("matrix");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [matrixPermissions, setMatrixPermissions] = useState<Record<string, Record<number, PermissionData>>>({});

  const loadMenuItems = async () => {
    try {
      const user = getCurrentUser();
      if (!user) return;

      const menuData = await menuItemsApi.getMenuItems(
        user.companyId || undefined,
        user.branchId || undefined
      );

      let updatedTree: PermissionResource[];
      
      if (Array.isArray(menuData) && menuData.length > 0) {
        // Update permission tree with company-configured menu items
        updatePermissionTree(menuData);
        const { permissionTree: tree } = await import("./utils/permission-tree");
        updatedTree = tree;
        setMenuItems(menuData);
      } else {
        // Fallback to default nav items if no company menu configured
        const { defaultNavItems } = await import("@/components/layout/sidebar/nav-main");
        updatePermissionTree(defaultNavItems);
        const { permissionTree: tree } = await import("./utils/permission-tree");
        updatedTree = tree;
        setMenuItems(defaultNavItems);
      }
      
      setCurrentPermissionTree(updatedTree);
      // Update expanded paths to include all top-level resources
      setExpandedPaths(new Set(updatedTree.map(r => r.path)));

      // Append Pipelines section + Custom Pages under Pages (dynamic, company/branch scoped)
      try {
        const [pipelines, customPages] = await Promise.all([
          dealPipelinesApi.getDealPipelines(user.companyId || undefined, user.branchId || undefined),
          customEntityPageApi.getCustomEntityPages(user.companyId || undefined, user.branchId || undefined),
        ]);

        setCurrentPermissionTree((prev) => {
          let next = prev;
          if (Array.isArray(pipelines)) {
            next = withPipelinesSection(next, pipelines as DealPipelineListItem[]);
          }
          if (Array.isArray(customPages)) {
            next = withCustomPagesInPagesSection(next, customPages as CustomEntityPageListItem[]);
          }
          return next;
        });
      } catch {
        // If these fail to load, keep the rest of the tree.
      }
    } catch (error: any) {
      console.error("Failed to load menu items:", error);
      // Fallback to default nav items on error
      const { defaultNavItems } = await import("@/components/layout/sidebar/nav-main");
      updatePermissionTree(defaultNavItems);
      const { permissionTree: updatedTree } = await import("./utils/permission-tree");
      setCurrentPermissionTree(updatedTree);
      setExpandedPaths(new Set(updatedTree.map(r => r.path)));
      setMenuItems(defaultNavItems);
    }
  };

  const loadRoles = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      const data = await permissionSettingsApi.getRoles(
        user?.companyId || undefined,
        user?.branchId || undefined
      );
      if (Array.isArray(data)) {
        setRoles(data);
        if (data.length > 0 && !selectedRole) {
          setSelectedRole(data[0].id);
          await loadPermissions(data[0].id);
        }

        // Preload permissions for all roles to populate the matrix view
        if (data.length > 0) {
          try {
            const userForPerms = getCurrentUser();
            const companyId = userForPerms?.companyId || undefined;
            const branchId = userForPerms?.branchId || undefined;

            const results = await Promise.all(
              data.map(async (role: Role) => {
                try {
                  const perms = await permissionSettingsApi.getHierarchicalPermissions(
                    role.id,
                    companyId,
                    branchId
                  );
                  return { roleId: role.id, perms };
                } catch (err) {
                  console.error(`Failed to load permissions for role ${role.id}:`, err);
                  return { roleId: role.id, perms: [] };
                }
              })
            );

            const combinedMatrix: Record<string, Record<number, PermissionData>> = {};

            results.forEach(({ roleId, perms }: any) => {
              if (Array.isArray(perms)) {
                perms.forEach((perm: any) => {
                  if (!perm.resourcePath) return;
                  if (!combinedMatrix[perm.resourcePath]) {
                    combinedMatrix[perm.resourcePath] = {};
                  }
                  combinedMatrix[perm.resourcePath][roleId] = permissionDataFromApi(perm);
                });
              }
            });

            setMatrixPermissions(combinedMatrix);
          } catch (err) {
            console.error("Failed to preload permissions for all roles:", err);
          }
        }
      }
    } catch (error: any) {
      console.error("Failed to load roles:", error);
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async (roleId: number, silent = false) => {
    try {
      const user = getCurrentUser();
      const data = await permissionSettingsApi.getHierarchicalPermissions(
        roleId,
        user?.companyId || undefined,
        user?.branchId || undefined
      );
      
      // Convert array to object keyed by resourcePath
      const permissionsMap: Record<string, PermissionData> = {};
      if (Array.isArray(data)) {
        data.forEach((perm: any) => {
          if (perm.resourcePath) {
            permissionsMap[perm.resourcePath] = permissionDataFromApi(perm);
          }
        });
      }
      setPermissions(permissionsMap);
      
      // Also build matrix permissions structure (resourcePath -> roleId -> PermissionData)
      if (viewMode === "matrix" && selectedRole) {
        const matrixPerms: Record<string, Record<number, PermissionData>> = {};
        Object.entries(permissionsMap).forEach(([path, perm]) => {
          if (!matrixPerms[path]) {
            matrixPerms[path] = {};
          }
          matrixPerms[path][selectedRole] = perm;
        });
        setMatrixPermissions(prev => ({
          ...prev,
          ...Object.entries(permissionsMap).reduce((acc, [path]) => {
            if (!acc[path]) acc[path] = {};
            acc[path][selectedRole] = permissionsMap[path];
            return acc;
          }, {} as Record<string, Record<number, PermissionData>>)
        }));
      }
    } catch (error: any) {
      // If no permissions exist yet (404), this is a valid state - just initialize empty
      if (error.status === 404 || error.message?.includes("Not Found")) {
        setPermissions({});
        // Don't log or show error for 404 - it's expected when no permissions are set yet
        return;
      }
      
      // Only log/show error for actual errors (not 404)
      if (!silent) {
        console.error("Failed to load permissions:", error);
        toast.error("Failed to load permissions");
      }
      setPermissions({});
    }
  };

  useEffect(() => {
    loadMenuItems().then(() => {
      loadRoles();
    });
  }, []);

  // Ensure matrix has an entry for every resource x role (default deny),
  // then merge in any loaded permissions.
  useEffect(() => {
    if (roles.length === 0) return;
    const resources = flattenPermissionTree(currentPermissionTree).filter((resource) => {
      const hasChildren = resource.children && resource.children.length > 0;
      return !hasChildren || resource.hasPermissions === true;
    });

    setMatrixPermissions((prev) => {
      const next: Record<string, Record<number, PermissionData>> = { ...prev };
      for (const r of resources) {
        if (!next[r.path]) next[r.path] = {};
        for (const role of roles) {
          if (!next[r.path][role.id]) {
            next[r.path][role.id] = {
              resourcePath: r.path,
              canRead: false,
              canWrite: false,
              canEdit: false,
              canDelete: false,
              canManage: false,
              canExport: false,
              canImport: false,
              settingId: null,
              fieldPermissions: undefined,
            };
          }
        }
      }
      return next;
    });
  }, [roles, currentPermissionTree]);

  useEffect(() => {
    if (selectedRole) {
      loadPermissions(selectedRole);
    }
  }, [selectedRole]);

  const handlePermissionChange = (
    path: string,
    permission: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">,
    value: boolean
  ) => {
    setPermissions((prev) => ({
      ...prev,
      [path]: {
        ...(prev[path] || {
          resourcePath: path,
          canRead: false,
          canWrite: false,
          canEdit: false,
          canDelete: false,
          canManage: false,
          canExport: false,
          canImport: false
        }),
        [permission]: value
      }
    }));
  };

  const handleFieldPermissionChange = (
    path: string,
    fieldPermissions: Record<string, { canRead: boolean; canWrite: boolean }>
  ) => {
    setPermissions((prev) => {
      const updated = {
        ...prev,
        [path]: {
          ...(prev[path] || {
            resourcePath: path,
            canRead: false,
            canWrite: false,
            canEdit: false,
            canDelete: false,
            canManage: false,
            canExport: false,
            canImport: false
          }),
          fieldPermissions
        }
      };
      
      // Update matrix permissions if in matrix view
      if (viewMode === "matrix" && selectedRole) {
        setMatrixPermissions((matrix) => ({
          ...matrix,
          [path]: {
            ...(matrix[path] || {}),
            [selectedRole]: updated[path]
          }
        }));
      }
      
      return updated;
    });
  };

  const handleMatrixPermissionChange = (
    resourcePath: string,
    roleId: number,
    permission: keyof Omit<PermissionData, "resourcePath" | "settingId" | "fieldPermissions">,
    value: boolean | string
  ) => {
    setMatrixPermissions((prev) => ({
      ...prev,
      [resourcePath]: {
        ...(prev[resourcePath] || {}),
        [roleId]: {
          ...(prev[resourcePath]?.[roleId] || {
            resourcePath,
            canRead: false,
            canWrite: false,
            canEdit: false,
            canDelete: false,
            canManage: false,
            canExport: false,
            canImport: false
          }),
          [permission]: value
        }
      }
    }));
  };

  const allowedActionsFor = React.useCallback((resource: PermissionResource) => {
    const hasChildren = resource.children && resource.children.length > 0;
    if (hasChildren) return [];
    return resource.allowedActions || ["read", "write", "delete", "manage", "export", "import"];
  }, []);

  /** Read / Add / Edit / … — All, User's items (allowlist), or Deny; stored in fieldPermissions. */
  const handleResourceAccessLevelChange = React.useCallback(
    (
      resource: PermissionResource,
      roleId: number,
      scope: "read" | ActionResourceAccessKey,
      level: "all" | "users_items" | "deny",
      allowedUserIds?: number[]
    ) => {
      const allowed = new Set(allowedActionsFor(resource));

      const permKeyToAction = (k: ActionResourceAccessKey) => {
        if (k === "canWrite" || k === "canEdit") return "write";
        if (k === "canDelete") return "delete";
        if (k === "canManage") return "manage";
        if (k === "canExport") return "export";
        return "import";
      };

      setMatrixPermissions((prev) => {
        const prevCell = prev[resource.path]?.[roleId] ?? {
          resourcePath: resource.path,
          canRead: false,
          canWrite: false,
          canEdit: false,
          canDelete: false,
          canManage: false,
          canExport: false,
          canImport: false,
          settingId: null,
          fieldPermissions: undefined,
        };
        const fp =
          typeof prevCell.fieldPermissions === "object" && prevCell.fieldPermissions
            ? { ...prevCell.fieldPermissions }
            : {};

        if (scope === "read") {
          if (level === "deny") {
            return {
              ...prev,
              [resource.path]: {
                ...(prev[resource.path] || {}),
                [roleId]: {
                  ...prevCell,
                  canRead: false,
                  canWrite: false,
                  canEdit: false,
                  canDelete: false,
                  canManage: false,
                  canExport: false,
                  canImport: false,
                  fieldPermissions: {
                    ...fp,
                    __resourceAccess: { mode: "deny", allowedUserIds: [] },
                    __actionResourceAccess: {},
                  },
                },
              },
            };
          }

          const existing = getResourceAccessMeta(prevCell.fieldPermissions);
          const ids =
            level === "users_items"
              ? allowedUserIds !== undefined
                ? allowedUserIds
                : existing?.allowedUserIds ?? []
              : [];

          return {
            ...prev,
            [resource.path]: {
              ...(prev[resource.path] || {}),
              [roleId]: {
                ...prevCell,
                canRead: allowed.has("read"),
                fieldPermissions: {
                  ...fp,
                  __resourceAccess:
                    level === "users_items"
                      ? { mode: "users_items", allowedUserIds: ids }
                      : { mode: "all", allowedUserIds: [] },
                },
              },
            },
          };
        }

        const pk = scope as ActionResourceAccessKey;
        const action = permKeyToAction(pk);
        if (!allowed.has(action)) {
          return prev;
        }

        const prevBucket =
          fp.__actionResourceAccess && typeof fp.__actionResourceAccess === "object"
            ? { ...(fp.__actionResourceAccess as Record<string, unknown>) }
            : {};

        if (level === "deny") {
          const nextAccess = {
            ...prevBucket,
            [pk]: { mode: "deny" as const, allowedUserIds: [] },
          };
          // "Add" (canWrite) and "Edit" (canEdit) are the same write bucket for users — keep them in sync
          // so Read+Add=All does not leave Edit showing Deny after refresh.
          if (pk === "canWrite") {
            nextAccess.canEdit = { mode: "deny" as const, allowedUserIds: [] };
          }
          return {
            ...prev,
            [resource.path]: {
              ...(prev[resource.path] || {}),
              [roleId]: {
                ...prevCell,
                [pk]: false,
                ...(pk === "canWrite" ? { canEdit: false } : {}),
                fieldPermissions: {
                  ...fp,
                  __actionResourceAccess: nextAccess,
                },
              },
            },
          };
        }

        const existing = getActionResourceAccessMeta(prevCell.fieldPermissions, pk);
        const ids =
          level === "users_items"
            ? allowedUserIds !== undefined
              ? allowedUserIds
              : existing?.allowedUserIds ?? []
            : [];

        const scopeMeta =
          level === "users_items"
            ? { mode: "users_items" as const, allowedUserIds: ids }
            : { mode: "all" as const, allowedUserIds: [] };

        const nextActionAccess = {
          ...prevBucket,
          [pk]: scopeMeta,
        };
        if (pk === "canWrite") {
          nextActionAccess.canEdit = scopeMeta;
        }

        return {
          ...prev,
          [resource.path]: {
            ...(prev[resource.path] || {}),
            [roleId]: {
              ...prevCell,
              [pk]: true,
              ...(pk === "canWrite" ? { canEdit: true } : {}),
              fieldPermissions: {
                ...fp,
                __actionResourceAccess: nextActionAccess,
              },
            },
          },
        };
      });
    },
    [allowedActionsFor]
  );

  /** Single state update for matrix "Select all" under a role (avoids batching gaps before Save). */
  const handleMatrixRoleSelectAll = React.useCallback(
    (roleId: number, grant: boolean) => {
      const resourcesWithPermissions = getVisibleMatrixLeaves(currentPermissionTree, selectedResource);
      setMatrixPermissions((prev) => {
        const next: Record<string, Record<number, PermissionData>> = { ...prev };
        for (const r of resourcesWithPermissions) {
          const allowed = new Set(allowedActionsFor(r));
          const prevCell = next[r.path]?.[roleId];
          const fp =
            typeof prevCell?.fieldPermissions === "object" && prevCell?.fieldPermissions
              ? { ...prevCell.fieldPermissions }
              : {};
          const actionAccessGrant: Record<string, { mode: "all"; allowedUserIds: number[] }> = {};
          if (allowed.has("write")) {
            actionAccessGrant.canWrite = { mode: "all", allowedUserIds: [] };
            actionAccessGrant.canEdit = { mode: "all", allowedUserIds: [] };
          }
          if (allowed.has("delete")) actionAccessGrant.canDelete = { mode: "all", allowedUserIds: [] };
          if (allowed.has("manage")) actionAccessGrant.canManage = { mode: "all", allowedUserIds: [] };
          if (allowed.has("export")) actionAccessGrant.canExport = { mode: "all", allowedUserIds: [] };
          if (allowed.has("import")) actionAccessGrant.canImport = { mode: "all", allowedUserIds: [] };
          next[r.path] = {
            ...(next[r.path] || {}),
            [roleId]: {
              resourcePath: r.path,
              canRead: allowed.has("read") ? grant : false,
              canWrite: allowed.has("write") ? grant : false,
              canEdit: allowed.has("write") ? grant : false,
              canDelete: allowed.has("delete") ? grant : false,
              canManage: allowed.has("manage") ? grant : false,
              canExport: allowed.has("export") ? grant : false,
              canImport: allowed.has("import") ? grant : false,
              settingId: prevCell?.settingId ?? null,
              fieldPermissions: grant
                ? {
                    ...fp,
                    __resourceAccess: { mode: "all", allowedUserIds: [] },
                    __actionResourceAccess: actionAccessGrant,
                  }
                : {
                    ...fp,
                    __resourceAccess: { mode: "deny", allowedUserIds: [] },
                    __actionResourceAccess: {},
                  },
            },
          };
        }
        return next;
      });
    },
    [allowedActionsFor, currentPermissionTree, selectedResource]
  );

  const handleToggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const allResources = React.useMemo(() => flattenPermissionTree(currentPermissionTree), [currentPermissionTree]);

  const handleSave = async () => {
    if (viewMode === "matrix") {
      // Matrix view: save all roles
      if (roles.length === 0) return;
      
      try {
        setSaving(true);
        const resourcesWithPermissions = flattenPermissionTree(currentPermissionTree).filter((resource) => {
          const hasChildren = resource.children && resource.children.length > 0;
          return !hasChildren || resource.hasPermissions === true;
        });
        
        // Save permissions for each role
        for (const role of roles) {
          const rolePermissions = resourcesWithPermissions.map((resource) => {
            const perm = matrixPermissions[resource.path]?.[role.id] || {
              resourcePath: resource.path,
              canRead: false,
              canWrite: false,
              canEdit: false,
              canDelete: false,
              canManage: false,
              canExport: false,
              canImport: false,
              settingId: null,
              fieldPermissions: undefined,
            };
            const allowed = new Set(allowedActionsFor(resource));
            return {
              resourcePath: resource.path,
              resourceType: resource.type || "MENU",
              resourceName: resource.name || resource.path.split(".").pop() || resource.path,
              parentPath: resource.parentPath || undefined,
              canRead: allowed.has("read") ? !!perm.canRead : false,
              canWrite: allowed.has("write") ? !!perm.canWrite : false,
              canEdit: allowed.has("write") ? !!perm.canEdit : false,
              canDelete: allowed.has("delete") ? !!perm.canDelete : false,
              canManage: allowed.has("manage") ? !!perm.canManage : false,
              canExport: allowed.has("export") ? !!perm.canExport : false,
              canImport: allowed.has("import") ? !!perm.canImport : false,
              fieldPermissions: perm.fieldPermissions || null,
              settingId: perm.settingId || null,
            };
          });
          
          // Save permissions for this role
          await permissionSettingsApi.upsertHierarchicalPermissions(role.id, rolePermissions);
        }
        
        toast.success("Permissions saved successfully for all roles");
        // Reload permissions for all roles and update matrix state
        const user = getCurrentUser();
        const companyId = user?.companyId || undefined;
        const branchId = user?.branchId || undefined;
        
        // Reload permissions for all roles and merge with existing matrix state
        // This ensures we don't lose any permissions that were in the state but not yet saved
        const reloadedMatrix: Record<string, Record<number, PermissionData>> = { ...matrixPermissions };
        
        for (const role of roles) {
          try {
            const data = await permissionSettingsApi.getHierarchicalPermissions(
              role.id,
              companyId,
              branchId
            );
            
            if (Array.isArray(data)) {
              data.forEach((perm: any) => {
                if (perm.resourcePath) {
                  if (!reloadedMatrix[perm.resourcePath]) {
                    reloadedMatrix[perm.resourcePath] = {};
                  }
                  reloadedMatrix[perm.resourcePath][role.id] = permissionDataFromApi(perm);
                }
              });
            }
          } catch (err: any) {
            // 404 is valid if no permissions exist yet - keep existing state for this role
            if (err.status === 404 || err.message?.includes("Not Found")) {
              // No saved permissions yet for this role; keep default-deny skeleton.
            } else {
              console.error(`Failed to reload permissions for role ${role.id}:`, err);
            }
          }
        }
        
        // Update matrix permissions state with reloaded data
        setMatrixPermissions(reloadedMatrix);
        
        // Also update single role permissions if a role is selected
        if (selectedRole) {
          const selectedRolePerms = Object.entries(reloadedMatrix).reduce((acc, [path, perms]) => {
            if (perms[selectedRole]) {
              acc[path] = perms[selectedRole];
            }
            return acc;
          }, {} as Record<string, PermissionData>);
          setPermissions(selectedRolePerms);
        }
      } catch (error: any) {
        console.error("Failed to save permissions:", error);
        toast.error(error?.error || "Failed to save permissions");
      } finally {
        setSaving(false);
      }
    } else {
      // Single role view
      if (!selectedRole) return;

      try {
        setSaving(true);
        
        // IMPORTANT: backend hierarchical upsert deletes permissions that are not included.
        // So we must always send every resource for this role (default deny).
        const resourcesWithPermissions = flattenPermissionTree(currentPermissionTree).filter((resource) => {
          const hasChildren = resource.children && resource.children.length > 0;
          return !hasChildren || resource.hasPermissions === true;
        });

        const permissionsArray = resourcesWithPermissions.map((resource) => {
          const perm = permissions[resource.path] || {
            resourcePath: resource.path,
            canRead: false,
            canWrite: false,
            canEdit: false,
            canDelete: false,
            canManage: false,
            canExport: false,
            canImport: false,
            settingId: null,
            fieldPermissions: undefined,
          };
          const allowed = new Set(allowedActionsFor(resource));

          return {
            resourcePath: resource.path,
            resourceType: resource.type || "MENU",
            resourceName: resource.name || resource.path.split(".").pop() || resource.path,
            parentPath: resource.parentPath || undefined,
            canRead: allowed.has("read") ? !!perm.canRead : false,
            canWrite: allowed.has("write") ? !!perm.canWrite : false,
            canEdit: allowed.has("write") ? !!perm.canEdit : false,
            canDelete: allowed.has("delete") ? !!perm.canDelete : false,
            canManage: allowed.has("manage") ? !!perm.canManage : false,
            canExport: allowed.has("export") ? !!perm.canExport : false,
            canImport: allowed.has("import") ? !!perm.canImport : false,
            fieldPermissions: perm.fieldPermissions || null,
            settingId: perm.settingId || null,
          };
        });

        await permissionSettingsApi.upsertHierarchicalPermissions(selectedRole, permissionsArray);
        toast.success("Permissions saved successfully");
        await loadPermissions(selectedRole);
      } catch (error: any) {
        console.error("Failed to save permissions:", error);
        toast.error(error?.error || "Failed to save permissions");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleRoleSelect = async (roleId: number) => {
    // Clear permissions state before loading new role to prevent mixing permissions
    setPermissions({});
    setSelectedRole(roleId);
    await loadPermissions(roleId);
  };

  // Load permissions for all roles when in matrix view
  useEffect(() => {
    if (viewMode === "matrix" && roles.length > 0) {
      // Load permissions for all roles silently (404 is valid)
      const loadMatrixPermissions = async () => {
        for (const role of roles) {
          try {
            const user = getCurrentUser();
            const data = await permissionSettingsApi.getHierarchicalPermissions(
              role.id,
              user?.companyId || undefined,
              user?.branchId || undefined
            );
            
            if (Array.isArray(data)) {
              const permissionsMap: Record<string, PermissionData> = {};
              data.forEach((perm: any) => {
                if (perm.resourcePath) {
                  permissionsMap[perm.resourcePath] = permissionDataFromApi(perm);
                }
              });
              
              setMatrixPermissions((prev) => ({
                ...prev,
                ...Object.entries(permissionsMap).reduce((acc, [path, perm]) => {
                  if (!acc[path]) acc[path] = {};
                  acc[path][role.id] = perm;
                  return acc;
                }, {} as Record<string, Record<number, PermissionData>>)
              }));
            }
          } catch (error: any) {
            // Silent fail for matrix view - 404 is expected when no permissions exist
            if (error.status !== 404 && !error.message?.includes("Not Found")) {
              console.error(`Failed to load permissions for role ${role.id}:`, error);
            }
          }
        }
      };
      
      loadMatrixPermissions();
    }
  }, [viewMode, roles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <p className="text-muted-foreground">Loading permission settings...</p>
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No roles found. Please create roles first.</p>
      </div>
    );
  }

  const selectedRoleName = roles.find(r => r.id === selectedRole)?.name || "Unknown";

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Access permissions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {viewMode === "matrix" 
              ? "Configure permissions across all roles in a matrix view"
              : "Configure permissions for roles. Parent menus with children do not have permissions - only their children do. Menus without children have permissions."
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {viewMode === "matrix" && (
            <Input
              placeholder="Search in resources…"
              className="w-56"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          )}
          <Button variant="ghost" size="icon">
            <HelpCircle className="h-4 w-4" />
          </Button>
          {selectedRole && viewMode !== "matrix" && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Permissions
                </>
              )}
            </Button>
          )}
          {viewMode === "matrix" && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save All Roles
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {viewMode === "matrix" ? (
        <div className="flex-1 flex overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ResourceSidebar
            selectedResource={selectedResource}
            onResourceSelect={setSelectedResource}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            permissionTree={currentPermissionTree}
          />
          <div className="flex-1 overflow-hidden min-w-0 bg-muted/40">
            <PermissionMatrixView
              roles={roles}
              permissions={matrixPermissions}
              onPermissionChange={handleMatrixPermissionChange}
              onRoleSelectAll={handleMatrixRoleSelectAll}
              onResourceAccessLevelChange={handleResourceAccessLevelChange}
              selectedResource={selectedResource}
              onResourceSelect={setSelectedResource}
              permissionTree={currentPermissionTree}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[250px_1fr] flex-1 overflow-hidden">
        {/* Role Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center gap-2">
                <Button
                  variant={selectedRole === role.id ? "default" : "ghost"}
                  className="flex-1 justify-start"
                  onClick={() => handleRoleSelect(role.id)}>
                  {role.name}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Permission Views */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>
                  Permissions for {selectedRoleName}
                </CardTitle>
                {selectedRole && (
                  <div className="flex items-center gap-2 ml-4">
                    <Checkbox
                      id="select-all-role"
                      checked={(() => {
                        const resourcesWithPermissions = allResources.filter(resource => {
                          const hasChildren = resource.children && resource.children.length > 0;
                          return !hasChildren || resource.hasPermissions === true;
                        });
                        if (resourcesWithPermissions.length === 0) return false;
                        return resourcesWithPermissions.every(resource => {
                          const perm = permissions[resource.path];
                          if (!perm) return false;
                          return perm.canRead && perm.canWrite && perm.canEdit && perm.canDelete && perm.canManage && perm.canExport && perm.canImport;
                        });
                      })()}
                      onCheckedChange={(checked) => {
                        const resourcesWithPermissions = allResources.filter(resource => {
                          const hasChildren = resource.children && resource.children.length > 0;
                          return !hasChildren || resource.hasPermissions === true;
                        });
                        setPermissions((prev) => {
                          const next: Record<string, PermissionData> = { ...prev };
                          for (const resource of resourcesWithPermissions) {
                            const allowed = new Set(allowedActionsFor(resource));
                            const current = next[resource.path] || {
                              resourcePath: resource.path,
                              canRead: false,
                              canWrite: false,
                              canEdit: false,
                              canDelete: false,
                              canManage: false,
                              canExport: false,
                              canImport: false,
                              settingId: null,
                              fieldPermissions: undefined,
                            };
                            next[resource.path] = {
                              ...current,
                              canRead: allowed.has("read") ? !!checked : false,
                              canWrite: allowed.has("write") ? !!checked : false,
                              canEdit: allowed.has("write") ? !!checked : false,
                              canDelete: allowed.has("delete") ? !!checked : false,
                              canManage: allowed.has("manage") ? !!checked : false,
                              canExport: allowed.has("export") ? !!checked : false,
                              canImport: allowed.has("import") ? !!checked : false,
                            };
                          }
                          return next;
                        });
                      }}
                    />
                    <label htmlFor="select-all-role" className="text-sm font-medium cursor-pointer">
                      Select All
                    </label>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Search resources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64"
                />
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "hierarchy" | "list" | "grouped" | "matrix")}>
                  <TabsList>
                    <TabsTrigger value="matrix" title="Matrix View">
                      <Table2 className="h-4 w-4" />
                    </TabsTrigger>
                    <TabsTrigger value="hierarchy" title="Hierarchy View">
                      <Layers className="h-4 w-4" />
                    </TabsTrigger>
                    <TabsTrigger value="grouped" title="Grouped View">
                      <LayoutGrid className="h-4 w-4" />
                    </TabsTrigger>
                    <TabsTrigger value="list" title="List View">
                      <List className="h-4 w-4" />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedRole ? (
              <div className="space-y-4">
                {viewMode === "hierarchy" ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-[1000px]">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium">Resource</th>
                            <th className="text-center p-3 font-medium">Read</th>
                            <th className="text-center p-3 font-medium">Add</th>
                            <th className="text-center p-3 font-medium">Edit</th>
                            <th className="text-center p-3 font-medium">Delete</th>
                            <th className="text-center p-3 font-medium">Manage</th>
                            <th className="text-center p-3 font-medium">Export</th>
                            <th className="text-center p-3 font-medium">Import</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentPermissionTree.map((resource) => (
                            <PermissionTreeNode
                              key={resource.path}
                              resource={resource}
                              permission={permissions[resource.path]}
                              level={0}
                              isExpanded={expandedPaths.has(resource.path)}
                              expandedPaths={expandedPaths}
                              onToggleExpand={handleToggleExpand}
                              onPermissionChange={handlePermissionChange}
                              onFieldPermissionChange={handleFieldPermissionChange}
                              allPermissions={permissions}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : viewMode === "grouped" ? (
                  <div>
                    <div className="grid grid-cols-8 gap-4 mb-4 pb-2 border-b">
                      <div className="col-span-1 font-medium">Resource</div>
                      <div className="text-center font-medium">Read</div>
                      <div className="text-center font-medium">Add</div>
                      <div className="text-center font-medium">Edit</div>
                      <div className="text-center font-medium">Delete</div>
                      <div className="text-center font-medium">Manage</div>
                      <div className="text-center font-medium">Export</div>
                      <div className="text-center font-medium">Import</div>
                    </div>
                    <PermissionGroupedView
                      permissions={permissions}
                      onPermissionChange={handlePermissionChange}
                      onFieldPermissionChange={handleFieldPermissionChange}
                      expandedGroups={expandedPaths}
                      onToggleGroup={handleToggleExpand}
                      permissionTree={currentPermissionTree}
                    />
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-8 gap-4 mb-4 pb-2 border-b">
                      <div className="col-span-1 font-medium">Resource</div>
                      <div className="text-center font-medium">Read</div>
                      <div className="text-center font-medium">Add</div>
                      <div className="text-center font-medium">Edit</div>
                      <div className="text-center font-medium">Delete</div>
                      <div className="text-center font-medium">Manage</div>
                      <div className="text-center font-medium">Export</div>
                      <div className="text-center font-medium">Import</div>
                    </div>
                    <PermissionListView
                      permissions={permissions}
                      allResources={allResources}
                      onPermissionChange={handlePermissionChange}
                      onFieldPermissionChange={handleFieldPermissionChange}
                      searchQuery={searchQuery}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Select a role to manage permissions
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
