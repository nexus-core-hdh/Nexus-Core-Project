"use client";

import { Wallet, HandCoins, Landmark, FileText, AlertTriangle, TrendingUp, TrendingDown, Percent, Banknote, ReceiptText } from "lucide-react";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { KPIS } from "@/lib/finance-erp/dashboard/mock";
import {
  RevenueVsExpensesChart, ReceivablesVsPayablesChart, CashFlowTrendChart,
  MonthlySalesChart, MonthlyPurchasesChart, AgingDistributionChart,
} from "./components/charts";
import {
  RecentSalesInvoicesWidget, RecentPurchaseInvoicesWidget, PendingPaymentsWidget,
  PendingReceiptsWidget, OverdueInvoicesWidget, PendingApprovalsWidget, RecentJournalEntriesWidget,
} from "./components/widgets";

export default function FinanceDashboardPage() {
  const kpis: SummaryCardItem[] = [
    { label: "Total Receivables", value: KPIS.totalReceivables, icon: Landmark, tone: "success" },
    { label: "Total Payables", value: KPIS.totalPayables, icon: HandCoins, tone: "warning" },
    { label: "Cash & Bank Balance", value: KPIS.cashAndBank, icon: Wallet, tone: "default" },
    { label: "Outstanding Invoices", value: KPIS.outstandingInvoices, isCurrency: false, icon: FileText, tone: "default" },
    { label: "Overdue Receivables", value: KPIS.overdueReceivables, icon: AlertTriangle, tone: "danger" },
    { label: "Overdue Payables", value: KPIS.overduePayables, icon: AlertTriangle, tone: "danger" },
    { label: "Current Month Revenue", value: KPIS.currentMonthRevenue, icon: TrendingUp, tone: "success" },
    { label: "Current Month Expenses", value: KPIS.currentMonthExpenses, icon: TrendingDown, tone: "warning" },
    { label: "Net Profit", value: KPIS.netProfit, icon: Banknote, tone: "success" },
    { label: "Tax Payable", value: KPIS.taxPayable, icon: Percent, tone: "warning" },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 lg:p-8">
      <ModuleHeader
        icon={ReceiptText}
        size="lg"
        title="Finance Dashboard"
        subtitle="Company-wide financial position — Payable, Receivable, Fixed Assets & General Ledger at a glance"
      />

      <SummaryCards items={kpis} className="lg:grid-cols-5" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RevenueVsExpensesChart />
        <ReceivablesVsPayablesChart />
        <CashFlowTrendChart />
        <AgingDistributionChart />
        <MonthlySalesChart />
        <MonthlyPurchasesChart />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentSalesInvoicesWidget />
        <RecentPurchaseInvoicesWidget />
        <PendingPaymentsWidget />
        <PendingReceiptsWidget />
        <OverdueInvoicesWidget />
        <PendingApprovalsWidget />
        <RecentJournalEntriesWidget />
      </div>
    </div>
  );
}
