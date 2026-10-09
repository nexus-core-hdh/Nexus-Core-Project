// Placeholder dashboard data.
//
// There is no dashboard/analytics endpoint in the backend yet (no Sales,
// Purchases, Profit, Inventory or Transactions aggregation module exists) —
// confirmed by searching nexuscore-backend/src and frontend/lib/nexuscore-api.ts.
// This module exists so the real API can be wired in later without touching
// any of the presentational components: every shape here (KPI, ChartPoint,
// Product, Transaction, ActivityEvent, GlanceStat) is what a real endpoint
// would return, and every consuming component only reads through these types.

export type Trend = "up" | "down";

export interface Kpi {
  key: string;
  label: string;
  value: string;
  change: string;
  trend: Trend;
  icon: "sales" | "purchases" | "profit" | "inventory";
  spark: number[];
}

export const kpis: Kpi[] = [
  { key: "sales", label: "Total Sales", value: "PKR 24.85M", change: "12.5%", trend: "up", icon: "sales", spark: [8, 11, 9, 13, 15, 14, 18, 17, 21, 24] },
  { key: "purchases", label: "Total Purchases", value: "PKR 18.42M", change: "8.7%", trend: "up", icon: "purchases", spark: [10, 9, 12, 11, 13, 12, 15, 14, 16, 18] },
  { key: "profit", label: "Total Profit", value: "PKR 6.42M", change: "15.3%", trend: "up", icon: "profit", spark: [3, 4, 3.5, 5, 4.5, 6, 5.5, 6.5, 6, 6.4] },
  { key: "inventory", label: "Inventory Value", value: "PKR 52.18M", change: "3.1%", trend: "down", icon: "inventory", spark: [55, 54, 56, 53, 54, 52, 53, 51, 52.5, 52.2] }
];

export interface SalesPoint {
  date: string;
  thisMonth: number;
  lastMonth: number;
}

export const salesOverview: SalesPoint[] = [
  { date: "May 01", thisMonth: 0.3, lastMonth: 0.2 },
  { date: "May 08", thisMonth: 5.1, lastMonth: 3.8 },
  { date: "May 15", thisMonth: 9.4, lastMonth: 8.6 },
  { date: "May 22", thisMonth: 14.8, lastMonth: 12.1 },
  { date: "May 31", thisMonth: 24.85, lastMonth: 19.2 }
];

export interface TopProduct {
  name: string;
  share: number;
  amount: string;
  color: string;
}

export const topProducts: TopProduct[] = [
  { name: "Product A", share: 35, amount: "PKR 8.70M", color: "var(--chart-1)" },
  { name: "Product B", share: 25, amount: "PKR 6.21M", color: "var(--chart-2)" },
  { name: "Product C", share: 20, amount: "PKR 4.97M", color: "var(--chart-3)" },
  { name: "Product D", share: 12, amount: "PKR 2.98M", color: "var(--chart-4)" },
  { name: "Others", share: 8, amount: "PKR 1.99M", color: "var(--chart-5)" }
];

export interface Transaction {
  id: string;
  type: "Sale" | "Purchase" | "Payment" | "Receipt";
  reference: string;
  party: string;
  date: string;
  amount: number;
  status: "Completed" | "Pending" | "Failed";
}

export const recentTransactions: Transaction[] = [
  { id: "1", type: "Sale", reference: "SO-000312", party: "ABC Traders", date: "May 31, 2025", amount: 250000, status: "Completed" },
  { id: "2", type: "Purchase", reference: "PO-000231", party: "Tech Distributors", date: "May 31, 2025", amount: 180000, status: "Completed" },
  { id: "3", type: "Payment", reference: "RCPT-000881", party: "ABC Traders", date: "May 30, 2025", amount: 250000, status: "Completed" },
  { id: "4", type: "Sale", reference: "SO-000311", party: "Zain Electronics", date: "May 30, 2025", amount: 95500, status: "Pending" },
  { id: "5", type: "Purchase", reference: "PO-000230", party: "Global Supplies", date: "May 29, 2025", amount: 320000, status: "Completed" }
];

export interface ActivityEvent {
  id: string;
  icon: "sale" | "purchase" | "payment" | "item" | "stock";
  title: string;
  meta: string;
  time: string;
}

export const recentActivity: ActivityEvent[] = [
  { id: "1", icon: "sale", title: "Sale Order SO-000312 created", meta: "by Ali Raza", time: "2m ago" },
  { id: "2", icon: "purchase", title: "Purchase Order PO-000231 created", meta: "by Sana Khan", time: "15m ago" },
  { id: "3", icon: "payment", title: "Payment of PKR 250,000 received", meta: "from ABC Traders", time: "1h ago" },
  { id: "4", icon: "item", title: "New Item Wireless Mouse added", meta: "by Admin User", time: "2h ago" },
  { id: "5", icon: "stock", title: "Stock Adjustment completed", meta: "by Bilal Ahmed", time: "3h ago" }
];

export interface GlanceStat {
  key: string;
  label: string;
  value: string;
  sub: string;
}

export const glanceStats: GlanceStat[] = [
  { key: "receivables", label: "Outstanding Receivables", value: "PKR 8.65M", sub: "12 Invoices" },
  { key: "payables", label: "Outstanding Payables", value: "PKR 6.27M", sub: "8 Bills" },
  { key: "stock", label: "Stock Items", value: "1,245", sub: "Across 15 Warehouses" },
  { key: "users", label: "Active Users", value: "28", sub: "Online Now" }
];
