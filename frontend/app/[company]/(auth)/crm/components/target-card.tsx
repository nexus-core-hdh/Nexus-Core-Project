"use client";

import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";

const chartConfig = {
  visitors: {
    label: "Visitors"
  },
  safari: {
    label: "Safari",
    color: "var(--primary)"
  }
} satisfies ChartConfig;

interface TargetCardProps {
  deals?: any[];
  loading?: boolean;
}

export function TargetCard({ deals = [], loading = false }: TargetCardProps) {
  // Calculate target completion based on closed deals vs total deals
  // Assuming a target of 100 deals or calculate based on closed deals
  const totalDeals = deals?.length || 0;
  const closedDeals = deals?.filter((deal: any) => {
    const dealData = deal.data || {};
    const stage = dealData.stage || dealData.status || '';
    return stage.toLowerCase().includes('closed') || stage.toLowerCase().includes('won');
  }).length || 0;
  
  // Set a target (could be configurable)
  const target = 100; // Default target
  const completion = totalDeals > 0 ? Math.min((closedDeals / target) * 100, 100) : 0;
  const completionPercent = Math.round(completion);
  
  const chartData = [{ 
    browser: "safari", 
    visitors: completionPercent, 
    fill: "var(--color-safari)" 
  }];

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="font-display text-xl">
          {completionPercent >= 100 ? "Target completed!" : "Your target is incomplete"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div>
            <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[60px]">
              <RadialBarChart
                data={chartData}
                startAngle={0}
                endAngle={250}
                innerRadius={25}
                outerRadius={20}>
                <PolarGrid
                  gridType="circle"
                  radialLines={false}
                  stroke="none"
                  polarRadius={[86, 74]}
                />
                <RadialBar dataKey="visitors" background cornerRadius={10} />
                <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle">
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground font-bold">
                              {loading ? "..." : `%${completionPercent}`}
                            </tspan>
                          </text>
                        );
                      }
                    }}
                  />
                </PolarRadiusAxis>
              </RadialBarChart>
            </ChartContainer>
          </div>
          {!loading && (
            <p className="text-muted-foreground text-sm">
              You have completed <span className="text-orange-500">{completionPercent}%</span> of the given target, you
              can also check your status
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
