"use client";

import { useState, useEffect, useMemo } from "react";
import { Heart } from "lucide-react";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { isSameDay } from "date-fns";

import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

const chartConfig = {
  visitors: {
    label: "Visitors"
  },
  safari: {
    label: "Safari",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function HeartRateCard() {
  const user = getCurrentUser();
  const [workouts, setWorkouts] = useState<any[]>([]);

  useEffect(() => {
    const fetchTodayWorkouts = async () => {
      if (!user?.id) return;
      
      try {
        const data = await fitnessApi.getTodayWorkouts(user.id);
        setWorkouts(data || []);
      } catch (error) {
        console.error("Failed to fetch workouts:", error);
      }
    };

    fetchTodayWorkouts();
  }, [user?.id]);

  const averageHeartRate = useMemo(() => {
    const today = new Date();
    const todayWorkouts = workouts.filter((w) => 
      isSameDay(new Date(w.startTime), today) && w.heartRate
    );
    
    if (todayWorkouts.length === 0) return 0;
    
    const total = todayWorkouts.reduce((sum, w) => sum + (w.heartRate || 0), 0);
    return Math.round(total / todayWorkouts.length);
  }, [workouts]);

  const targetHeartRate = 180; // Max heart rate target
  const heartRatePercentage = Math.min(100, Math.round((averageHeartRate / targetHeartRate) * 100));
  
  const chartData = [{ 
    browser: "safari", 
    visitors: averageHeartRate || 0, 
    fill: "var(--color-safari)" 
  }];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm font-medium">Heart Rate</CardTitle>
          <Heart className="text-destructive h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-44 w-full">
          <RadialBarChart
            data={chartData}
            startAngle={0}
            endAngle={250}
            innerRadius={80}
            outerRadius={110}>
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
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
                          className="fill-foreground text-4xl font-bold">
                          {averageHeartRate > 0 ? averageHeartRate.toLocaleString() : "N/A"}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground">
                          BPM
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
