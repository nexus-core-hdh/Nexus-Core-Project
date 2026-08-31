"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { topProducts } from "./dashboard-data";

const chartConfig = topProducts.reduce((acc, p) => {
  acc[p.name] = { label: p.name, color: p.color };
  return acc;
}, {} as ChartConfig);

export function TopProductsChart() {
  const [range, setRange] = React.useState("this-month");
  const total = topProducts.reduce((sum, p) => sum + p.share, 0);

  return (
    <Card className="h-full py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Top Products by Sales</CardTitle>
        <CardAction>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col px-4">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[190px] w-full">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={topProducts}
              dataKey="share"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              strokeWidth={3}
              stroke="var(--card)"
            >
              {topProducts.map((p) => (
                <Cell key={p.name} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="mt-2 space-y-2.5">
          {topProducts.map((p) => (
            <div key={p.name} className="flex items-center gap-2 text-sm">
              <span className="block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-muted-foreground flex-1 truncate">{p.name}</span>
              <span className="w-9 shrink-0 text-right text-xs font-medium">{p.share}%</span>
              <span className="w-20 shrink-0 text-right font-medium tabular-nums">{p.amount}</span>
            </div>
          ))}
        </div>

        <Link
          href="#"
          className="text-primary mt-4 flex items-center justify-center gap-1 text-sm font-medium hover:underline">
          View all products
          <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
