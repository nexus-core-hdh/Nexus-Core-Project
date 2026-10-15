// Hierarchical permission structure based on navigation menu
export type ResourceType = "MENU" | "PAGE" | "SECTION" | "FIELD";
export type PermissionAction = "read" | "write" | "delete" | "manage" | "export" | "import";

export interface PermissionResource {
  id: string;
  path: string;
  name: string;
  type: ResourceType;
  href?: string;
  children?: PermissionResource[];
  parentPath?: string;
  hasPermissions?: boolean; // true if this resource should have permissions (no children or leaf node)
  allowedActions?: PermissionAction[]; // default: all actions (for leaf nodes)
}

// Build permission tree from navigation menu
import { buildPermissionTreeFromNav } from "./build-permission-tree";
import { defaultNavItems } from "@/components/layout/sidebar/nav-main";

// Default permission tree (fallback - will be replaced with company menu)
// This is initialized with defaultNavItems but will be updated when company menu is loaded
export let permissionTree: PermissionResource[] = buildPermissionTreeFromNav(defaultNavItems);

// Flattened cache (kept in sync by updatePermissionTree)
let allPermissionResources: PermissionResource[] = flattenPermissionTree(permissionTree);

// Function to update permission tree with company-configured menu items
export function updatePermissionTree(menuGroups: any[]): void {
  permissionTree = buildPermissionTreeFromNav(menuGroups);
  allPermissionResources = flattenPermissionTree(permissionTree);
}

// Legacy static tree (kept for reference, but now using dynamic tree)
const _legacyPermissionTree: PermissionResource[] = [
  {
    id: "crm",
    path: "crm",
    name: "CRM",
    type: "MENU",
    children: [
      {
        id: "crm.dashboard",
        path: "crm.dashboard",
        name: "CRM Dashboard",
        type: "PAGE",
        href: "/crm",
        parentPath: "crm"
      },
      {
        id: "crm.leads",
        path: "crm.leads",
        name: "Leads",
        type: "MENU",
        parentPath: "crm",
        children: [
          {
            id: "crm.leads.view",
            path: "crm.leads.view",
            name: "View Leads",
            type: "PAGE",
            href: "/crm/leads",
            parentPath: "crm.leads"
          },
          {
            id: "crm.leads.create",
            path: "crm.leads.create",
            name: "Create Lead",
            type: "SECTION",
            parentPath: "crm.leads"
          },
          {
            id: "crm.leads.edit",
            path: "crm.leads.edit",
            name: "Edit Lead",
            type: "SECTION",
            parentPath: "crm.leads"
          },
          {
            id: "crm.leads.delete",
            path: "crm.leads.delete",
            name: "Delete Lead",
            type: "SECTION",
            parentPath: "crm.leads"
          }
        ]
      },
      {
        id: "crm.contacts",
        path: "crm.contacts",
        name: "Contacts",
        type: "MENU",
        parentPath: "crm",
        children: [
          {
            id: "crm.contacts.view",
            path: "crm.contacts.view",
            name: "View Contacts",
            type: "PAGE",
            href: "/crm/contacts",
            parentPath: "crm.contacts"
          },
          {
            id: "crm.contacts.create",
            path: "crm.contacts.create",
            name: "Create Contact",
            type: "SECTION",
            parentPath: "crm.contacts"
          },
          {
            id: "crm.contacts.edit",
            path: "crm.contacts.edit",
            name: "Edit Contact",
            type: "SECTION",
            parentPath: "crm.contacts"
          },
          {
            id: "crm.contacts.delete",
            path: "crm.contacts.delete",
            name: "Delete Contact",
            type: "SECTION",
            parentPath: "crm.contacts"
          }
        ]
      },
      {
        id: "crm.deals",
        path: "crm.deals",
        name: "Deals",
        type: "MENU",
        parentPath: "crm",
        children: [
          {
            id: "crm.deals.view",
            path: "crm.deals.view",
            name: "View Deals",
            type: "PAGE",
            href: "/crm/deals",
            parentPath: "crm.deals"
          },
          {
            id: "crm.deals.create",
            path: "crm.deals.create",
            name: "Create Deal",
            type: "SECTION",
            parentPath: "crm.deals"
          },
          {
            id: "crm.deals.edit",
            path: "crm.deals.edit",
            name: "Edit Deal",
            type: "SECTION",
            parentPath: "crm.deals"
          },
          {
            id: "crm.deals.delete",
            path: "crm.deals.delete",
            name: "Delete Deal",
            type: "SECTION",
            parentPath: "crm.deals"
          }
        ]
      },
      {
        id: "crm.formBuilder",
        path: "crm.formBuilder",
        name: "Form Builder",
        type: "PAGE",
        href: "/pages/form-builder",
        parentPath: "crm"
      },
      {
        id: "crm.settings",
        path: "crm.settings",
        name: "CRM Settings",
        type: "MENU",
        parentPath: "crm",
        children: [
          {
            id: "crm.settings.general",
            path: "crm.settings.general",
            name: "General Settings",
            type: "PAGE",
            href: "/crm/settings",
            parentPath: "crm.settings"
          }
        ]
      }
    ]
  },
  {
    id: "ecommerce",
    path: "ecommerce",
    name: "E-Commerce",
    type: "MENU",
    children: [
      {
        id: "ecommerce.dashboard",
        path: "ecommerce.dashboard",
        name: "E-Commerce Dashboard",
        type: "PAGE",
        href: "/ecommerce",
        parentPath: "ecommerce"
      },
      {
        id: "ecommerce.products",
        path: "ecommerce.products",
        name: "Products",
        type: "MENU",
        parentPath: "ecommerce",
        children: [
          {
            id: "ecommerce.products.view",
            path: "ecommerce.products.view",
            name: "View Products",
            type: "PAGE",
            href: "/pages/products",
            parentPath: "ecommerce.products"
          },
          {
            id: "ecommerce.products.create",
            path: "ecommerce.products.create",
            name: "Create Product",
            type: "SECTION",
            href: "/pages/products/create",
            parentPath: "ecommerce.products"
          },
          {
            id: "ecommerce.products.edit",
            path: "ecommerce.products.edit",
            name: "Edit Product",
            type: "SECTION",
            parentPath: "ecommerce.products"
          },
          {
            id: "ecommerce.products.delete",
            path: "ecommerce.products.delete",
            name: "Delete Product",
            type: "SECTION",
            parentPath: "ecommerce.products"
          }
        ]
      },
      {
        id: "ecommerce.customers",
        path: "ecommerce.customers",
        name: "Customers",
        type: "MENU",
        parentPath: "ecommerce",
        children: [
          {
            id: "ecommerce.customers.view",
            path: "ecommerce.customers.view",
            name: "View Customers",
            type: "PAGE",
            href: "/crm/customers",
            parentPath: "ecommerce.customers"
          },
          {
            id: "ecommerce.customers.create",
            path: "ecommerce.customers.create",
            name: "Create Customer",
            type: "SECTION",
            parentPath: "ecommerce.customers"
          },
          {
            id: "ecommerce.customers.edit",
            path: "ecommerce.customers.edit",
            name: "Edit Customer",
            type: "SECTION",
            parentPath: "ecommerce.customers"
          },
          {
            id: "ecommerce.customers.delete",
            path: "ecommerce.customers.delete",
            name: "Delete Customer",
            type: "SECTION",
            parentPath: "ecommerce.customers"
          }
        ]
      },
      {
        id: "ecommerce.orders",
        path: "ecommerce.orders",
        name: "Orders",
        type: "MENU",
        parentPath: "ecommerce",
        children: [
          {
            id: "ecommerce.orders.view",
            path: "ecommerce.orders.view",
            name: "View Orders",
            type: "PAGE",
            href: "/pages/orders",
            parentPath: "ecommerce.orders"
          },
          {
            id: "ecommerce.orders.create",
            path: "ecommerce.orders.create",
            name: "Create Order",
            type: "SECTION",
            parentPath: "ecommerce.orders"
          },
          {
            id: "ecommerce.orders.edit",
            path: "ecommerce.orders.edit",
            name: "Edit Order",
            type: "SECTION",
            parentPath: "ecommerce.orders"
          }
        ]
      }
    ]
  },
  {
    id: "projectManagement",
    path: "projectManagement",
    name: "Project Management",
    type: "MENU",
    children: [
      {
        id: "projectManagement.dashboard",
        path: "projectManagement.dashboard",
        name: "Project Dashboard",
        type: "PAGE",
        href: "/project-management",
        parentPath: "projectManagement"
      },
      {
        id: "projectManagement.list",
        path: "projectManagement.list",
        name: "Project List",
        type: "PAGE",
        href: "/project-list",
        parentPath: "projectManagement"
      },
      {
        id: "projectManagement.tasks",
        path: "projectManagement.tasks",
        name: "Tasks",
        type: "PAGE",
        href: "/apps/tasks",
        parentPath: "projectManagement"
      }
    ]
  },
  {
    id: "collaboration",
    path: "collaboration",
    name: "Collaboration",
    type: "MENU",
    children: [
      {
        id: "collaboration.messenger",
        path: "collaboration.messenger",
        name: "Messenger",
        type: "PAGE",
        href: "/apps/chat",
        parentPath: "collaboration"
      },
      {
        id: "collaboration.fileManager",
        path: "collaboration.fileManager",
        name: "File Manager",
        type: "PAGE",
        href: "/file-manager",
        parentPath: "collaboration"
      },
      {
        id: "collaboration.documents",
        path: "collaboration.documents",
        name: "Online Documents",
        type: "PAGE",
        href: "/collaboration/documents",
        parentPath: "collaboration"
      }
    ]
  },
  {
    id: "pages",
    path: "pages",
    name: "Pages",
    type: "MENU",
    children: [
      {
        id: "pages.users",
        path: "pages.users",
        name: "Users",
        type: "PAGE",
        href: "/pages/users",
        parentPath: "pages"
      },
      {
        id: "pages.companies",
        path: "pages.companies",
        name: "Companies",
        type: "PAGE",
        href: "/pages/companies",
        parentPath: "pages"
      },
      {
        id: "pages.settings",
        path: "pages.settings",
        name: "Settings",
        type: "MENU",
        parentPath: "pages",
        children: [
          {
            id: "pages.settings.profile",
            path: "pages.settings.profile",
            name: "Profile Settings",
            type: "PAGE",
            href: "/pages/settings",
            parentPath: "pages.settings"
          },
          {
            id: "pages.settings.account",
            path: "pages.settings.account",
            name: "Account Settings",
            type: "PAGE",
            href: "/pages/settings/account",
            parentPath: "pages.settings"
          },
          {
            id: "pages.settings.permissions",
            path: "pages.settings.permissions",
            name: "Permission Settings",
            type: "PAGE",
            href: "/pages/permission-settings",
            parentPath: "pages.settings"
          }
        ]
      }
    ]
  },
  {
    id: "apps",
    path: "apps",
    name: "Apps",
    type: "MENU",
    children: [
      {
        id: "apps.notes",
        path: "apps.notes",
        name: "Notes",
        type: "PAGE",
        href: "/apps/notes",
        parentPath: "apps"
      },
      {
        id: "apps.calendar",
        path: "apps.calendar",
        name: "Calendar",
        type: "PAGE",
        href: "/apps/calendar",
        parentPath: "apps"
      },
      {
        id: "apps.mail",
        path: "apps.mail",
        name: "Mail",
        type: "PAGE",
        href: "/apps/mail",
        parentPath: "apps"
      }
    ]
  }
];

// Flatten the tree for easy lookup
export function flattenPermissionTree(
  tree: PermissionResource[],
  result: PermissionResource[] = []
): PermissionResource[] {
  for (const node of tree) {
    result.push(node);
    if (node.children) {
      flattenPermissionTree(node.children, result);
    }
  }
  return result;
}

/** Walk the tree (not the flattened cache) — use when `permissionTree` is a fresh prop. */
export function findResourceInTree(
  tree: PermissionResource[],
  path: string
): PermissionResource | undefined {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.children?.length) {
      const hit = findResourceInTree(node.children, path);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** All permission rows (leaves) under a node — skips parent menus and section wrappers. */
export function collectPermissionLeaves(node: PermissionResource): PermissionResource[] {
  if (!node.children?.length) {
    return node.hasPermissions === false ? [] : [node];
  }
  return node.children.flatMap((c) => collectPermissionLeaves(c));
}

/**
 * Leaf resources to show in the matrix for the current sidebar selection.
 * - No selection: all permission leaves in the app.
 * - Section or parent menu: all descendant permission leaves.
 * - Leaf: that resource only.
 */
export function getVisibleMatrixLeaves(
  permissionTree: PermissionResource[],
  selectedResource: string | null
): PermissionResource[] {
  const flat = flattenPermissionTree(permissionTree);
  const allLeaves = flat.filter((r) => !r.children?.length && r.hasPermissions !== false);
  if (!selectedResource) return allLeaves;
  const node = findResourceInTree(permissionTree, selectedResource);
  if (!node) return allLeaves;
  if (node.children?.length) return collectPermissionLeaves(node);
  return node.hasPermissions === false ? [] : [node];
}

// Get all resources flattened
export function getAllPermissionResources(): PermissionResource[] {
  return allPermissionResources;
}

// Find resource by path
export function findResourceByPath(path: string): PermissionResource | undefined {
  return allPermissionResources.find((r) => r.path === path);
}

// Get children of a resource
export function getResourceChildren(path: string): PermissionResource[] {
  const resource = findResourceByPath(path);
  return resource?.children || [];
}














