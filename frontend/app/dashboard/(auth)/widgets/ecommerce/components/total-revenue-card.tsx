"use client";

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
import { orderApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";

export function EcommerceTotalRevenueCard() {
  const [chartData, setChartData] = useState<Array<{ month: string; desktop: number; mobile: number }>>([]);
  const [totalDesktop, setTotalDesktop] = useState(0);
  const [totalMobile, setTotalMobile] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        setLoading(true);
        // Get last 6 months of data
        const months: Array<{ month: string; desktop: number; mobile: number }> = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

          const response = await orderApi.getOrderStats({
            startDate: monthStart.toISOString(),
            endDate: monthEnd.toISOString(),
          });

          // getOrderStats already returns the parsed stats object (see lib/api.ts), not a fetch Response.
          const stats = response;
          const monthName = format(monthStart, "MMMM");
          
          // For demo, split revenue between desktop and mobile
          // In real app, you'd track device type in orders
          months.push({
            month: monthName,
            desktop: Math.round(stats.totalRevenue * 0.5),
            mobile: Math.round(stats.totalRevenue * 0.5),
          });
        }

        setChartData(months);
        setTotalDesktop(months.reduce((sum, m) => sum + m.desktop, 0));
        setTotalMobile(months.reduce((sum, m) => sum + m.mobile, 0));
      } catch (error) {
        console.error("Failed to fetch revenue:", error);
        toast.error("Failed to load revenue data");
        // Fallback data
        setChartData([
          { month: "January", desktop: 190, mobile: 180 },
          { month: "February", desktop: 250, mobile: 200 },
          { month: "March", desktop: 240, mobile: 120 },
          { month: "April", desktop: 120, mobile: 190 },
          { month: "May", desktop: 110, mobile: 130 },
          { month: "June", desktop: 250, mobile: 140 }
        ]);
        setTotalDesktop(1160);
        setTotalMobile(960);
      } finally {
        setLoading(false);
      }
    };

    fetchRevenue();
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
                  {loading ? "..." : new Intl.NumberFormat("en-US").format(totalDesktop)}
                </span>
              </button>
              <button className="flex flex-1 flex-col justify-center gap-2 text-left">
                <span className="text-muted-foreground text-xs tracking-wider uppercase">
                  Mobile
                </span>
                <span className="font-display text-lg leading-none sm:text-2xl">
                  {loading ? "..." : new Intl.NumberFormat("en-US").format(totalMobile)}
                </span>
              </button>
            </div>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="lg:mt-10">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading chart...</div>
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
































































