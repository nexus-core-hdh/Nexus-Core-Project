"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Label, Pie, PieChart, Sector } from "recharts";
import { PieSectorDataItem } from "recharts/types/polar/Pie";

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
  ChartStyle,
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
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

const monthNames = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

const chartConfig = {
  visitors: {
    label: "Projects"
  },
  desktop: {
    label: "Projects"
  },
  mobile: {
    label: "Mobile"
  },
  january: { label: "January", color: "var(--chart-1)" },
  february: { label: "February", color: "var(--chart-2)" },
  march: { label: "March", color: "var(--chart-3)" },
  april: { label: "April", color: "var(--chart-4)" },
  may: { label: "May", color: "var(--chart-5)" },
  june: { label: "June", color: "var(--chart-1)" },
  july: { label: "July", color: "var(--chart-2)" },
  august: { label: "August", color: "var(--chart-3)" },
  september: { label: "September", color: "var(--chart-4)" },
  october: { label: "October", color: "var(--chart-5)" },
  november: { label: "November", color: "var(--chart-1)" },
  december: { label: "December", color: "var(--chart-2)" }
} satisfies ChartConfig;

export function ChartProjectEfficiency() {
  const id = "pie-interactive";
  const [desktopData, setDesktopData] = useState<Array<{ month: string; desktop: number; fill: string }>>([]);
  const [activeMonth, setActiveMonth] = React.useState<string>("");
  const [loading, setLoading] = useState(true);

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

        // Get current year and last 6 months
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const monthMap = new Map<string, number>();

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(currentYear, currentDate.getMonth() - i, 1);
          const monthKey = monthNames[date.getMonth()];
          monthMap.set(monthKey, 0);
        }

        // Count projects by month
        projects.forEach((project: any) => {
          const date = project.startDate ? new Date(project.startDate) : new Date(project.createdAt);
          const monthKey = monthNames[date.getMonth()];
          
          if (monthMap.has(monthKey) && date.getFullYear() === currentYear) {
            monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
          }
        });

        // Create data array
        const data = Array.from(monthMap.entries())
          .filter(([_, count]) => count > 0)
          .map(([month, count]) => ({
            month,
            desktop: count,
            fill: `var(--color-${month})`
          }));

        setDesktopData(data);
        if (data.length > 0) {
          setActiveMonth(data[0].month);
        }
      } catch (error) {
        console.error("Error fetching efficiency data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const activeIndex = React.useMemo(
    () => desktopData.findIndex((item) => item.month === activeMonth),
    [activeMonth, desktopData]
  );
  const months = React.useMemo(() => desktopData.map((item) => item.month), [desktopData]);

  if (loading) {
    return (
      <Card data-chart={id}>
        <CardHeader>
          <CardDescription>Last 6 months</CardDescription>
          <CardTitle className="font-display text-xl">Project Efficiency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 justify-center pb-0">
          <div className="text-muted-foreground flex h-[230px] items-center justify-center text-sm">
            Loading data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (desktopData.length === 0) {
    return (
      <Card data-chart={id}>
        <CardHeader>
          <CardDescription>Last 6 months</CardDescription>
          <CardTitle className="font-display text-xl">Project Efficiency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 justify-center pb-0">
          <div className="text-muted-foreground flex h-[230px] items-center justify-center text-sm">
            No project data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-chart={id}>
      <ChartStyle id={id} config={chartConfig} />
      <CardHeader>
        <CardDescription>Last 6 months</CardDescription>
        <CardTitle className="font-display text-xl">Project Efficiency</CardTitle>
        <CardAction>
          <Select value={activeMonth} onValueChange={setActiveMonth}>
            <SelectTrigger className="ml-auto" aria-label="Select a value">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent align="end">
              {months.map((key) => {
                const config = chartConfig[key as keyof typeof chartConfig];

                if (!config) {
                  return null;
                }

                const color = "color" in config ? config.color : undefined;

                return (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="flex h-3 w-3 shrink-0 rounded-sm"
                        style={{
                          backgroundColor: color
                        }}
                      />
                      {config?.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 justify-center pb-0">
        <ChartContainer
          id={id}
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[230px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={desktopData}
              dataKey="desktop"
              nameKey="month"
              innerRadius={45}
              strokeWidth={5}
              activeIndex={activeIndex >= 0 ? activeIndex : undefined}
              activeShape={({ outerRadius = 0, ...props }: PieSectorDataItem) => (
                <g>
                  <Sector {...props} outerRadius={outerRadius + 5} />
                  <Sector
                    {...props}
                    outerRadius={outerRadius + 20}
                    innerRadius={outerRadius + 12}
                  />
                </g>
              )}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox && activeIndex >= 0) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle">
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold">
                          {desktopData[activeIndex]?.desktop.toLocaleString() || 0}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground">
                          Projects
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
