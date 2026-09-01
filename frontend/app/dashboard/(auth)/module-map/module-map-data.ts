import {
  BadgeDollarSign,
  Boxes,
  Building2,
  ClipboardCheck,
  Factory,
  FlaskConical,
  Landmark,
  Layers,
  ListTree,
  type LucideIcon,
  PackageSearch,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  UsersRound,
} from "lucide-react";

/**
 * Every href below was verified against a real Next.js route file under
 * frontend/app/dashboard/(auth)/ (or, for legacy-erp screens, cross-checked
 * against the live seeded menu-items nav config) before being wired in here.
 * Anything without a confirmed route uses "#" — never a guessed path.
 *
 * Rule applied consistently: a screen that only exists as a dynamic
 * `[id]` route (e.g. an order/style-card detail page) is treated as
 * unavailable ("#") for this map, since there is no fixed URL to link to
 * without an arbitrary record id that may not exist for the viewer.
 */
export interface MapItem {
  label: string;
  href: string;
}

export interface MapCategory {
  title: string;
  items: MapItem[];
}

export interface ModuleCard {
  number: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  categories: MapCategory[];
}

export interface MapSection {
  title: string;
  cards: ModuleCard[];
}

export const coreErpModules: MapSection = {
  title: "Core ERP Modules (Legacy ERP)",
  cards: [
    {
      number: 1,
      title: "Inventory",
      subtitle: "Manage all inventory items",
      icon: Boxes,
      categories: [
        {
          title: "Inventory Management",
          items: [
            { label: "Inventory Cards (Worklist)", href: "/dashboard/legacy-erp/inventory-cards-list" },
            { label: "New Inventory Card (Form)", href: "/dashboard/legacy-erp/inventory-cards-new" },
            { label: "Inventory Card Detail (View/Edit)", href: "#" },
            { label: "Item Statement (Statement)", href: "/dashboard/legacy-erp/item-statement" },
          ],
        },
        {
          title: "Master Data",
          items: [
            { label: "Fabric Cards", href: "/dashboard/legacy-erp/fabric-cards-list" },
            { label: "Yarn Cards", href: "/dashboard/legacy-erp/yarn-cards-list" },
            { label: "Trim Cards", href: "/dashboard/legacy-erp/trim-cards" },
            { label: "Trim Inventory Cards", href: "/dashboard/legacy-erp/trim-inventory-cards-list" },
            { label: "Sizes", href: "/dashboard/legacy-erp/sizes-list" },
            { label: "Unit Sets", href: "/dashboard/legacy-erp/unit-sets-list" },
          ],
        },
        {
          title: "Operations",
          items: [
            { label: "Stock Adjustments", href: "#" },
            { label: "Inventory Transfers", href: "#" },
          ],
        },
        {
          title: "Warehouses",
          items: [
            { label: "Warehouses", href: "/dashboard/legacy-erp/warehouses" },
            { label: "Warehouse Parameters", href: "/dashboard/legacy-erp/warehouse-parameters" },
          ],
        },
      ],
    },
    {
      number: 2,
      title: "Receipts",
      subtitle: "Inventory receipts & GRNs",
      icon: Receipt,
      categories: [
        {
          title: "Receipt Management",
          items: [
            { label: "Receipts (Worklist)", href: "/dashboard/legacy-erp/inventory-receipts-list" },
            { label: "Create Receipt (Form)", href: "/dashboard/legacy-erp/inventory-receipts" },
            { label: "Receipt Detail (View/Edit)", href: "#" },
            { label: "Receipt Master Data", href: "/dashboard/legacy-erp/receipt-master-data" },
            { label: "Financial Receipt Master Data", href: "/dashboard/legacy-erp/financial-receipt-master-data" },
          ],
        },
        {
          title: "Receipt Configuration",
          items: [
            { label: "Receipt Types Setup", href: "#" },
            { label: "Receipt Prefix Setup", href: "#" },
            { label: "Client/Configuration", href: "#" },
          ],
        },
        {
          title: "Lookup & Reports",
          items: [
            { label: "Receipt Lookup", href: "#" },
            { label: "Receipt Statements", href: "#" },
            { label: "Print / Export", href: "#" },
          ],
        },
      ],
    },
    {
      number: 3,
      title: "Purchase",
      subtitle: "Purchases & procurement",
      icon: ShoppingCart,
      categories: [
        {
          title: "Purchase Orders",
          items: [
            { label: "Purchase Orders (Worklist)", href: "/dashboard/legacy-erp/purchase-orders-list" },
            { label: "Create Purchase Order", href: "/dashboard/legacy-erp/purchase-orders" },
            { label: "Purchase Order Detail", href: "#" },
            { label: "PO Master Data", href: "#" },
          ],
        },
        {
          title: "Suppliers",
          items: [
            { label: "Suppliers (List)", href: "#" },
            { label: "Supplier Detail (View/Edit)", href: "#" },
          ],
        },
        {
          title: "Lookup & Reports",
          items: [
            { label: "PO Lookup", href: "#" },
            { label: "PO Reports", href: "#" },
            { label: "Pending PO Report", href: "#" },
          ],
        },
      ],
    },
    {
      number: 4,
      title: "Subcontract",
      subtitle: "Subcontracting management",
      icon: Factory,
      categories: [
        {
          title: "Subcontract Orders",
          items: [
            { label: "Subcontract Orders (Worklist)", href: "/dashboard/legacy-erp/subcontract-orders-list" },
            { label: "Create SC Order", href: "/dashboard/legacy-erp/subcontract-orders" },
            { label: "SC Order Detail", href: "#" },
          ],
        },
        {
          title: "Subcontract Receipts",
          items: [
            { label: "SC Receipts (Worklist)", href: "/dashboard/legacy-erp/subcontract-receipts-list" },
            { label: "Create SC Receipt", href: "#" },
            { label: "SC Receipt Detail", href: "#" },
          ],
        },
        {
          title: "Lookups & Reports",
          items: [
            { label: "SC Lookup", href: "/dashboard/legacy-erp/master-lookup?key=subcontract-type" },
            { label: "SC Reports", href: "#" },
          ],
        },
      ],
    },
    {
      number: 5,
      title: "Accounts & Finance",
      subtitle: "Accounts & financial records",
      icon: Landmark,
      categories: [
        {
          title: "Accounts",
          items: [
            { label: "Current Accounts (Worklist)", href: "/dashboard/legacy-erp/current-accounts-list" },
            { label: "Create Account (Detail/View/Edit)", href: "/dashboard/legacy-erp/current-accounts" },
            { label: "Account Ledger (Statement)", href: "#" },
          ],
        },
        {
          title: "Financial Receipts",
          items: [
            { label: "Financial Receipts (Worklist)", href: "/dashboard/legacy-erp/financial-receipts" },
            { label: "Create Financial Receipt", href: "#" },
            { label: "Financial Receipt Detail", href: "#" },
          ],
        },
        {
          title: "General",
          items: [
            { label: "Contracts", href: "/dashboard/legacy-erp/contracts-list" },
            { label: "Financial Settings", href: "#" },
            { label: "General Settings", href: "/dashboard/legacy-erp/general-settings" },
          ],
        },
      ],
    },
    {
      number: 6,
      title: "Master Lookups",
      subtitle: "System lookups & masters",
      icon: ListTree,
      categories: [
        {
          title: "Lookups",
          items: [
            { label: "Master Lookup (Search)", href: "/dashboard/legacy-erp/master-lookup" },
            { label: "Lookup Categories", href: "#" },
            { label: "Lookup Items", href: "#" },
            { label: "Lookup Configuration", href: "#" },
          ],
        },
        {
          title: "System Masters",
          items: [
            { label: "Users & Roles", href: "/dashboard/pages/users" },
            { label: "Worklist Columns", href: "#" },
            { label: "Number Series", href: "#" },
            { label: "Print Settings", href: "#" },
          ],
        },
      ],
    },
  ],
};

export const businessOperationsModules: MapSection = {
  title: "Business & Operation Modules",
  cards: [
    {
      number: 7,
      title: "PLM (Product Lifecycle)",
      subtitle: "Product development & lifecycle",
      icon: Sparkles,
      categories: [
        {
          title: "Product Development",
          items: [
            { label: "Style Cards (Worklist)", href: "/dashboard/plm/style-cards" },
            { label: "Style Card Detail (Workspace)", href: "#" },
            { label: "Product Cards", href: "/dashboard/plm/product-cards" },
            { label: "Swatch Cards", href: "/dashboard/plm/swatch-cards" },
            { label: "Mood Boards", href: "/dashboard/plm/mood-boards" },
          ],
        },
        {
          title: "Product Engineering",
          items: [
            { label: "BOM (Bill of Materials)", href: "#" },
            { label: "Stages", href: "#" },
            { label: "Costing Sheets", href: "/dashboard/plm/costing-sheets" },
            { label: "Critical Path", href: "/dashboard/plm/critical-path" },
          ],
        },
        {
          title: "Planning & Execution",
          items: [
            { label: "Sampling", href: "/dashboard/plm/sample-cards" },
            { label: "Orders", href: "/dashboard/plm/orders" },
            { label: "Tasks", href: "/dashboard/plm/tasks" },
          ],
        },
        {
          title: "Documentation & Reports",
          items: [
            { label: "Documents", href: "/dashboard/plm/documents" },
            { label: "Reports", href: "#" },
          ],
        },
      ],
    },
    {
      number: 8,
      title: "Sales",
      subtitle: "Sales & order management",
      icon: BadgeDollarSign,
      categories: [
        {
          title: "Sales Operations",
          items: [
            { label: "Sales Orders (Worklist)", href: "/dashboard/pages/orders" },
            { label: "Create Sales Order", href: "#" },
            { label: "Sales Order Detail", href: "#" },
          ],
        },
        {
          title: "Customers",
          items: [
            { label: "Customers (List)", href: "/dashboard/crm/customers" },
            { label: "Customer Detail", href: "#" },
          ],
        },
        {
          title: "Pricing & Other",
          items: [
            { label: "Price Lists", href: "#" },
            { label: "Discounts", href: "#" },
            { label: "Sales Returns", href: "/dashboard/pages/returns" },
          ],
        },
        {
          title: "Reports",
          items: [
            { label: "Sales Reports", href: "#" },
            { label: "Order Reports", href: "#" },
          ],
        },
      ],
    },
    {
      number: 9,
      title: "CRM",
      subtitle: "Customer relationship management",
      icon: UsersRound,
      categories: [
        {
          title: "Contacts",
          items: [
            { label: "Contacts (List)", href: "/dashboard/crm/contacts" },
            { label: "Contact Detail", href: "#" },
          ],
        },
        {
          title: "Activities",
          items: [
            { label: "Activities (Worklist)", href: "#" },
            { label: "Add Activity", href: "#" },
          ],
        },
        {
          title: "Pipeline",
          items: [
            { label: "Pipeline (Kanban)", href: "#" },
            { label: "Opportunities", href: "/dashboard/crm/deals" },
          ],
        },
        {
          title: "Reports",
          items: [{ label: "CRM Reports", href: "#" }, { label: "Activity Reports", href: "#" }],
        },
      ],
    },
    {
      number: 10,
      title: "Production",
      subtitle: "Manufacturing operations",
      icon: PackageSearch,
      categories: [
        {
          title: "Planning",
          items: [
            { label: "Production Plans", href: "#" },
            { label: "Plan Detail", href: "#" },
          ],
        },
        {
          title: "Production Floor",
          items: [
            { label: "Cutting", href: "#" },
            { label: "Knitting", href: "#" },
            { label: "Dyeing", href: "#" },
            { label: "Sewing", href: "#" },
            { label: "Printing", href: "#" },
            { label: "Embroidery", href: "#" },
            { label: "Finishing", href: "#" },
            { label: "Packing", href: "#" },
            { label: "Dispatch", href: "#" },
          ],
        },
        {
          title: "Production Reports",
          items: [
            { label: "Production Reports", href: "#" },
            { label: "Floor Reports", href: "#" },
          ],
        },
      ],
    },
    {
      number: 11,
      title: "Costing",
      subtitle: "Costing & analysis",
      icon: FlaskConical,
      categories: [
        {
          title: "Costing",
          items: [
            { label: "Costing Sheets", href: "/dashboard/plm/costing-sheets" },
            { label: "Costing Detail", href: "/dashboard/plm/costing-sheets/cost-detail-entry" },
          ],
        },
        {
          title: "Analysis",
          items: [
            { label: "Cost Analysis", href: "#" },
            { label: "Variance Analysis", href: "#" },
          ],
        },
        {
          title: "Reports",
          items: [
            { label: "Costing Reports", href: "#" },
            { label: "Comparison Reports", href: "/dashboard/plm/costing-sheets/profit-breakdown" },
          ],
        },
      ],
    },
    {
      number: 12,
      title: "Quality",
      subtitle: "Quality management",
      icon: ShieldCheck,
      categories: [
        {
          title: "Quality Control",
          items: [
            { label: "QC Inspections", href: "#" },
            { label: "QC Checklist", href: "#" },
          ],
        },
        {
          title: "Defects",
          items: [
            { label: "Defect Log", href: "#" },
            { label: "Defect Analysis", href: "#" },
          ],
        },
        {
          title: "Reports",
          items: [
            { label: "Quality Reports", href: "#" },
            { label: "Defect Reports", href: "#" },
          ],
        },
      ],
    },
    {
      number: 13,
      title: "Reports",
      subtitle: "Analytics & reporting",
      icon: ClipboardCheck,
      categories: [
        {
          title: "Operational Reports",
          items: [
            { label: "Inventory Reports", href: "#" },
            { label: "Purchase Reports", href: "#" },
            { label: "Production Reports", href: "#" },
            { label: "Sales Reports", href: "#" },
            { label: "Finance Reports", href: "#" },
          ],
        },
        {
          title: "Analytics",
          items: [
            { label: "Dashboards", href: "/dashboard/default" },
            { label: "KPIs", href: "#" },
            { label: "Trends", href: "#" },
          ],
        },
        {
          title: "Export",
          items: [
            { label: "Excel Export", href: "#" },
            { label: "PDF Export", href: "#" },
          ],
        },
      ],
    },
  ],
};

export const adminSystemModules: MapSection = {
  title: "Admin & System",
  cards: [
    {
      number: 14,
      title: "Administration",
      subtitle: "System administration",
      icon: Building2,
      categories: [
        {
          title: "User Management",
          items: [
            { label: "Users", href: "/dashboard/pages/users" },
            { label: "Roles & Permissions", href: "/dashboard/pages/user-roles" },
          ],
        },
        {
          title: "System Configuration",
          items: [
            { label: "General Settings", href: "/dashboard/legacy-erp/general-settings" },
            { label: "Workflows", href: "/dashboard/pages/business-processes" },
            { label: "Integrations", href: "/dashboard/crm/settings/integration" },
            { label: "Audit Logs", href: "#" },
          ],
        },
        {
          title: "Tools",
          items: [
            { label: "Data Import", href: "#" },
            { label: "Data Export", href: "#" },
            { label: "System Backup", href: "#" },
          ],
        },
        {
          title: "Support",
          items: [
            { label: "Activity Logs", href: "#" },
            { label: "Error Logs", href: "#" },
          ],
        },
      ],
    },
  ],
};

export const allSections: MapSection[] = [coreErpModules, businessOperationsModules, adminSystemModules];

export const workflowExamples: { title: string; steps: string[] }[] = [
  { title: "Inventory Receipt Flow", steps: ["Receipts", "Create", "Save", "Post", "Stock Update"] },
  { title: "Purchase Flow", steps: ["PO", "Receive", "GRN", "Stock Update", "Pay"] },
  { title: "Production Flow", steps: ["Plan", "Issue", "Process", "Finish", "Dispatch"] },
  { title: "Sales Order Flow", steps: ["Order", "Produce", "Ship", "Invoice", "Receive"] },
  { title: "Financial Flow", steps: ["Transaction", "Post", "Ledger", "Report"] },
];
