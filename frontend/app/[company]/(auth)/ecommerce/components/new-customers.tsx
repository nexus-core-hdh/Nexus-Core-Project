"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";

interface EcommerceNewCustomersCardProps {
  customers?: any[];
  loading?: boolean;
}

export function EcommerceNewCustomersCard({ customers = [], loading = false }: EcommerceNewCustomersCardProps) {
  const chartConfig = {
    desktop: {
      label: "Desktop",
      color: "var(--chart-1)"
    },
    mobile: {
      label: "Mobile",
      color: "var(--chart-2)"
    }
  } satisfies ChartConfig;

  // Calculate new customers by month
  const chartData = useMemo(() => {
    const months = ["January", "February", "March", "April", "May", "June"];
    const monthData: Record<string, number> = {};
    
    months.forEach(month => {
      monthData[month] = 0;
    });

    customers.forEach((customer: any) => {
      const customerDate = new Date(customer.createdAt);
      const monthIndex = customerDate.getMonth();
      const monthName = months[monthIndex];
      
      if (monthData[monthName] !== undefined) {
        monthData[monthName]++;
      }
    });

    return months.map(month => ({
      month,
      desktop: monthData[month] || 0,
      mobile: 0 // Could be calculated if device data is available
    }));
  }, [customers]);

  // Calculate total new customers
  const totalNewCustomers = useMemo(() => {
    return customers.length;
  }, [customers]);

  // Calculate growth (simplified)
  const growth = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const thisMonth = customers.filter((c: any) => new Date(c.createdAt) >= startOfMonth).length;
    const lastMonth = customers.filter((c: any) => {
      const date = new Date(c.createdAt);
      return date >= startOfLastMonth && date < startOfMonth;
    }).length;
    
    if (lastMonth === 0) return 0;
    return ((thisMonth - lastMonth) / lastMonth) * 100;
  }, [customers]);

  return (
    <Card className="md:col-span-6 xl:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>New Customers</CardTitle>
        {!loading && (
          <CardDescription className="text-xs">
            <span className={growth >= 0 ? "text-green-500" : "text-red-500"}>
              {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
            </span> from last month
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl">
          {loading ? "..." : totalNewCustomers.toLocaleString()}
        </div>
        {!loading && (
          <div className="pt-4">
            <ChartContainer className="h-[60px] w-full" config={chartConfig}>
              <LineChart
                accessibilityLayer
                data={chartData}
                margin={{
                  left: 12,
                  right: 12,
                  top: 6
                }}>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Line
                  dataKey="desktop"
                  type="natural"
                  stroke="var(--color-desktop)"
                  strokeWidth={2}
                  dot={{
                    fill: "var(--color-desktop)"
                  }}
                  activeDot={{
                    r: 6
                  }}
                />
              </LineChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
