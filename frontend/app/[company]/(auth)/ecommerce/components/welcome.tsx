"use client";

import { useMemo } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

interface EcommerceWelcomeCardProps {
  orders?: any[];
  loading?: boolean;
}

export function EcommerceWelcomeCard({ orders = [], loading = false }: EcommerceWelcomeCardProps) {
  // Calculate monthly sales and growth
  const salesData = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const thisMonthSales = orders
      .filter((order: any) => {
        const orderDate = new Date(order.orderDate || order.createdAt);
        return orderDate >= startOfMonth && (order.status === "PAID" || order.status === "COMPLETED");
      })
      .reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);

    const lastMonthSales = orders
      .filter((order: any) => {
        const orderDate = new Date(order.orderDate || order.createdAt);
        return orderDate >= startOfLastMonth && orderDate <= endOfLastMonth && (order.status === "PAID" || order.status === "COMPLETED");
      })
      .reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);

    const growth = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : 0;

    return {
      sales: thisMonthSales,
      growth: parseFloat(growth.toFixed(1))
    };
  }, [orders]);

  // Get current user name
  const userName = useMemo(() => {
    const user = getCurrentUser();
    return user?.name || "Toby";
  }, []);

  return (
    <Card className="bg-muted relative overflow-hidden md:col-span-12 lg:col-span-4">
      <CardHeader>
        <CardTitle className="text-2xl">Congratulations {userName}! 🎉</CardTitle>
        <CardDescription>Best seller of the month</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-3xl">
              {loading ? "..." : `$${salesData.sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
            {!loading && (
              <div className="text-muted-foreground text-xs">
                <span className={salesData.growth >= 0 ? "text-green-500" : "text-red-500"}>
                  {salesData.growth >= 0 ? "+" : ""}{salesData.growth}%
                </span> from last month
              </div>
            )}
          </div>
          <Button variant="outline">View Sales</Button>
        </div>
      </CardContent>
      <Image
        width={800}
        height={300}
        src={`/star-shape.png`}
        className="pointer-events-none absolute inset-0 aspect-auto"
        unoptimized
        alt="..."
      />
    </Card>
  );
}
