"use client";

import { useState, useEffect, useMemo } from "react";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { nutritionApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { NutritionDialog } from "./nutrition-dialog";

const chartConfig = {
  visitors: {
    label: "Visitors"
  },
  safari: {
    label: "Safari",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function NutritionCard() {
  const user = getCurrentUser();
  const [nutrition, setNutrition] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchTodayNutrition = async () => {
    if (!user?.id) return;
    
    try {
      const data = await nutritionApi.getTodayNutrition(user.id);
      setNutrition(data);
    } catch (error) {
      console.error("Failed to fetch nutrition:", error);
    }
  };

  useEffect(() => {
    fetchTodayNutrition();
  }, [user?.id]);

  const handleAddNutrition = () => {
    setIsDialogOpen(true);
  };

  const handleNutritionSaved = () => {
    setIsDialogOpen(false);
    fetchTodayNutrition();
  };

  const calories = nutrition?.calories || 0;
  const carbs = nutrition?.carbs || 0;
  const protein = nutrition?.protein || 0;
  const fats = nutrition?.fats || 0;
  
  const targetCalories = 2000;
  const remainingCalories = Math.max(0, targetCalories - calories);
  const caloriePercentage = Math.min(100, Math.round((calories / targetCalories) * 100));

  const chartData = [{ browser: "safari", visitors: calories, fill: "var(--color-safari)" }];

  const macros = [
    { label: "Carbs", amount: `${Math.round(carbs)}g`, color: "bg-red-400" },
    { label: "Protein", amount: `${Math.round(protein)}g`, color: "bg-blue-400" },
    { label: "Fats", amount: `${Math.round(fats)}g`, color: "bg-yellow-400" }
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Nutrition</CardTitle>
          <CardDescription>Today&#39;s intake</CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon-sm" onClick={handleAddNutrition}>
              <Plus />
            </Button>
          </CardAction>
        </CardHeader>
      <CardContent className="space-y-6">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-44 w-full">
          <RadialBarChart
            data={chartData}
            startAngle={0}
            endAngle={300}
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
                          {calories.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground">
                          kcal
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
        <p className="text-muted-foreground text-center text-sm">{remainingCalories} kcal remaining</p>
        <div className="grid grid-cols-3 gap-3">
          {macros.map((macro) => (
            <div key={macro.label} className="bg-muted rounded-xl p-4 text-center">
              <div className={`h-1 w-8 ${macro.color} mx-auto mb-2 rounded-full`} />
              <p className="text-muted-foreground mb-1 text-xs">{macro.label}</p>
              <p className="text-lg font-bold">{macro.amount}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    <NutritionDialog
      open={isDialogOpen}
      onOpenChange={setIsDialogOpen}
      nutrition={nutrition}
      onSaved={handleNutritionSaved}
    />
    </>
  );
}
