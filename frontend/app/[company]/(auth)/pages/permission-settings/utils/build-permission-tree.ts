import { PermissionResource, ResourceType } from "./permission-tree";

type NavItem = {
  title: string;
  href: string;
  items?: NavItem[];
  // Can be a string (API) or Lucide icon (default nav)
  icon?: any;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

/**
 * Build permission tree from navigation menu structure
 * Rule:
 * - Preserve the sidebar's group/section structure
 * - Preserve parent menus for navigation parity, but mark them as non-permission rows
 * - Leaf routes (real pages) are permission rows
 *
 * IMPORTANT:
 * Use route-based paths when href exists so runtime permission checks
 * (`/...` -> dotted path) line up with what we store.
 * @param menuGroups - Array of menu groups from API (company-configured menu items)
 */
export function buildPermissionTreeFromNav(menuGroups: NavGroup[]): PermissionResource[] {
  const permissionTree: PermissionResource[] = [];

  const readOnlyDashboardHrefs = new Set<string>([
    "/default",
    "/crm",
    "/ecommerce",
    "/project-management",
    "/payment",
  ]);

  const normalizeHrefToPath = (href: string): string => {
    // Only normalize real dashboard routes; otherwise fall back to title paths.
    // Examples:
    // /crm/deals -> crm.deals
    // /apps/chat -> apps.chat
    return href
      .replace(/^\/dashboard\//, "") // legacy pre-company-slug hrefs
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .replace(/\//g, ".")
      .trim();
  };

  function convertNavItemToResource(
    navItem: NavItem,
    parentPath: string | null = null,
    groupTitle?: string
  ): PermissionResource {
    const hasChildren = navItem.items && navItem.items.length > 0;
    
    // Generate a clean path from title
    const cleanTitle = navItem.title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const hasRealHref = !!navItem.href && navItem.href !== "#";
    const isReadOnly = hasRealHref && readOnlyDashboardHrefs.has(navItem.href);

    const pathFromHref =
      hasRealHref && navItem.href.startsWith("/")
        ? normalizeHrefToPath(navItem.href)
        : null;

    const path = pathFromHref
      ? pathFromHref
      : parentPath
        ? `${parentPath}.${cleanTitle}`
        : cleanTitle;

    const resource: PermissionResource = {
      id: path,
      path,
      name: navItem.title,
      type: hasRealHref ? ("PAGE" as ResourceType) : ("MENU" as ResourceType),
      href: hasRealHref ? navItem.href : undefined,
      parentPath: parentPath || undefined,
      hasPermissions: !hasChildren, // only leaf nodes are permission rows
      allowedActions: !hasChildren
        ? isReadOnly
          ? ["read"]
          : ["read", "write", "delete", "manage", "export", "import"]
        : undefined,
      children: hasChildren
        ? navItem.items!.map((child) => convertNavItemToResource(child, path, groupTitle))
        : undefined,
    };

    return resource;
  }

  // Process each navigation group
  menuGroups.forEach((group) => {
    const groupCleanTitle = group.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    permissionTree.push({
      id: `group.${groupCleanTitle}`,
      path: `group.${groupCleanTitle}`,
      name: group.title,
      type: "SECTION",
      hasPermissions: false,
      children: group.items.map((item) => convertNavItemToResource(item, null, group.title)),
    });
  });

  return permissionTree;
}

