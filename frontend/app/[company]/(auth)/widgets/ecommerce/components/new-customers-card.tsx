"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";
import { customerApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";

export function EcommerceNewCustomersCard() {
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [chartData, setChartData] = useState<Array<{ month: string; desktop: number; mobile: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        
        // Get last 30 days customers
        const response = await customerApi.getNewCustomers(30);
        const customers = await response.json();
        setTotalCustomers(customers?.length || 0);

        // Generate chart data for last 6 months
        const months: Array<{ month: string; desktop: number; mobile: number }> = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
          const monthStart = subMonths(now, i);
          const monthEnd = subMonths(now, i - 1);
          
          const monthResponse = await customerApi.getNewCustomers(
            Math.floor((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24))
          );
          const monthCustomers = await monthResponse.json();
          const count = monthCustomers?.length || 0;

          months.push({
            month: format(monthStart, "MMMM"),
            desktop: Math.round(count * 0.6),
            mobile: Math.round(count * 0.4),
          });
        }

        setChartData(months);
      } catch (error) {
        console.error("Failed to fetch customers:", error);
        toast.error("Failed to load customer data");
        setTotalCustomers(0);
        setChartData([
          { month: "January", desktop: 90, mobile: 80 },
          { month: "February", desktop: 250, mobile: 200 },
          { month: "March", desktop: 240, mobile: 120 },
          { month: "April", desktop: 120, mobile: 190 },
          { month: "May", desktop: 110, mobile: 130 },
          { month: "June", desktop: 250, mobile: 140 }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

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

  return (
    <Card className="md:col-span-6 xl:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>New Customers</CardTitle>
        <CardDescription className="text-xs">
          <span className="text-green-500">+36.5%</span> from last month
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl">
          {loading ? "..." : new Intl.NumberFormat("en-US").format(totalCustomers)}
        </div>
        <div className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center h-[60px]">
              <div className="text-muted-foreground text-sm">Loading...</div>
            </div>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
































































