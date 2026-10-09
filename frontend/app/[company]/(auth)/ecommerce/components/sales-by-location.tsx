"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/CardActionMenus";
import { Progress } from "@/components/ui/progress";

type SalesData = {
  country: string;
  percentage: number;
  value: number;
  change: number;
};

interface EcommerceSalesByLocationCardProps {
  orders?: any[];
  loading?: boolean;
}

export function EcommerceSalesByLocationCard({ orders = [], loading = false }: EcommerceSalesByLocationCardProps) {
  // Calculate sales by location from orders
  const salesData = useMemo(() => {
    const locationMap: Record<string, { value: number; previousValue: number }> = {};
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    orders.forEach((order: any) => {
      if (order.status === "PAID" || order.status === "COMPLETED") {
        const orderDate = new Date(order.orderDate || order.createdAt);
        const amount = order.totalAmount || 0;
        
        // Get location from customer
        const location = order.customer?.country || 
                       order.customer?.state || 
                       order.customer?.address?.split(',')[1]?.trim() || 
                       "Unknown";
        
        if (!locationMap[location]) {
          locationMap[location] = { value: 0, previousValue: 0 };
        }
        
        if (orderDate >= startOfMonth) {
          locationMap[location].value += amount;
        } else if (orderDate >= startOfLastMonth && orderDate <= endOfLastMonth) {
          locationMap[location].previousValue += amount;
        }
      }
    });

    // Convert to array and calculate percentages
    const totalValue = Object.values(locationMap).reduce((sum, loc) => sum + loc.value, 0);
    
    const data: SalesData[] = Object.entries(locationMap)
      .map(([country, data]) => {
        const percentage = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
        const change = data.previousValue > 0 
          ? ((data.value - data.previousValue) / data.previousValue) * 100 
          : 0;
        
        return {
          country,
          percentage: Math.round(percentage),
          value: data.value,
          change: parseFloat(change.toFixed(1))
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // Top 6 locations

    return data;
  }, [orders]);

  return (
    <Card className="lg:col-span-6 xl:col-span-4">
      <CardHeader>
        <CardTitle className="relative">
          Sales by Location
          <div className="absolute end-0 top-0">
            <ExportButton />
          </div>
        </CardTitle>
        <CardDescription>Income in the last 28 days</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : salesData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">No sales data available.</p>
        ) : (
          <div className="space-y-5">
            {salesData.map((item, key) => (
              <div key={item.country} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{item.country}</span>
                    {item.change > 0 ? (
                      <Badge variant="outline" className="text-green-500">
                        +{item.change}%
                      </Badge>
                    ) : item.change < 0 ? (
                      <Badge variant="outline" className="text-red-500">
                        {item.change}%
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-sm">{item.percentage}%</div>
                </div>
                <Progress value={item.percentage} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
