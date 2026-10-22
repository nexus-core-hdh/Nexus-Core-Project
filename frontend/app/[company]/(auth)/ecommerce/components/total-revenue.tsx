"use client";

import { useMemo } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis } from "recharts";

interface EcommerceTotalRevenueCardProps {
  orders?: any[];
  loading?: boolean;
}

export function EcommerceTotalRevenueCard({ orders = [], loading = false }: EcommerceTotalRevenueCardProps) {
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

  // Calculate revenue by month for the last 6 months
  const chartData = useMemo(() => {
    const months = ["January", "February", "March", "April", "May", "June"];
    const now = new Date();
    const monthData: Record<string, { desktop: number; mobile: number }> = {};
    
    // Initialize all months with 0
    months.forEach(month => {
      monthData[month] = { desktop: 0, mobile: 0 };
    });

    // Group orders by month
    orders.forEach((order: any) => {
      if (order.status === "PAID" || order.status === "COMPLETED") {
        const orderDate = new Date(order.orderDate || order.createdAt);
        const monthIndex = orderDate.getMonth();
        const monthName = months[monthIndex];
        
        if (monthData[monthName]) {
          // For simplicity, split revenue between desktop and mobile (could be improved with actual device data)
          const amount = order.totalAmount || 0;
          monthData[monthName].desktop += amount * 0.6;
          monthData[monthName].mobile += amount * 0.4;
        }
      }
    });

    return months.map(month => ({
      month,
      desktop: Math.round(monthData[month].desktop / 100), // Scale down for display
      mobile: Math.round(monthData[month].mobile / 100)
    }));
  }, [orders]);

  // Calculate totals
  const desktopTotal = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.desktop, 0);
  }, [chartData]);

  const mobileTotal = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.mobile, 0);
  }, [chartData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Revenue</CardTitle>
        <CardDescription>Income in the last 28 days</CardDescription>
        <CardAction className="relative col-start-auto row-start-auto justify-self-start lg:col-start-2 lg:row-start-1 lg:justify-self-end">
          <div className="end-0 top-0 mt-2 flex flex-col items-stretch space-y-0 p-0 sm:flex-row lg:absolute lg:mt-0">
            <div className="flex gap-8 rounded-lg border p-4">
              <button className="flex flex-1 flex-col justify-center gap-2 text-left">
                <span className="text-muted-foreground text-xs tracking-wider uppercase">
                  Desktop
                </span>
                <span className="font-display text-lg leading-none sm:text-2xl">
                  {loading ? "..." : desktopTotal.toLocaleString()}
                </span>
              </button>
              <button className="flex flex-1 flex-col justify-center gap-2 text-left">
                <span className="text-muted-foreground text-xs tracking-wider uppercase">
                  Mobile
                </span>
                <span className="font-display text-lg leading-none sm:text-2xl">
                  {loading ? "..." : mobileTotal.toLocaleString()}
                </span>
              </button>
            </div>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="lg:mt-10">
          {loading ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <ChartContainer className="!aspect-21/9 w-full" config={chartConfig}>
              <BarChart
                accessibilityLayer
                data={chartData}
                margin={{
                  left: -6,
                  right: -6
                }}>
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => value}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                <Bar dataKey="desktop" fill="var(--color-desktop)" radius={8} />
                <Bar dataKey="mobile" fill="var(--color-mobile)" radius={8} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
