import { generateMeta } from "@/lib/utils";

import CustomDateRangePicker from "@/components/custom-date-range-picker";

import {
  BusinessGlance,
  KpiCards,
  OrderKpiRow,
  QuickActions,
  RecentActivity,
  RecentTransactionsTable,
  SalesOverviewChart,
  TodaysOperations,
  TopProductsChart,
  WelcomeHeader
} from "@/app/dashboard/(auth)/default/components";

export async function generateMetadata() {
  return generateMeta({
    title: "Dashboard",
    description: "Nexus Core Enterprise ERP — sales, purchases, inventory and business overview.",
    canonical: "/default"
  });
}

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <WelcomeHeader />
        <CustomDateRangePicker />
      </div>

      <OrderKpiRow />

      <KpiCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <SalesOverviewChart />
        </div>
        <div className="xl:col-span-4">
          <TopProductsChart />
        </div>
        <div className="space-y-4 xl:col-span-3">
          <QuickActions />
          <RecentActivity />
        </div>
      </div>

      <TodaysOperations />

      <RecentTransactionsTable />

      <BusinessGlance />
    </div>
  );
}
