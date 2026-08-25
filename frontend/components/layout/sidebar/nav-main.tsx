"use client";

import * as React from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";
import {
  ActivityIcon,
  ArchiveRestoreIcon,
  BadgeDollarSignIcon,
  BrainCircuitIcon,
  BrainIcon,
  Building2Icon,
  CalendarIcon,
  ChartBarDecreasingIcon,
  ChartPieIcon,
  ClipboardCheckIcon,
  ClipboardMinusIcon,
  ComponentIcon,
  CookieIcon,
  FingerprintIcon,
  FolderDotIcon,
  FolderIcon,
  FolderOpen,
  GaugeIcon,
  GraduationCapIcon,
  ImagesIcon,
  KeyIcon,
  MailIcon,
  MessageSquareIcon,
  ProportionsIcon,
  SettingsIcon,
  ShoppingBagIcon,
  SquareCheckIcon,
  StickyNoteIcon,
  UserIcon,
  UsersIcon,
  WalletMinimalIcon,
  type LucideIcon,
  GithubIcon,
  RedoDotIcon,
  BrushCleaningIcon,
  CreditCardIcon,
  SpeechIcon,
  MessageSquareHeartIcon,
  BookAIcon,
  PuzzleIcon,
  HardDrive,
  GroupIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  Plus,
  Package,
  ShoppingCart,
  FileText,
  List,
  RotateCcw,
  Workflow,
  Scissors,
  BarChart3,
  GitBranch,
  Layers,
  FlaskConical,
  ClipboardList,
  FileStack,
  CheckSquare,
  Tag,
  LayoutTemplate,
  Share2,
  Link2,
  ExternalLink,
  AlertCircle,
  CalendarX,
  PieChart,
  Warehouse,
  UserSquare2,
  Star,
  Ruler,
  Shirt,
  ListTree,
  Boxes,
  Ribbon,
  Sliders,
  Truck,
  Factory,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DashboardIcon } from "@radix-ui/react-icons";
import { usePermissionCheck } from "@/hooks/use-permission";
import { toast } from "sonner";
import { menuItemsApi, settingsApi } from "@/lib/api";
import { customEntityPageApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { ModuleLauncher } from "./module-launcher";

export type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  isComing?: boolean;
  isDataBadge?: string;
  isNew?: boolean;
  newTab?: boolean;
  items?: NavItem[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

// Hide items/sections from the sidebar (even if present in DB menus)
const HIDDEN_GROUP_TITLES = new Set<string>(["AI Apps"]);
const HIDDEN_ITEM_HREFS = new Set<string>([
  "/dashboard/apps/api-keys",
  "/dashboard/pages/user-profile",
  "/dashboard/sales",
  "/dashboard/project-management",
  "/dashboard/payment",
  "/dashboard/apps/pos-system",
  "/dashboard/plm/documents",
]);
const HIDDEN_ITEM_TITLES = new Set<string>([
  "Api Keys", "Profile V2",
  "E-commerce",
  "Sales",
  "Project Management",
  "Payment Dashboard",
  "POS App",
  "Authentication",
  "Error Pages",
  "Document Management",
]);

function filterNavItemsDeep(items: NavItem[]): NavItem[] {
  return items
    .filter((i) => {
      if (HIDDEN_ITEM_HREFS.has(i.href)) return false;
      if (HIDDEN_ITEM_TITLES.has(i.title)) return false;
      return true;
    })
    .map((i) => ({
      ...i,
      items: i.items ? filterNavItemsDeep(i.items) : undefined,
    }))
    .filter((i) => (i.items ? i.items.length > 0 || i.href !== "#" : true));
}

function filterNavGroups(groups: NavGroup[]): NavGroup[] {
  return groups
    .filter((g) => !HIDDEN_GROUP_TITLES.has(g.title))
    .map((g) => ({ ...g, items: filterNavItemsDeep(g.items) }))
    .filter((g) => g.items.length > 0);
}

function filterNavByUserSelection(groups: NavGroup[], selectedIds: string[] | null): NavGroup[] {
  const normalizeId = (href: string) =>
    href
      .trim()
      .replace(/\/+$/, "")
      .replace(/\?[\s\S]*$/, "");

  const selected = new Set(
    (selectedIds || [])
      .filter((x) => typeof x === "string" && x.length > 0)
      .map((x) => normalizeId(x))
  );
  // If user didn't configure anything, keep default behavior (show all).
  if (selected.size === 0) return groups;

  const keepDeep = (items: NavItem[]): NavItem[] => {
    const next: NavItem[] = [];
    for (const item of items) {
      const keptChildren = item.items ? keepDeep(item.items) : undefined;
      const keepSelf =
        item.href && item.href !== "#"
          ? selected.has(normalizeId(item.href))
          : false;
      const keepBecauseChildren = !!keptChildren && keptChildren.length > 0;
      if (!keepSelf && !keepBecauseChildren) continue;
      next.push({
        ...item,
        items: keptChildren,
      });
    }
    return next;
  };

  return groups
    .map((g) => ({ ...g, items: keepDeep(g.items) }))
    .filter((g) => g.items.length > 0);
}

// Icon mapping from string names to icon components
const iconMap: Record<string, LucideIcon> = {
  ChartPie: ChartPieIcon,
  Users: UsersIcon,
  MessageSquare: MessageSquareIcon,
  FolderDot: FolderDotIcon,
  ClipboardMinus: ClipboardMinusIcon,
  Component: ComponentIcon,
  Folder: FolderIcon,
  ArchiveRestore: ArchiveRestoreIcon,
  Group: GroupIcon,
  LayoutDashboard: LayoutDashboardIcon,
  ShoppingBag: ShoppingBagIcon,
  Package: Package,
  Plus: Plus,
  ShoppingCart: ShoppingCart,
  Truck: Truck,
  FileText: FileText,
  RotateCcw: RotateCcw,
  BadgeDollarSign: BadgeDollarSignIcon,
  ChartBar: ChartBarDecreasingIcon,
  User: UserIcon,
  Settings: SettingsIcon,
  List: List,
  ClipboardCheck: ClipboardCheckIcon,
  CreditCard: CreditCardIcon,
  Wallet: WalletMinimalIcon,
  Building2: Building2Icon,
  StickyNote: StickyNoteIcon,
  MessageSquareHeart: MessageSquareHeartIcon,
  Mail: MailIcon,
  SquareCheck: SquareCheckIcon,
  Calendar: CalendarIcon,
  Key: KeyIcon,
  Cookie: CookieIcon,
  Brain: BrainIcon,
  BrainCircuit: BrainCircuitIcon,
  Images: ImagesIcon,
  Speech: SpeechIcon,
  Fingerprint: FingerprintIcon,
  Brush: BrushCleaningIcon,
  Puzzle: PuzzleIcon,
  History: HistoryIcon,
  Workflow: Workflow,
  Scissors: Scissors,
  BarChart3: BarChart3,
  GitBranch: GitBranch,
  Layers: Layers,
  FolderOpen: FolderOpen,
  FlaskConical: FlaskConical,
  ClipboardList: ClipboardList,
  FileStack: FileStack,
  CheckSquare: CheckSquare,
  Tag: Tag,
  LayoutTemplate: LayoutTemplate,
  Share2: Share2,
  Link2: Link2,
  ExternalLink: ExternalLink,
  AlertCircle: AlertCircle,
  CalendarX: CalendarX,
  PieChart: PieChart,
  Warehouse: Warehouse,
  UserSquare2: UserSquare2,
  Star: Star,
  Ruler: Ruler,
  Shirt: Shirt,
  ListTree: ListTree,
  Boxes: Boxes,
  Ribbon: Ribbon,
  Sliders: Sliders,
  Factory: Factory,
};

// Helper function to get icon component from string name
export const getIcon = (iconName?: string | null): LucideIcon | undefined => {
  if (!iconName) return undefined;
  return iconMap[iconName] || undefined;
};

// Transform API menu items to NavItem format
export const transformMenuItem = (item: any): NavItem & { id?: number } => {
  const navItem: NavItem & { id?: number } = {
    title: item.title,
    href: item.href,
    icon: getIcon(item.icon),
    isComing: item.isComing || false,
    isDataBadge: item.isDataBadge || undefined,
    isNew: item.isNew || false,
    newTab: item.newTab || false,
    id: item.id, // Store the database ID for reordering
  };

  if (item.items && item.items.length > 0) {
    navItem.items = item.items.map(transformMenuItem);
  }

  return navItem;
};

// A module (menu group) has no icon of its own in the schema — only
// individual items do — so its representative icon in the Module Launcher
// trigger is derived from the first icon found anywhere in its item tree.
// Fully data-driven: no per-module name is ever referenced.
function findModuleIcon(items: NavItem[]): LucideIcon | undefined {
  for (const item of items) {
    if (item.icon) return item.icon;
    if (item.items) {
      const found = findModuleIcon(item.items);
      if (found) return found;
    }
  }
  return undefined;
}

// Default nav items (fallback)
export const defaultNavItems: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      {
        title: "Default",
        href: "/dashboard/default",
        icon: ChartPieIcon
      },
      {
        title: "Collaboration",
        href: "#",
        icon: UsersIcon,
        items: [
          {
            title: "Messenger",
            href: "/dashboard/apps/chat",
            icon: MessageSquareIcon
          },
          {
            title: "Feed",
            href: "/dashboard/collaboration/feed",
            icon: FolderDotIcon
          },
          {
            title: "Collabs",
            href: "/dashboard/collaboration/collabs",
            icon: ClipboardMinusIcon
          },
          {
            title: "Online Documents",
            href: "/dashboard/collaboration/documents",
            icon: ComponentIcon
          },
          {
            title:"File Manager",
            href: "/dashboard/file-manager",
            icon: FolderIcon,
            items: [
              {
                title: "Dashboard",
                href: "/dashboard/file-manager",
                icon: FolderIcon,
              },
              {
                title: "File Manager",
                href: "/dashboard/apps/file-manager",
                icon: ArchiveRestoreIcon,
              },
            ]
          },
          {
            title:"Work Groups",
            href:"/dashboard/collaboration/work-groups",
            icon: GroupIcon
          },
          {
            title:"Boards",
            href:"/dashboard/collaboration/boards",
            icon: LayoutDashboardIcon
          }
        ]
      },
      {
        title: "E-commerce",
        href: "#",
        icon: ShoppingBagIcon,
        items: [
          { title: "Dashboard", href: "/dashboard/ecommerce", icon: ChartPieIcon },
          { title: "Product List", href: "/dashboard/pages/products", icon: Package },
          { title: "Add Product", href: "/dashboard/pages/products/create", icon: Plus },
          { title: "Customers", href: "/dashboard/crm/customers", icon: UsersIcon },
          { title: "Order List", href: "/dashboard/pages/orders", icon: ShoppingCart },
          { title: "Order Detail", href: "/dashboard/pages/orders/detail", icon: FileText },
          { title: "Returns", href: "/dashboard/pages/returns", icon: RotateCcw }
        ]
      },
      { title: "Sales", href: "/dashboard/sales", icon: BadgeDollarSignIcon },
      {
        title: "CRM",
        href: "#",
        icon: ChartBarDecreasingIcon,
        items: [
          { title: "Dashboard", href: "/dashboard/crm", icon: ChartPieIcon },
          { title: "Leads", href: "/dashboard/crm/leads", icon: UserIcon },
          { title: "Contacts", href: "/dashboard/crm/contacts", icon: UsersIcon },
          { title: "Deals", href: "/dashboard/crm/deals", icon: BadgeDollarSignIcon },
        ]
      },
      { title: "My Menu", href: "/dashboard/my-menu", icon: Star },
      // {
      //   title: "Website Analytics",
      //   href: "/dashboard/website-analytics",
      //   icon: GaugeIcon
      // },
      {
        title: "Project Management",
        href: "/dashboard/project-management",
        icon: FolderDotIcon,
        items: [
          { title: "Dashboard", href: "/dashboard/project-management", icon: LayoutDashboardIcon },
          { title: "Project List", href: "/dashboard/project-list", icon: List },
          {
            title: "Tasks",
            href: "/dashboard/apps/tasks",
            icon: ClipboardCheckIcon
          },
        ]
      },
      // {
      //   title: "File Manager",
      //   href: "/dashboard/file-manager",
      //   icon: FolderIcon
      // },
      // { title: "Crypto", href: "/dashboard/crypto", icon: WalletMinimalIcon },
      // { title: "Academy/School", href: "/dashboard/academy", icon: GraduationCapIcon },
      // { title: "Hospital Management", href: "/dashboard/hospital-management", icon: ActivityIcon },
      // {
      //   title: "Hotel Dashboard",
      //   href: "/dashboard/hotel",
      //   icon: Building2Icon,
      //   items: [
      //     { title: "Dashboard", href: "/dashboard/hotel" },
      //     { title: "Bookings", href: "/dashboard/hotel/bookings" }
      //   ]
      // },
      // {
      //   title: "Finance Dashboard",
      //   href: "/dashboard/finance",
      //   icon: WalletMinimalIcon
      // },
      {
        title: "Payment Dashboard",
        href: "/dashboard/payment",
        icon: CreditCardIcon,
        items: [
          { title: "Dashboard", href: "/dashboard/payment", icon: LayoutDashboardIcon },
          { title: "Transactions", href: "/dashboard/payment/transactions", icon: WalletMinimalIcon },
          { title: "Customer Payments", href: "/dashboard/payment/customer-payments", icon: UserIcon },
          { title: "Supplier Payments", href: "/dashboard/payment/supplier-payments", icon: UsersIcon }
        ]
      },
    ]
  },
  {
    title: "Apps",
    items: [
      {
        title: "Users",
        href: "/dashboard/pages/users",
        icon: UsersIcon
      },
      {
        title: "Companies",
        href: "/dashboard/pages/companies",
        icon: Building2Icon
      },
      {
        title: "Automation",
        href: "/dashboard/pages/business-processes",
        icon: Workflow
      },
      { title: "Notes", href: "/dashboard/apps/notes", icon: StickyNoteIcon, isDataBadge: "8" },
      // { title: "Chats", href: "/dashboard/apps/chat", icon: MessageSquareIcon, isDataBadge: "5" },
      { title: "Mail", href: "/dashboard/apps/mail", icon: MailIcon },
      {
        title: "Todo List App",
        href: "/dashboard/apps/todo-list-app",
        icon: SquareCheckIcon
      },
      // {
      //   title: "Tasks",
      //   href: "/dashboard/apps/tasks",
      //   icon: ClipboardCheckIcon
      // },
      { title: "Calendar", href: "/dashboard/apps/calendar", icon: CalendarIcon },
      // {
      //   title: "File Manager",
      //   href: "/dashboard/apps/file-manager",
      //   icon: ArchiveRestoreIcon,
      //   isNew: true
      // },
      { title: "Api Keys", href: "/dashboard/apps/api-keys", icon: KeyIcon },
      { title: "POS App", href: "/dashboard/apps/pos-system", icon: CookieIcon },
      { title: "Form Designer", href: "/dashboard/pages/form-builder", icon: ComponentIcon },
      { title: "Settings", href: "/dashboard/crm/settings", icon: SettingsIcon },
      //{ title: "Courses", href: "/dashboard/apps/courses", icon: BookAIcon, isComing: true }
    ]
  },
  {
    title: "AI Apps",
    items: [
      { title: "AI Chat", href: "/dashboard/apps/ai-chat", icon: BrainIcon },
      {
        title: "AI Chat V2",
        href: "/dashboard/apps/ai-chat-v2",
        icon: BrainCircuitIcon,
        isNew: true
      },
      {
        title: "Image Generator",
        href: "/dashboard/apps/ai-image-generator",
        icon: ImagesIcon
      },
      {
        title: "Text to Speech",
        href: "/dashboard/apps/text-to-speech",
        icon: SpeechIcon,
        isComing: true
      }
    ]
  },
  {
    title: "Pages",
    items: [
      {
        title: "Profile V2",
        href: "/dashboard/pages/user-profile",
        icon: UserIcon
      },
      {
        title: "Authentication",
        href: "/",
        icon: FingerprintIcon,
        items: [
          { title: "Login v1", href: "/dashboard/login/v1" },
          { title: "Login v2", href: "/dashboard/login/v2" },
          { title: "Register v1", href: "/dashboard/register/v1" },
          { title: "Register v2", href: "/dashboard/register/v2" },
          { title: "Forgot Password", href: "/dashboard/forgot-password" }
        ]
      },
      {
        title: "Error Pages",
        href: "/",
        icon: FingerprintIcon,
        items: [
          { title: "404", href: "/dashboard/pages/error/404" },
          { title: "500", href: "/dashboard/pages/error/500" },
          { title: "403", href: "/dashboard/pages/error/403" }
        ]
      }
    ]
  },
  {
    title: "Others",
    items: [
      {
        title: "Widgets",
        href: "#",
        icon: PuzzleIcon,
        items: [
          { title: "Fitness", href: "/dashboard/widgets/fitness" },
          { title: "E-commerce", href: "/dashboard/widgets/ecommerce" },
          { title: "Analytics", href: "/dashboard/widgets/analytics" }
        ]
      },
    ]
  },
  {
    title: "PLM",
    items: [
      {
        title: "Definitions",
        href: "#",
        icon: Scissors,
        items: [
          { title: "Style Cards", href: "/dashboard/plm/style-cards" },
          { title: "Sample Cards", href: "/dashboard/plm/sample-cards" },
          { title: "Mood Boards", href: "/dashboard/plm/mood-boards" },
          { title: "Swatch Cards", href: "/dashboard/plm/swatch-cards" },
          { title: "Product Cards", href: "/dashboard/plm/product-cards" },
          { title: "Costing Sheets", href: "/dashboard/plm/costing-sheets" },
          { title: "Cost Detail Entry", href: "/dashboard/plm/costing-sheets/cost-detail-entry" },
          { title: "Costing Profit Breakdowns", href: "/dashboard/plm/costing-sheets/profit-breakdown" },
          { title: "PLM Templates", href: "/dashboard/pages/form-builder" },
        ]
      },
      {
        title: "General Definitions",
        href: "#",
        icon: Layers,
        items: [
          { title: "Style Sample Types", href: "/dashboard/plm/general-definitions/style-sample-types" },
          { title: "Design Detail Types", href: "/dashboard/plm/general-definitions/design-detail-types" },
          { title: "Fabric Type Cards", href: "/dashboard/plm/general-definitions/fabric-type-cards" },
          { title: "Measurement Definitions", href: "/dashboard/plm/general-definitions/measurement-definitions" },
          { title: "Measurement Charts", href: "/dashboard/plm/general-definitions/measurement-charts" },
          { title: "Department Cards", href: "/dashboard/plm/general-definitions/department-cards" },
          { title: "Process Cards", href: "/dashboard/plm/general-definitions/process-cards" },
          { title: "Employee Cards", href: "/dashboard/plm/general-definitions/employee-cards" },
          { title: "Resource Cards", href: "/dashboard/plm/general-definitions/resource-cards" },
          { title: "Study Template Cards", href: "/dashboard/plm/general-definitions/study-templates" },
          { title: "Activity Type Cards", href: "/dashboard/plm/general-definitions/activity-type-cards" },
          { title: "Color Cards", href: "/dashboard/plm/general-definitions/color-cards" },
          { title: "Company Cards", href: "/dashboard/plm/general-definitions/company-cards" },
          { title: "Sample Task Types", href: "/dashboard/plm/general-definitions/sample-task-types" },
          { title: "Route Cards", href: "/dashboard/plm/general-definitions/route-cards" },
        ]
      },
      {
        title: "Utilities",
        href: "#",
        icon: Workflow,
        items: [
          { title: "PLM Orders", href: "/dashboard/plm/orders" },
          { title: "PLM Tasks", href: "/dashboard/plm/tasks" },
          { title: "Critical Path Chart", href: "/dashboard/plm/critical-path" },
        ]
      },
      {
        title: "Reports",
        href: "#",
        icon: BarChart3,
        items: [
          { title: "Delayed Task List", href: "/dashboard/plm/reports/delayed-tasks" },
          { title: "Daily Task List", href: "/dashboard/plm/reports/daily-tasks" },
          { title: "Cancelled Task List", href: "/dashboard/plm/reports/cancelled-tasks" },
          { title: "PLM Sample Cost", href: "/dashboard/plm/reports/sample-cost" },
          { title: "PLM Sample History", href: "/dashboard/plm/reports/sample-history" },
          { title: "PLM Analyse Cubes", href: "/dashboard/plm/reports/analyse-cubes" },
        ]
      },
      { title: "Document Management", href: "/dashboard/plm/documents", icon: FolderDotIcon },
    ]
  },
  {
    title: "BPM",
    items: [
      { title: "Task Queue", href: "/dashboard/bpm/task-queue", icon: ClipboardCheckIcon },
      { title: "Request Types", href: "/dashboard/bpm/request-types", icon: ComponentIcon },
    ]
  },
  {
    title: "Docket Management",
    items: [
      {
        title: "Dockets",
        href: "/dashboard/dockets",
        icon: FolderOpen,
        items: [
          { title: "Style Dockets", href: "/dashboard/dockets/style-dockets", icon: Scissors },
          { title: "Sample Dockets", href: "/dashboard/dockets/sample-dockets", icon: FlaskConical },
          { title: "Product Dockets", href: "/dashboard/dockets/product-dockets", icon: Package },
          { title: "Order Dockets", href: "/dashboard/dockets/order-dockets", icon: ClipboardList },
        ],
      },
      {
        title: "Document Control",
        href: "#",
        icon: FileStack,
        items: [
          { title: "Approval Queue", href: "/dashboard/dockets/document-control/approval-queue", icon: CheckSquare },
          { title: "Document Register", href: "/dashboard/dockets/document-control/register", icon: List },
        ],
      },
      {
        title: "Docket Setup",
        href: "#",
        icon: SettingsIcon,
        items: [
          { title: "Document Types", href: "/dashboard/dockets/setup/document-types", icon: Tag },
          { title: "Docket Templates", href: "/dashboard/dockets/setup/docket-templates", icon: LayoutTemplate },
          { title: "Approval Workflows", href: "/dashboard/dockets/setup/approval-workflows", icon: GitBranch },
        ],
      },
      {
        title: "Sharing",
        href: "#",
        icon: Share2,
        items: [
          { title: "Shared Links", href: "/dashboard/dockets/sharing/share-links", icon: Link2 },
          { title: "External Reviews", href: "/dashboard/dockets/sharing/external-review", icon: ExternalLink },
        ],
      },
      {
        title: "Reports",
        href: "#",
        icon: BarChart3,
        items: [
          { title: "Completeness", href: "/dashboard/dockets/reports/completeness", icon: PieChart },
          { title: "Missing Documents", href: "/dashboard/dockets/reports/missing-documents", icon: AlertCircle },
          { title: "Document Expiry", href: "/dashboard/dockets/reports/document-expiry", icon: CalendarX },
        ],
      },
    ],
  },
];

// Administration group - always shown at the end (not company-specific)
const administrationGroup: NavGroup = {
  title: "Administration",
  items: [
    {
      title: "Pricing Plans",
      href: "/dashboard/pages/pricing-plans",
      icon: CreditCardIcon
    },
  ]
};

// Export navItems for backward compatibility with search.tsx
export const navItems: NavGroup[] = defaultNavItems;

export function NavMain() {
  const pathname = usePathname();
  const router = useRouter();
  const { checkPermission } = usePermissionCheck();
  const [customEntityPages, setCustomEntityPages] = React.useState<any[]>([]);
  const [navItems, setNavItems] = React.useState<NavGroup[]>(defaultNavItems);
  const [selectedSidebarItems, setSelectedSidebarItems] = React.useState<string[] | null>(null);
  const [launcherGroupTitle, setLauncherGroupTitle] = React.useState<string | null>(null);

  // Load menu items from API
  React.useEffect(() => {
    const loadMenuItems = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;

        const menuData = await menuItemsApi.getMenuItems(
          user.companyId || undefined,
          user.branchId || undefined
        );

        if (Array.isArray(menuData) && menuData.length > 0) {
          // Transform API response to NavGroup format
          const transformedMenus: NavGroup[] = menuData.map((group: any) => ({
            title: group.title,
            items: group.items.map(transformMenuItem),
          }));
          // Always append Administration group at the end
          setNavItems(filterNavGroups([...transformedMenus, administrationGroup]));
        } else {
          // Fallback to default nav items if API returns empty
          setNavItems(filterNavGroups(defaultNavItems));
        }
      } catch (error) {
        console.error("Error loading menu items:", error);
        // Fallback to default nav items on error
        setNavItems(filterNavGroups(defaultNavItems));
      }
    };

    loadMenuItems();
  }, []);

  // Load per-user sidebar visibility selection (Display settings)
  React.useEffect(() => {
    const loadUserSidebarSelection = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;
        const settings = await settingsApi.getUserSettings(user.id);
        setSelectedSidebarItems(Array.isArray(settings?.sidebarItems) ? settings.sidebarItems : []);
      } catch {
        // If settings cannot be loaded, fall back to showing all items.
        setSelectedSidebarItems(null);
      }
    };
    loadUserSidebarSelection();
  }, []);

  // Load custom entity pages
  React.useEffect(() => {
    const loadCustomEntityPages = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;

        const pages = await customEntityPageApi.getCustomEntityPages(
          user.companyId || undefined,
          user.branchId || undefined
        );
        setCustomEntityPages(Array.isArray(pages) ? pages : []);
      } catch (error) {
        console.error("Error loading custom entity pages:", error);
        setCustomEntityPages([]);
      }
    };

    loadCustomEntityPages();
  }, []);

  const handleLinkClick = async (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Skip permission check for hash links or external links
    if (href === "#" || href.startsWith("http") || href.startsWith("mailto:")) {
      return;
    }

    e.preventDefault();

    try {
      const hasPermission = await checkPermission(href);

      if (hasPermission) {
        navigateOrOpenTab(router, href);
      } else {
        toast.error("You don't have permission to access this resource");
      }
    } catch (error) {
      console.error("Permission check failed:", error);
      toast.error("Failed to verify permissions");
    }
  };

  // Merge custom entity pages into Pages section, apply hidden-item/group
  // rules and the per-user Display Settings selection — identical pipeline to
  // before; only how this data gets rendered (below) has changed.
  const enhancedNavItems = React.useMemo(() => {
    const withCustomPages = navItems.map((nav) => {
      if (nav.title === "Pages") {
        const customEntityItems = customEntityPages
          .filter((page) => page.isActive)
          .map((page) => ({
            title: page.name,
            href: `/dashboard/pages/custom-entities/${page.slug}`,
            icon: ComponentIcon,
          }));

        return {
          ...nav,
          items: [
            ...nav.items,
            ...(customEntityItems.length > 0
              ? [{ title: "Custom Pages", href: "#", icon: ComponentIcon, items: customEntityItems }]
              : []),
          ],
        };
      }
      return nav;
    });
    const filtered = filterNavGroups(withCustomPages);
    return filterNavByUserSelection(filtered, selectedSidebarItems);
  }, [navItems, customEntityPages, selectedSidebarItems]);

  // My Menu is a framework-level favorites shortcut, not a browsable module —
  // pulled out to its own direct sidebar link (it's already a standalone leaf
  // in the menu data, just repositioned in the UI) instead of being buried
  // inside a module launcher.
  const { myMenuItem, moduleGroups } = React.useMemo(() => {
    let myMenu: NavItem | null = null;
    const groups = enhancedNavItems
      .map((nav) => ({
        ...nav,
        items: nav.items.filter((item) => {
          if (item.href === "/dashboard/my-menu") {
            myMenu = item;
            return false;
          }
          return true;
        }),
      }))
      .filter((nav) => nav.items.length > 0);
    return { myMenuItem: myMenu as NavItem | null, moduleGroups: groups };
  }, [enhancedNavItems]);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {myMenuItem && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="hover:text-foreground active:text-foreground hover:bg-[var(--primary)]/10 active:bg-[var(--primary)]/10"
                  isActive={pathname === myMenuItem.href}
                  tooltip={myMenuItem.title}
                  asChild>
                  <Link
                    href={myMenuItem.href}
                    onClick={(e) => handleLinkClick(e, myMenuItem!.href)}
                    className="flex items-center gap-2">
                    {myMenuItem.icon && <myMenuItem.icon />}
                    <span>{myMenuItem.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {moduleGroups.map((nav) => {
              const Icon = findModuleIcon(nav.items);
              return (
                <SidebarMenuItem key={nav.title}>
                  <SidebarMenuButton
                    className="hover:text-foreground active:text-foreground hover:bg-[var(--primary)]/10 active:bg-[var(--primary)]/10"
                    tooltip={nav.title}
                    onClick={() => setLauncherGroupTitle(nav.title)}>
                    {Icon && <Icon />}
                    <span>{nav.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <ModuleLauncher
        groupTitle={launcherGroupTitle}
        open={!!launcherGroupTitle}
        onOpenChange={(open) => {
          if (!open) setLauncherGroupTitle(null);
        }}
      />
    </>
  );
}
