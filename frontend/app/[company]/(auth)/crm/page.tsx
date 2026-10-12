"use client";

import { useEffect, useState } from "react";
import CustomDateRangePicker from "@/components/custom-date-range-picker";
import { Button } from "@/components/ui/button";
import {
  LeadBySourceCard,
  SalesPipeline,
  LeadsCard,
  TargetCard,
  TotalCustomersCard,
  TotalDeals,
  TotalRevenueCard,
  RecentTasks
} from "@/app/[company]/(auth)/crm/components";
import { entityDataApi, customerApi, orderApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    customers: [],
    leads: [],
    deals: [],
    orders: [],
    tasks: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) return;

      const params = {
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined
      };

      // Fetch all data in parallel
      const [customers, leads, deals, orders] = await Promise.all([
        customerApi.getCustomers(params).catch(() => []),
        entityDataApi.getEntityDataByType('LEAD', params).catch(() => []),
        entityDataApi.getEntityDataByType('DEAL', params).catch(() => []),
        // Orders API doesn't support company/branch params here (auth token scopes it).
        orderApi.getOrders({ limit: 50 }).catch(() => [])
      ]);

      setDashboardData({
        customers: customers || [],
        leads: leads || [],
        deals: deals || [],
        orders: orders || [],
        tasks: [] // Will be populated from Activity or Todo if needed
      });
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Failed to fetch dashboard data", {
        description: error.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">CRM Dashboard</h1>
        <div className="flex items-center space-x-2">
          <CustomDateRangePicker />
          <Button>Download</Button>
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TargetCard 
            deals={dashboardData.deals}
            loading={loading}
          />
          <TotalCustomersCard 
            customers={dashboardData.customers}
            loading={loading}
          />
          <TotalDeals 
            deals={dashboardData.deals}
            loading={loading}
          />
          <TotalRevenueCard 
            deals={dashboardData.deals}
            orders={dashboardData.orders}
            loading={loading}
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <LeadBySourceCard 
            leads={dashboardData.leads}
            loading={loading}
          />
          <RecentTasks 
            tasks={dashboardData.tasks}
            loading={loading}
          />
          <SalesPipeline 
            deals={dashboardData.deals}
            loading={loading}
          />
        </div>
        <LeadsCard 
          leads={dashboardData.leads}
          loading={loading}
        />
      </div>
    </div>
  );
}
