"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import {
  EcommerceBestSellingProductsCard,
  EcommerceCustomerReviewsCard,
  EcommerceNewCustomersCard,
  EcommerceRecentOrdersCard,
  EcommerceReturnRateCard,
  EcommerceRevenueCard,
  EcommerceSalesByLocationCard,
  EcommerceSalesCard,
  EcommerceTotalRevenueCard,
  EcommerceVisitBySourceCard,
  EcommerceWelcomeCard
} from "@/app/[company]/(auth)/ecommerce/components";
import CustomDateRangePicker from "@/components/custom-date-range-picker";
import { Download } from "lucide-react";
import StatCards from "@/app/[company]/(auth)/ecommerce/components/stat-cards";
import { orderApi, productApi, customerApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    fetchEcommerceData();
  }, []);

  const fetchEcommerceData = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) return;

      const params: any = {
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined
      };

      // Fetch all data in parallel
      const [ordersData, productsData, customersData] = await Promise.all([
        orderApi.getOrders(params).catch(() => []),
        productApi.getProducts(params).catch(() => []),
        customerApi.getCustomers(params).catch(() => [])
      ]);

      setOrders(ordersData || []);
      setProducts(productsData || []);
      setCustomers(customersData || []);
    } catch (error: any) {
      console.error("Error fetching ecommerce data:", error);
      toast.error("Failed to fetch ecommerce data", {
        description: error.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">E-Commerce Dashboard</h1>
        <div className="flex items-center space-x-2">
          <CustomDateRangePicker />
          <Button>
            <Download />
            <span className="hidden lg:inline">Download</span>
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-12">
          <EcommerceWelcomeCard 
            orders={orders}
            loading={loading}
          />
          <div className="md:col-span-12 lg:col-span-8">
            <StatCards 
              orders={orders}
              customers={customers}
              loading={loading}
            />
          </div>
        </div>
        <div className="space-y-4 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
          <EcommerceTotalRevenueCard 
            orders={orders}
            loading={loading}
          />
          <EcommerceReturnRateCard />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <EcommerceNewCustomersCard 
            customers={customers}
            loading={loading}
          />
          <EcommerceSalesByLocationCard 
            orders={orders}
            loading={loading}
          />
          <EcommerceVisitBySourceCard />
          <EcommerceCustomerReviewsCard 
            orders={orders}
            loading={loading}
          />
        </div>
        <div className="space-y-4 xl:grid xl:grid-cols-12 xl:gap-4 xl:space-y-0">
          <EcommerceRecentOrdersCard 
            orders={orders}
            loading={loading}
          />
          <EcommerceBestSellingProductsCard 
            products={products}
            orders={orders}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
