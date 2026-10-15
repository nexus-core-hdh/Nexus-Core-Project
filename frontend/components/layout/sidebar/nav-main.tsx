"use client";

import * as React from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
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
  FileClock,
  FileSignature,
  Landmark,
  Receipt,
  Scaling,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import Link from "@/components/app-link";
import { usePathname, useRouter } from "@/lib/app-navigation";
import { DashboardIcon } from "@radix-ui/react-icons";
import { usePermissionCheck } from "@/hooks/use-permission";
import { toast } from "sonner";
import { menuItemsApi, settingsApi } from "@/lib/api";
import { customEntityPageApi } from "@/lib/nexuscore-api";
import { MENU_CHANGED_EVENT } from "@/lib/workspace/menu-events";
import { useThemeConfig } from "@/components/active-theme";
import { getCurrentUser } from "@/lib/auth";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { ModuleLauncher } from "./module-launcher";
import { mergeFinanceErpModule } from "@/lib/finance-erp/nav";

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
  "/apps/api-keys",
  "/pages/user-profile",
  "/project-management",
  "/payment",
  "/apps/pos-system",
  "/plm/documents",
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
  FileClock: FileClock,
  FileSignature: FileSignature,
  Landmark: Landmark,
  Receipt: Receipt,
  Scaling: Scaling,
  ScrollText: ScrollText,
  SlidersHorizontal: SlidersHorizontal,
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
        href: "/default",
        icon: ChartPieIcon
      },
      { title: "My Menu", href: "/module-map", icon: Star },
      // {
      //   title: "Website Analytics",
      //   href: "/website-analytics",
      //   icon: GaugeIcon
      // },
      // {
      //   title: "File Manager",
      //   href: "/file-manager",
      //   icon: FolderIcon
      // },
      // { title: "Crypto", href: "/crypto", icon: WalletMinimalIcon },
      // { title: "Academy/School", href: "/academy", icon: GraduationCapIcon },
      // { title: "Hospital Management", href: "/hospital-management", icon: ActivityIcon },
      // {
      //   title: "Hotel Dashboard",
      //   href: "/hotel",
      //   icon: Building2Icon,
      //   items: [
      //     { title: "Dashboard", href: "/hotel" },
      //     { title: "Bookings", href: "/hotel/bookings" }
      //   ]
      // },
      // {
      //   title: "Finance Dashboard",
      //   href: "/finance",
      //   icon: WalletMinimalIcon
      // },
    ]
  },
  {
    title: "Collaboration",
    items: [
      {
        title: "Messenger",
        href: "/apps/chat",
        icon: MessageSquareIcon
      },
      {
        title: "Feed",
        href: "/collaboration/feed",
        icon: FolderDotIcon
      },
      {
        title: "Collabs",
        href: "/collaboration/collabs",
        icon: ClipboardMinusIcon
      },
      {
        title: "Online Documents",
        href: "/collaboration/documents",
        icon: ComponentIcon
      },
      {
        title:"File Manager",
        href: "/file-manager",
        icon: FolderIcon,
        items: [
          {
            title: "Dashboard",
            href: "/file-manager",
            icon: FolderIcon,
          },
          {
            title: "File Manager",
            href: "/apps/file-manager",
            icon: ArchiveRestoreIcon,
          },
        ]
      },
      {
        title:"Work Groups",
        href:"/collaboration/work-groups",
        icon: GroupIcon
      },
      {
        title:"Boards",
        href:"/collaboration/boards",
        icon: LayoutDashboardIcon
      }
    ]
  },
  {
    title: "Apps",
    items: [
      {
        title: "Users",
        href: "/pages/users",
        icon: UsersIcon
      },
      {
        title: "Automation",
        href: "/pages/business-processes",
        icon: Workflow
      },
      { title: "Notes", href: "/apps/notes", icon: StickyNoteIcon, isDataBadge: "8" },
      // { title: "Chats", href: "/apps/chat", icon: MessageSquareIcon, isDataBadge: "5" },
      { title: "Mail", href: "/apps/mail", icon: MailIcon },
      {
        title: "Todo List App",
        href: "/apps/todo-list-app",
        icon: SquareCheckIcon
      },
      // {
      //   title: "Tasks",
      //   href: "/apps/tasks",
      //   icon: ClipboardCheckIcon
      // },
      { title: "Calendar", href: "/apps/calendar", icon: CalendarIcon },
      // {
      //   title: "File Manager",
      //   href: "/apps/file-manager",
      //   icon: ArchiveRestoreIcon,
      //   isNew: true
      // },
      { title: "Form Designer", href: "/pages/form-builder", icon: ComponentIcon },
      //{ title: "Courses", href: "/apps/courses", icon: BookAIcon, isComing: true }
    ]
  },
  {
    title: "AI Apps",
    items: [
      { title: "AI Chat", href: "/apps/ai-chat", icon: BrainIcon },
      {
        title: "AI Chat V2",
        href: "/apps/ai-chat-v2",
        icon: BrainCircuitIcon,
        isNew: true
      },
      {
        title: "Image Generator",
        href: "/apps/ai-image-generator",
        icon: ImagesIcon
      },
      {
        title: "Text to Speech",
        href: "/apps/text-to-speech",
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
        href: "/pages/user-profile",
        icon: UserIcon
      },
      {
        title: "Authentication",
        href: "/",
        icon: FingerprintIcon,
        items: [
          { title: "Login v1", href: "/login/v1" },
          { title: "Login v2", href: "/login/v2" },
          { title: "Register v1", href: "/register/v1" },
          { title: "Register v2", href: "/register/v2" },
          { title: "Forgot Password", href: "/forgot-password" }
        ]
      },
      {
        title: "Error Pages",
        href: "/",
        icon: FingerprintIcon,
        items: [
          { title: "404", href: "/error/404" },
          { title: "500", href: "/error/500" },
          { title: "403", href: "/pages/error/403" }
        ]
      }
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
          { title: "Style Cards", href: "/plm/style-cards" },
          { title: "Sample Cards", href: "/plm/sample-cards-list" },
          { title: "Mood Boards", href: "/plm/mood-boards" },
          { title: "Swatch Cards", href: "/plm/swatch-cards" },
          { title: "Product Cards", href: "/plm/product-cards" },
          { title: "Costing Sheets", href: "/plm/costing-sheets" },
          { title: "Cost Detail Entry", href: "/plm/costing-sheets/cost-detail-entry" },
          { title: "Costing Profit Breakdowns", href: "/plm/costing-sheets/profit-breakdown" },
          { title: "PLM Templates", href: "/pages/form-builder" },
        ]
      },
      {
        title: "General Definitions",
        href: "#",
        icon: Layers,
        items: [
          { title: "Style Sample Types", href: "/plm/general-definitions/style-sample-types" },
          { title: "Design Detail Types", href: "/plm/general-definitions/design-detail-types" },
          { title: "Fabric Type Cards", href: "/plm/general-definitions/fabric-type-cards" },
          { title: "Measurement Definitions", href: "/plm/general-definitions/measurement-definitions" },
          { title: "Measurement Charts", href: "/plm/general-definitions/measurement-charts" },
          { title: "Department Cards", href: "/plm/general-definitions/department-cards" },
          { title: "Process Cards", href: "/plm/general-definitions/process-cards" },
          { title: "Employee Cards", href: "/plm/general-definitions/employee-cards" },
          { title: "Resource Cards", href: "/plm/general-definitions/resource-cards" },
          { title: "Study Template Cards", href: "/plm/general-definitions/study-templates" },
          { title: "Activity Type Cards", href: "/plm/general-definitions/activity-type-cards" },
          { title: "Color Cards", href: "/plm/general-definitions/color-cards" },
          { title: "Brand Cards", href: "/plm/general-definitions/brand-cards" },
          { title: "Season Cards", href: "/plm/general-definitions/season-cards" },
          { title: "Gender Cards", href: "/plm/general-definitions/gender-cards" },
          { title: "Size Cards", href: "/plm/general-definitions/size-cards" },
          { title: "Company Cards", href: "/plm/general-definitions/company-cards" },
          { title: "Sample Task Types", href: "/plm/general-definitions/sample-task-types" },
          { title: "Route Definitions", href: "/plm/general-definitions/route-cards" },
        ]
      },
      {
        title: "Utilities",
        href: "#",
        icon: Workflow,
        items: [
          { title: "PLM Orders", href: "/plm/orders" },
          { title: "PLM Tasks", href: "/plm/tasks" },
          { title: "Critical Path Chart", href: "/plm/critical-path" },
        ]
      },
      {
        title: "Reports",
        href: "#",
        icon: BarChart3,
        items: [
          { title: "Delayed Task List", href: "/plm/reports/delayed-tasks" },
          { title: "Daily Task List", href: "/plm/reports/daily-tasks" },
          { title: "Cancelled Task List", href: "/plm/reports/cancelled-tasks" },
          { title: "PLM Sample Cost", href: "/plm/reports/sample-cost" },
          { title: "PLM Sample History", href: "/plm/reports/sample-history" },
          { title: "PLM Analyse Cubes", href: "/plm/reports/analyse-cubes" },
        ]
      },
      { title: "Document Management", href: "/plm/documents", icon: FolderDotIcon },
    ]
  },
  {
    title: "BPM",
    items: [
      { title: "Task Queue", href: "/bpm/task-queue", icon: ClipboardCheckIcon },
      { title: "Request Types", href: "/bpm/request-types", icon: ComponentIcon },
    ]
  },
  {
    title: "Docket Management",
    items: [
      {
        title: "Dockets",
        href: "/dockets",
        icon: FolderOpen,
        items: [
          { title: "Style Dockets", href: "/dockets/style-dockets", icon: Scissors },
          { title: "Sample Dockets", href: "/dockets/sample-dockets", icon: FlaskConical },
          { title: "Product Dockets", href: "/dockets/product-dockets", icon: Package },
          { title: "Order Dockets", href: "/dockets/order-dockets", icon: ClipboardList },
        ],
      },
      {
        title: "Document Control",
        href: "#",
        icon: FileStack,
        items: [
          { title: "Approval Queue", href: "/dockets/document-control/approval-queue", icon: CheckSquare },
          { title: "Document Register", href: "/dockets/document-control/register", icon: List },
        ],
      },
      {
        title: "Docket Setup",
        href: "#",
        icon: SettingsIcon,
        items: [
          { title: "Document Types", href: "/dockets/setup/document-types", icon: Tag },
          { title: "Docket Templates", href: "/dockets/setup/docket-templates", icon: LayoutTemplate },
          { title: "Approval Workflows", href: "/dockets/setup/approval-workflows", icon: GitBranch },
        ],
      },
      {
        title: "Sharing",
        href: "#",
        icon: Share2,
        items: [
          { title: "Shared Links", href: "/dockets/sharing/share-links", icon: Link2 },
          { title: "External Reviews", href: "/dockets/sharing/external-review", icon: ExternalLink },
        ],
      },
      {
        title: "Reports",
        href: "#",
        icon: BarChart3,
        items: [
          { title: "Completeness", href: "/dockets/reports/completeness", icon: PieChart },
          { title: "Missing Documents", href: "/dockets/reports/missing-documents", icon: AlertCircle },
          { title: "Document Expiry", href: "/dockets/reports/document-expiry", icon: CalendarX },
        ],
      },
    ],
  },
];

// Administration extras - not company-specific, so not stored as live menu-items data.
// Merged into the API's own "Administration" group (added by the menu-items IA reorg) rather
// than appended as a second same-titled group, which used to render as two separate
// "Administration" buttons back when the API had no group of that name yet.
const administrationExtraItems: NavItem[] = [
  {
    title: "Pricing Plans",
    href: "/pages/pricing-plans",
    icon: CreditCardIcon
  },
  // Not a second Decimal Parameters screen — the actual config UI still lives at Legacy ERP ->
  // General Settings -> Screen Parameters (click its "Decimal" tab); this is just an
  // easier-to-find shortcut. Deliberately no ?tab=decimal query string here even though the page
  // supports it: screen-index-store's own permission-path normalizer (normalizeResourcePath)
  // doesn't strip query strings, so a query-bearing href would silently fail every non-admin
  // user's permission check for this row and vanish from the launcher for them.
  {
    title: "Decimal Parameters",
    href: "/legacy-erp/general-settings/screen-parameters",
    icon: Sliders,
  },
];

// Merge the Administration extras into the API's own "Administration" group if it already
// provided one, instead of appending a second same-titled group (which used to render as a
// duplicate sidebar button). Exported so screen-index-store.ts's own raw-menu load can apply the
// EXACT same merge — without this, the sidebar's "Administration" button (built from this
// component's own state, extras included) and the Module Launcher/Global Screen Search it opens
// (built from screen-index-store's independently-fetched groups, extras NOT included) silently
// disagreed: the button showed "Decimal Parameters"/"Pricing Plans", but searching for them in
// the launcher always found nothing, since that store never ran this merge at all.
export function mergeAdministrationExtras(transformedMenus: NavGroup[]): NavGroup[] {
  const hasAdminGroup = transformedMenus.some((g) => g.title === "Administration");
  return hasAdminGroup
    ? transformedMenus.map((g) =>
        g.title === "Administration" ? { ...g, items: [...g.items, ...administrationExtraItems] } : g
      )
    : [...transformedMenus, { title: "Administration", items: administrationExtraItems }];
}

// Export navItems for backward compatibility with search.tsx
export const navItems: NavGroup[] = defaultNavItems;

export function NavMain() {
  const themeConfig = useThemeConfig();
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
          setNavItems(filterNavGroups(mergeAdministrationExtras(transformedMenus)));
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
    // Re-fetch when menu items change at runtime (see notifyMenuChanged).
    window.addEventListener(MENU_CHANGED_EVENT, loadMenuItems);
    return () => window.removeEventListener(MENU_CHANGED_EVENT, loadMenuItems);
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
    // Skip permission check for hash links, external links, and the Finance module — that
    // module is frontend-only mock data for now (spec: no backend changes in this phase), so the
    // backend's real permission API has no rows for it yet and would otherwise deny everyone but
    // admins. Finance ships its own local mock permission layer under Settings > Users & Roles.
    if (href === "#" || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("/finance-erp")) {
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
            href: `/pages/custom-entities/${page.slug}`,
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
    // Finance ERP has no backend menu-items rows of its own yet (frontend-only phase) — merged
    // in after filtering so its items are never subject to HIDDEN_ITEM_HREFS/TITLES (that list
    // predates this module and targets unrelated template screens, not Finance's own routes).
    const withFinanceErp = mergeFinanceErpModule(filtered);
    return filterNavByUserSelection(withFinanceErp, selectedSidebarItems);
  }, [navItems, customEntityPages, selectedSidebarItems]);

  // Whether `pathname` falls anywhere inside a group's item tree — used only to give the
  // module trigger button (which opens the ModuleLauncher dialog, it never navigates directly)
  // a visible "you are in here" active state. Prefix-matched (not exact) so a dynamic detail
  // route like /plm/style-cards/[id] still lights up "PLM" for its list screen's href.
  // Returns the length of the longest href in the tree that matches `pathname` (0 = none), so
  // when several groups match (a shared screen, or one group's href being a prefix of another
  // group's), only the group with the most specific match is marked active.
  const groupMatchLength = React.useCallback((items: NavItem[]): number => {
    let best = 0;
    for (const item of items) {
      if (item.href && item.href !== "#") {
        const itemPath = item.href.split("?")[0];
        if (pathname === itemPath || pathname.startsWith(itemPath + "/")) {
          best = Math.max(best, itemPath.length);
        }
      }
      if (item.items?.length) best = Math.max(best, groupMatchLength(item.items));
    }
    return best;
  }, [pathname]);

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
          if (item.href === "/module-map") {
            myMenu = item;
            return false;
          }
          return true;
        }),
      }))
      .filter((nav) => nav.items.length > 0);
    return { myMenuItem: myMenu as NavItem | null, moduleGroups: groups };
  }, [enhancedNavItems]);

  // The single module group that owns the current route (first one wins on a tie).
  const activeGroupTitle = React.useMemo(() => {
    if (myMenuItem && pathname === myMenuItem.href) return null;
    let bestTitle: string | null = null;
    let bestLen = 0;
    for (const nav of moduleGroups) {
      const len = groupMatchLength(nav.items);
      if (len > bestLen) {
        bestLen = len;
        bestTitle = nav.title;
      }
    }
    return bestTitle;
  }, [moduleGroups, myMenuItem, pathname, groupMatchLength]);

  // Controlled per-module accent palette — restrained (icon tint + active fill/bar only, never
  // applied to individual screens/children) — used by the default theme only. With a Theme
  // Customizer preset active, every module uses the preset's own --sidebar-primary instead
  // (ACCENT_PRESET), so changing the preset visibly recolors the rail. Each entry is a
  // complete, literal className string (not assembled from fragments at runtime) so Tailwind's
  // build-time scanner can actually see and generate these variant-prefixed utilities.
  const ACCENT_INDIGO =
    "data-[active=true]:bg-indigo-400/12 data-[active=true]:before:bg-indigo-400 data-[active=true]:[&>svg]:text-indigo-400 [&>svg]:text-indigo-400/55";
  const ACCENT_EMERALD =
    "data-[active=true]:bg-emerald-400/12 data-[active=true]:before:bg-emerald-400 data-[active=true]:[&>svg]:text-emerald-400 [&>svg]:text-emerald-400/55";
  const ACCENT_ORANGE =
    "data-[active=true]:bg-orange-400/12 data-[active=true]:before:bg-orange-400 data-[active=true]:[&>svg]:text-orange-400 [&>svg]:text-orange-400/55";
  const ACCENT_SKY =
    "data-[active=true]:bg-sky-400/12 data-[active=true]:before:bg-sky-400 data-[active=true]:[&>svg]:text-sky-400 [&>svg]:text-sky-400/55";
  const ACCENT_ROSE =
    "data-[active=true]:bg-rose-400/12 data-[active=true]:before:bg-rose-400 data-[active=true]:[&>svg]:text-rose-400 [&>svg]:text-rose-400/55";
  const ACCENT_DEFAULT =
    "data-[active=true]:bg-sidebar-primary/12 data-[active=true]:before:bg-sidebar-primary data-[active=true]:[&>svg]:text-sidebar-primary [&>svg]:text-sidebar-foreground/55";
  const ACCENT_PRESET =
    "data-[active=true]:bg-sidebar-primary/15 data-[active=true]:before:bg-sidebar-primary data-[active=true]:[&>svg]:text-sidebar-primary [&>svg]:text-sidebar-primary/70";
  const presetActive = themeConfig.theme.preset !== "default";

  const MODULE_ACCENT: Record<string, string> = {
    Dashboard: ACCENT_INDIGO,
    PLM: ACCENT_INDIGO,
    CRM: ACCENT_EMERALD,
    Finance: ACCENT_EMERALD,
    Sales: ACCENT_ORANGE,
    Production: ACCENT_ORANGE,
    "Legacy ERP": ACCENT_SKY,
    Inventory: ACCENT_SKY,
    Logistics: ACCENT_SKY,
    Quality: ACCENT_ROSE,
  };

  // Shared button treatment: quiet by default, a soft brand-tinted wash on hover, and — only
  // for the true active row — a restrained tinted fill plus a slim left accent bar (::before)
  // so the active module reads clearly at a glance, without a glow or a gradient block.
  const moduleButtonClass = (title?: string) =>
    cn(
      "relative text-sidebar-foreground/75 transition-colors duration-150",
      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      "data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground",
      "data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0",
      "data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full",
      "[&>svg]:transition-colors [&>svg]:duration-150",
      presetActive ? ACCENT_PRESET : (title && MODULE_ACCENT[title]) || ACCENT_DEFAULT
    );

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {myMenuItem && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={moduleButtonClass()}
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

            <SidebarSeparator className="mx-0 my-1.5" />

            {moduleGroups.map((nav, index) => {
              const Icon = findModuleIcon(nav.items);
              // One quiet, unlabeled break before the trailing systemic/admin group — enough to
              // separate "business modules" from "system" without adding a text label that would
              // crowd an already dense module list (mirrors the My Menu / modules split above).
              const isSystemGroup = nav.title === "Administration";
              const prevIsSystemGroup = index > 0 && moduleGroups[index - 1].title === "Administration";
              return (
                <React.Fragment key={nav.title}>
                  {isSystemGroup && !prevIsSystemGroup && <SidebarSeparator className="mx-0 my-1.5" />}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={moduleButtonClass(nav.title)}
                      isActive={nav.title === activeGroupTitle}
                      tooltip={nav.title}
                      onClick={() => setLauncherGroupTitle(nav.title)}>
                      {Icon && <Icon />}
                      <span>{nav.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </React.Fragment>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <ModuleLauncher
        groupTitle={launcherGroupTitle}
        icon={findModuleIcon(moduleGroups.find((g) => g.title === launcherGroupTitle)?.items ?? [])}
        open={!!launcherGroupTitle}
        onOpenChange={(open) => {
          if (!open) setLauncherGroupTitle(null);
        }}
      />
    </>
  );
}
