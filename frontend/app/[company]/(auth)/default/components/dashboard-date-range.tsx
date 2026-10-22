"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";

import CustomDateRangePicker, { defaultDateRange } from "@/components/custom-date-range-picker";

// The dashboard's selected date range, shared between the header's date picker and the widgets
// that filter by it (currently the order KPI row). Starts at the picker's own default.
const DashboardDateRangeContext = React.createContext<{
  range: DateRange | undefined;
  setRange: (range: DateRange | undefined) => void;
} | null>(null);

export function DashboardDateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = React.useState<DateRange | undefined>(defaultDateRange);
  const value = React.useMemo(() => ({ range, setRange }), [range]);
  return <DashboardDateRangeContext.Provider value={value}>{children}</DashboardDateRangeContext.Provider>;
}

export function useDashboardDateRange() {
  const ctx = React.useContext(DashboardDateRangeContext);
  if (!ctx) throw new Error("useDashboardDateRange must be used inside DashboardDateRangeProvider");
  return ctx;
}

export function DashboardDateRangePicker() {
  const { range, setRange } = useDashboardDateRange();
  return <CustomDateRangePicker value={range} onChange={setRange} />;
}
