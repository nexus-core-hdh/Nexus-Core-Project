"use client";

import { useState, useEffect } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, addMonths } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";

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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";
import { fileApi } from "@/lib/api";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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

const dateFilterPresets = [
  { name: "Today", value: "today" },
  { name: "Yesterday", value: "yesterday" },
  { name: "This Week", value: "thisWeek" },
  { name: "Last 7 Days", value: "last7Days" },
  { name: "Last 28 Days", value: "last28Days" },
  { name: "This Month", value: "thisMonth" },
  { name: "Last Month", value: "lastMonth" },
  { name: "This Year", value: "thisYear" }
];

export function ChartFileTransfer() {
  const today = new Date();
  const twentyEightDaysAgo = startOfDay(subDays(today, 27));
  
  // Initialize with "Last 28 days" as default
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: twentyEightDaysAgo,
    to: endOfDay(today)
  });
  const [open, setOpen] = useState(false);
  
  const [chartData, setChartData] = useState<Array<{ month: string; desktop: number; mobile: number }>>([]);
  const [loading, setLoading] = useState(true);

  const handleDateChange = (type: string) => {
    const today = new Date();
    let from: Date;
    let to: Date = endOfDay(today);

    switch (type) {
      case "today":
        from = startOfDay(today);
        break;
      case "yesterday":
        from = startOfDay(subDays(today, 1));
        to = endOfDay(subDays(today, 1));
        break;
      case "thisWeek":
        from = startOfDay(subDays(today, today.getDay()));
        break;
      case "last7Days":
        from = startOfDay(subDays(today, 6));
        break;
      case "last28Days":
        from = startOfDay(subDays(today, 27));
        break;
      case "thisMonth":
        from = startOfMonth(today);
        break;
      case "lastMonth":
        const lastMonth = subMonths(today, 1);
        from = startOfMonth(lastMonth);
        to = endOfMonth(lastMonth);
        break;
      case "thisYear":
        from = startOfDay(new Date(today.getFullYear(), 0, 1));
        break;
      default:
        from = startOfDay(subDays(today, 27));
    }

    setDateRange({ from, to });
  };

  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!dateRange?.from || !dateRange?.to) return;

      try {
        setLoading(true);
        
        const startDate = dateRange.from;
        const endDate = dateRange.to;

        // Fetch all files in the date range
        const currentUser = getCurrentUser();
        const allFiles = await fileApi.getFiles({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          companyId: currentUser?.companyId || undefined,
          branchId: currentUser?.branchId || undefined
        });

        // Get all unique months in the date range
        const monthData: Map<string, { desktop: number; mobile: number }> = new Map();
        const monthsInRange: Date[] = [];
        
        // Generate all months in the range
        let currentMonth = startOfMonth(startDate);
        const endMonth = startOfMonth(endDate);
        
        while (currentMonth <= endMonth) {
          monthsInRange.push(new Date(currentMonth));
          const monthKey = format(currentMonth, "MMMM yyyy");
          monthData.set(monthKey, { desktop: 0, mobile: 0 });
          currentMonth = addMonths(currentMonth, 1);
        }

        // Group files by month and device type
        (allFiles || []).forEach((file: any) => {
          const fileDate = new Date(file.createdAt);
          const monthKey = format(fileDate, "MMMM yyyy");
          const current = monthData.get(monthKey) || { desktop: 0, mobile: 0 };
          
          const deviceType = file.deviceType || "desktop";
          if (deviceType === "mobile") {
            monthData.set(monthKey, {
              ...current,
              mobile: current.mobile + 1,
            });
          } else {
            monthData.set(monthKey, {
              ...current,
              desktop: current.desktop + 1,
            });
          }
        });

        // Convert to array format for chart
        const months: Array<{ month: string; desktop: number; mobile: number }> = [];
        monthsInRange.forEach((monthDate) => {
          const monthKey = format(monthDate, "MMMM yyyy");
          const monthName = format(monthDate, "MMMM");
          const data = monthData.get(monthKey) || { desktop: 0, mobile: 0 };
          
          months.push({
            month: monthName,
            desktop: data.desktop || 0,
            mobile: data.mobile || 0,
          });
        });

        setChartData(months);
      } catch (error) {
        console.error("Failed to fetch monthly file transfer data:", error);
        toast.error("Failed to load file transfer data");
        // Set empty data as fallback
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyData();
  }, [dateRange]);

  return (
    <Card>
      <CardHeader className="grid-cols-1">
        <CardTitle>Monthly File Transfer</CardTitle>
        <CardDescription>
          {dateRange?.from && dateRange?.to
            ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
            : "Last 28 days"}
        </CardDescription>
        <CardAction className="relative -mt-2.5">
          <div className="end-0 top-0 md:absolute">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    <span>Select date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto" align="end">
                <div className="flex flex-col gap-4">
                  <Select defaultValue="last28Days" onValueChange={handleDateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateFilterPresets.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(newDate) => {
                      setDateRange(newDate);
                      if (newDate?.from && newDate?.to) {
                        setOpen(false);
                      }
                    }}
                    numberOfMonths={2}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[280px]">
            <div className="text-muted-foreground">Loading chart data...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[280px]">
            <div className="text-muted-foreground">No data available</div>
          </div>
        ) : (
          <ChartContainer className="w-full md:h-[280px]" config={chartConfig}>
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="desktop" stackId="a" fill="var(--color-desktop)" radius={[0, 0, 5, 5]} />
              <Bar dataKey="mobile" stackId="a" fill="var(--color-mobile)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
