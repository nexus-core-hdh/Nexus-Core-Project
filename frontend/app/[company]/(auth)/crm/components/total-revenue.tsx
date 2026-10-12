"use client";

import { WalletMinimal } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader } from "@/components/ui/card";

interface TotalRevenueCardProps {
  deals?: any[];
  orders?: any[];
  loading?: boolean;
}

export function TotalRevenueCard({ deals = [], orders = [], loading = false }: TotalRevenueCardProps) {
  // Calculate total revenue from deals and orders
  const calculateRevenue = () => {
    let revenue = 0;
    
    // Sum revenue from deals (assuming data contains amount or value field)
    deals.forEach((deal: any) => {
      const dealData = deal.data || {};
      const amount = dealData.amount || dealData.value || dealData.revenue || 0;
      revenue += typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    });
    
    // Sum revenue from orders
    orders.forEach((order: any) => {
      revenue += order.totalAmount || 0;
    });
    
    return revenue;
  };

  const totalRevenue = calculateRevenue();
  const growth = 0; // Placeholder for growth calculation

  return (
    <Card>
      <CardHeader>
        <CardDescription>Total Revenue</CardDescription>
        <div className="flex flex-col gap-2">
          <h4 className="font-display text-2xl lg:text-3xl">
            {loading ? "..." : `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </h4>
          {!loading && (
            <div className="text-muted-foreground text-sm">
              {growth > 0 ? (
                <span className="text-green-600">+{growth.toFixed(1)}%</span>
              ) : growth < 0 ? (
                <span className="text-red-600">{growth.toFixed(1)}%</span>
              ) : (
                <span>No change</span>
              )} from last month
            </div>
          )}
        </div>
        <CardAction>
          <div className="flex gap-4">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full border">
              <WalletMinimal className="size-5" />
            </div>
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
