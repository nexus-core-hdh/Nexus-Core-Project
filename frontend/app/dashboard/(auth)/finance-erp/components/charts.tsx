"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  REVENUE_VS_EXPENSES, RECEIVABLES_VS_PAYABLES, CASH_FLOW_TREND,
  MONTHLY_SALES, MONTHLY_PURCHASES, AGING_DISTRIBUTION,
} from "@/lib/finance-erp/dashboard/mock";

const AXIS_STYLE = { fontSize: 11 };
const GRID_STROKE = "var(--border)";
const TOOLTIP_STYLE = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-[260px] w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

export function RevenueVsExpensesChart() {
  return (
    <ChartCard title="Revenue vs Expenses (PKR Millions)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={REVENUE_VS_EXPENSES}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="month" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.18} strokeWidth={2} />
          <Area type="monotone" dataKey="expenses" name="Expenses" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.18} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ReceivablesVsPayablesChart() {
  return (
    <ChartCard title="Receivables vs Payables (PKR Millions)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={RECEIVABLES_VS_PAYABLES}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="month" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="receivables" name="Receivables" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="payables" name="Payables" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CashFlowTrendChart() {
  return (
    <ChartCard title="Cash Flow Trend (PKR Millions)">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={CASH_FLOW_TREND}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="month" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="inflow" name="Cash Inflow" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="outflow" name="Cash Outflow" stroke="var(--chart-5)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function MonthlySalesChart() {
  return (
    <ChartCard title="Monthly Sales (PKR Millions)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={MONTHLY_SALES}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="month" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" name="Sales" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function MonthlyPurchasesChart() {
  return (
    <ChartCard title="Monthly Purchases (PKR Millions)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={MONTHLY_PURCHASES}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="month" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" name="Purchases" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AgingDistributionChart() {
  return (
    <ChartCard title="Aging Distribution">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Pie data={AGING_DISTRIBUTION} dataKey="value" nameKey="bucket" innerRadius={55} outerRadius={90} paddingAngle={2}>
            {AGING_DISTRIBUTION.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
