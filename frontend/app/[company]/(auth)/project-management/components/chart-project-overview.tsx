"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

const chartConfig = {
  visitors: {
    label: "Projects"
  },
  active: {
    label: "Active",
    color: "var(--primary)"
  },
  completed: {
    label: "Completed",
    color: "var(--secondary)"
  }
} satisfies ChartConfig;

export function ChartProjectOverview() {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("90d");
  const [chartData, setChartData] = useState<Array<{ date: string; active: number; completed: number }>>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        if (!user) return;

        const projects = await projectApi.getProjects({
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined
        });

        // Calculate days to look back
        let daysToSubtract = 90;
        if (timeRange === "30d") {
          daysToSubtract = 30;
        } else if (timeRange === "7d") {
          daysToSubtract = 7;
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysToSubtract);

        // Generate date range
        const dateMap = new Map<string, { active: number; completed: number }>();
        const today = new Date();
        
        for (let i = daysToSubtract; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          const dateKey = date.toISOString().split("T")[0];
          dateMap.set(dateKey, { active: 0, completed: 0 });
        }

        // Aggregate projects by date
        projects.forEach((project: any) => {
          if (project.startDate) {
            const projectDate = new Date(project.startDate).toISOString().split("T")[0];
            if (dateMap.has(projectDate)) {
              const data = dateMap.get(projectDate)!;
              if (project.status === "ACTIVE") {
                data.active++;
              } else if (project.status === "COMPLETED") {
                data.completed++;
              }
            }
          }
        });

        // Convert map to array
        const data = Array.from(dateMap.entries()).map(([date, counts]) => ({
          date,
          active: counts.active,
          completed: counts.completed
        }));

        setChartData(data);
      } catch (error) {
        console.error("Error fetching project overview data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const filteredData = chartData;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Projects Overview</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">Total for the last 3 months</span>
          <span className="@[540px]/card:hidden">Last 3 months</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex">
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value">
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div className="flex h-[200px] lg:h-[250px] items-center justify-center">
            <div className="text-muted-foreground text-sm">Loading chart data...</div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full lg:h-[250px]">
            <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-active)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-active)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={1.0} />
                <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              defaultIndex={isMobile ? -1 : 10}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric"
                    });
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="completed"
              type="natural"
              fill="url(#fillDesktop)"
              stroke="var(--color-completed)"
              stackId="a"
            />
            <Area
              dataKey="active"
              type="natural"
              fill="url(#fillMobile)"
              stroke="var(--color-active)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
