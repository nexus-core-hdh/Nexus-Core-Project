"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { salesOverview } from "./dashboard-data";

const chartConfig = {
  thisMonth: { label: "This Month", color: "var(--chart-1)" },
  lastMonth: { label: "Last Month", color: "var(--chart-4)" }
} satisfies ChartConfig;

export function SalesOverviewChart() {
  const [range, setRange] = React.useState("this-month");
  const total = salesOverview[salesOverview.length - 1]?.thisMonth ?? 0;

  return (
    <Card className="h-full py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-primary block h-4 w-1 rounded-full" />
          Sales Overview
        </CardTitle>
        <CardAction>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="this-quarter">This Quarter</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-semibold tabular-nums">PKR {total.toFixed(2)}M</p>
        <div className="mt-2 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-chart-1 block h-0.5 w-4 rounded-full" />
            <span className="text-muted-foreground">This Month</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-chart-4 block h-0 w-4 rounded-full border-t-2 border-dashed" />
            <span className="text-muted-foreground">Last Month</span>
          </span>
        </div>
        <ChartContainer config={chartConfig} className="mt-4 h-[220px] w-full">
          <LineChart data={salesOverview} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={11}
              tickFormatter={(v) => `${v}M`}
              width={32}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Line
              dataKey="thisMonth"
              type="monotone"
              stroke="var(--color-thisMonth)"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              dataKey="lastMonth"
              type="monotone"
              stroke="var(--color-lastMonth)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
