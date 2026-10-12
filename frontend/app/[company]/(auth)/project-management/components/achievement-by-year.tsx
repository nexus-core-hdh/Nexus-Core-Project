"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export function AchievementByYear() {
  const [yearData, setYearData] = useState<Array<{ year: string; count: number; color: string }>>([]);
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

        // Group projects by year (based on startDate or createdAt)
        const yearMap = new Map<string, number>();
        const currentYear = new Date().getFullYear();

        projects.forEach((project: any) => {
          const date = project.startDate ? new Date(project.startDate) : new Date(project.createdAt);
          const year = date.getFullYear();
          
          // Only show last 3 years
          if (year >= currentYear - 2 && year <= currentYear) {
            yearMap.set(year.toString(), (yearMap.get(year.toString()) || 0) + 1);
          }
        });

        // Create data array for last 3 years
        const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
        const data: Array<{ year: string; count: number; color: string }> = [];
        
        for (let i = 2; i >= 0; i--) {
          const year = (currentYear - i).toString();
          const count = yearMap.get(year) || 0;
          data.push({
            year,
            count,
            color: colors[2 - i]
          });
        }

        setYearData(data);
      } catch (error) {
        console.error("Error fetching achievement data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle>Achievement by Year</CardTitle>
          <CardDescription>
            You completed more projects per day on average this year than last year.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            Loading data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="xl:col-span-1">
      <CardHeader>
        <CardTitle>Achievement by Year</CardTitle>
        <CardDescription>
          You completed more projects per day on average this year than last year.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {yearData.map((item, index) => (
          <div key={item.year} className="grid auto-rows-min gap-2">
            <div className="flex items-baseline gap-1 text-2xl leading-none font-semibold tabular-nums">
              {item.count}
              <span className="text-muted-foreground text-xs font-normal">projects</span>
            </div>
            <ChartContainer
              config={{
                steps: {
                  label: "Steps",
                  color: item.color
                }
              }}
              className="aspect-auto h-[32px] w-full">
              <BarChart
                accessibilityLayer
                layout="vertical"
                margin={{
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0
                }}
                data={[
                  {
                    date: item.year,
                    steps: item.count
                  }]}>
                <Bar dataKey="steps" fill={`var(--color-steps)`} radius={4} barSize={32}>
                  <LabelList
                    position="insideLeft"
                    dataKey="date"
                    offset={8}
                    fontSize={12}
                    fill="var(--primary-foreground)"
                  />
                </Bar>
                <YAxis dataKey="date" type="category" tickCount={1} hide />
                <XAxis dataKey="steps" type="number" hide />
              </BarChart>
            </ChartContainer>
          </div>
        ))}
        {yearData.length === 0 && (
          <div className="text-muted-foreground text-center text-sm">No project data available</div>
        )}
      </CardContent>
    </Card>
  );
}
