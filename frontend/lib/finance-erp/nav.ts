import type { NavGroup } from "@/components/layout/sidebar/nav-main";
import {
  LayoutDashboardIcon, ClipboardList, ArrowDownToLine, ArrowUpFromLine,
  ShoppingCart, FileText, Receipt, FileMinus, Wallet, BookUser, HandCoins, Percent,
  ClipboardCheck, FileSpreadsheet, FileX2, Landmark, Users2, ScrollText, ReceiptText,
  Boxes, Tags, CalendarClock, ArrowRightLeft, TrendingUp, Wrench,
  BookOpen, BookText, Scale, Building2, Network, LineChart, PiggyBank, Waves, FileBarChart,
  UsersRound, Building, SlidersHorizontal, ListOrdered, GitBranch,
} from "lucide-react";

const BASE = "/dashboard/finance-erp";

/** The complete Finance module navigation tree (spec section 11). Merged additively into the
 *  sidebar's nav groups in nav-main.tsx — see mergeFinanceErpModule — so it appears regardless of
 *  what the backend's own menu-items API returns (this module has no backend entries yet). */
export const FINANCE_ERP_NAV_GROUP: NavGroup = {
  title: "Finance",
  items: [
    { title: "Dashboard", href: BASE, icon: LayoutDashboardIcon },
    {
      title: "Inventory Management",
      href: "#",
      icon: Boxes,
      items: [
        { title: "Demand", href: `${BASE}/inventory/demand-list`, icon: ClipboardList },
        { title: "Receipt", href: `${BASE}/inventory/receipt-list`, icon: ArrowDownToLine },
        { title: "Issuance", href: `${BASE}/inventory/issuance-list`, icon: ArrowUpFromLine },
      ],
    },
    {
      title: "Payable",
      href: "#",
      icon: HandCoins,
      items: [
        { title: "Purchase Order", href: `${BASE}/payable/purchase-orders-list`, icon: ShoppingCart },
        { title: "Purchase Invoice / GRN Matching", href: `${BASE}/payable/purchase-invoices-list`, icon: FileText },
        { title: "Vendor Bills", href: `${BASE}/payable/vendor-bills-list`, icon: Receipt },
        { title: "Debit Note", href: `${BASE}/payable/debit-notes-list`, icon: FileMinus },
        { title: "Vendor Payments", href: `${BASE}/payable/vendor-payments-list`, icon: Wallet },
        { title: "Vendor Ledger", href: `${BASE}/payable/vendor-ledger`, icon: BookUser },
        { title: "Advance to Suppliers", href: `${BASE}/payable/advances`, icon: HandCoins },
        { title: "WHT on Purchases", href: `${BASE}/payable/wht`, icon: Percent },
      ],
    },
    {
      title: "Receivable",
      href: "#",
      icon: TrendingUp,
      items: [
        { title: "Sales Order", href: `${BASE}/receivable/sales-orders-list`, icon: ClipboardCheck },
        { title: "Sales Invoice", href: `${BASE}/receivable/sales-invoices-list`, icon: FileSpreadsheet },
        { title: "Credit Note", href: `${BASE}/receivable/credit-notes-list`, icon: FileX2 },
        { title: "Customer Payments / Receipts", href: `${BASE}/receivable/customer-receipts-list`, icon: Landmark },
        { title: "Customer Ledger", href: `${BASE}/receivable/customer-ledger`, icon: Users2 },
        { title: "Aging Report", href: `${BASE}/receivable/aging-report`, icon: CalendarClock },
        { title: "Advance from Customers", href: `${BASE}/receivable/advances`, icon: PiggyBank },
        { title: "Sales Tax Invoice", href: `${BASE}/receivable/sales-tax-invoice-list`, icon: ReceiptText },
      ],
    },
    {
      title: "Fixed Assets",
      href: "#",
      icon: Building2,
      items: [
        { title: "Asset Register", href: `${BASE}/fixed-assets/register-list`, icon: ScrollText },
        { title: "Asset Categories", href: `${BASE}/fixed-assets/categories`, icon: Tags },
        { title: "Depreciation Schedule", href: `${BASE}/fixed-assets/depreciation-schedule`, icon: LineChart },
        { title: "Asset Transfer / Disposal", href: `${BASE}/fixed-assets/transfer-disposal`, icon: ArrowRightLeft },
        { title: "Asset Revaluation", href: `${BASE}/fixed-assets/revaluation`, icon: Scale },
        { title: "Maintenance Log", href: `${BASE}/fixed-assets/maintenance-log`, icon: Wrench },
      ],
    },
    {
      title: "General Ledger",
      href: "#",
      icon: BookOpen,
      items: [
        { title: "Chart of Accounts", href: `${BASE}/general-ledger/chart-of-accounts`, icon: Network },
        { title: "Journal Entries", href: `${BASE}/general-ledger/journal-entries-list`, icon: BookText },
        { title: "Ledger / Trial Balance", href: `${BASE}/general-ledger/ledger-trial-balance`, icon: Scale },
        { title: "Bank Reconciliation", href: `${BASE}/general-ledger/bank-reconciliation`, icon: Waves },
        { title: "Cost Centers", href: `${BASE}/general-ledger/cost-centers`, icon: GitBranch },
        {
          title: "Financial Statements",
          href: "#",
          icon: FileBarChart,
          items: [
            { title: "Profit & Loss", href: `${BASE}/general-ledger/financial-statements/profit-loss` },
            { title: "Balance Sheet", href: `${BASE}/general-ledger/financial-statements/balance-sheet` },
            { title: "Cash Flow", href: `${BASE}/general-ledger/financial-statements/cash-flow` },
          ],
        },
        {
          title: "Tax Reports",
          href: "#",
          icon: Percent,
          items: [
            { title: "Sales Tax", href: `${BASE}/general-ledger/tax-reports/sales-tax` },
            { title: "WHT", href: `${BASE}/general-ledger/tax-reports/wht` },
          ],
        },
      ],
    },
    {
      title: "Finance Settings",
      href: "#",
      icon: SlidersHorizontal,
      items: [
        { title: "Users & Roles", href: `${BASE}/settings/users-roles`, icon: UsersRound },
        { title: "Company Profile / Multi-Branch", href: `${BASE}/settings/company-profile`, icon: Building },
        { title: "Tax Configuration", href: `${BASE}/settings/tax-configuration`, icon: Percent },
        { title: "Numbering Series", href: `${BASE}/settings/numbering-series`, icon: ListOrdered },
        { title: "Approval Workflows", href: `${BASE}/settings/approval-workflows`, icon: GitBranch },
      ],
    },
  ],
};

/** Additive merge, same pattern as mergeAdministrationExtras in nav-main.tsx: folds the complete
 *  Finance ERP tree into the sidebar's "Finance" group. Runs on both the API-loaded menu tree and
 *  the static defaultNavItems fallback, since the backend has no menu-items rows for most of this
 *  module yet (frontend-only phase — see spec section 20).
 *
 *  IMPORTANT: this appends into an existing "Finance" group rather than skipping when one is
 *  found. The live backend already seeds a real "Finance" menu group (confirmed via `GET
 *  /menu-items`, independent of the smaller placeholder in prisma/seed.ts which is stale/unused
 *  here) containing 5 legacy items — Finance Overview (/dashboard/finance), Payment Dashboard
 *  (/dashboard/payment), Transactions, Customer Payments and Supplier Payments
 *  (/dashboard/payment/*). An earlier version of this function returned early whenever ANY group
 *  named "Finance" existed, which silently dropped this entire 40+ screen tree for every real
 *  (DB-backed) menu load — the module only ever appeared when the backend menu API returned
 *  nothing at all, which is never true for a real logged-in session. Appending instead of
 *  skipping, and de-duplicating by href (favoring our own tree, which happens to have no href
 *  collisions with those 5 legacy items), fixes that while keeping every existing item intact
 *  and already correctly labeled — no relabeling needed. */
export function mergeFinanceErpModule(groups: NavGroup[]): NavGroup[] {
  const existing = groups.find((g) => g.title === "Finance");
  if (!existing) return [...groups, FINANCE_ERP_NAV_GROUP];

  const existingHrefs = new Set(existing.items.map((i) => i.href));
  const newItems = FINANCE_ERP_NAV_GROUP.items.filter((i) => !existingHrefs.has(i.href));

  // Our own items lead (so the module button's icon — findModuleIcon takes the first icon found
  // in the tree — resolves to our Dashboard icon, not whatever a legacy item happens to carry);
  // the pre-existing legacy items are appended after, unchanged.
  return groups.map((g) =>
    g.title === "Finance" ? { ...g, items: [...newItems, ...existing.items] } : g,
  );
}
