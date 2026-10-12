"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import Link from "@/components/app-link";

import { Card, CardContent, CardFooter } from "@/components/ui/card";

interface StatCardsProps {
  orders?: any[];
  customers?: any[];
  loading?: boolean;
}

export default function StatCards({ orders = [], customers = [], loading = false }: StatCardsProps) {
  // Calculate monthly recurring revenue (sum of all orders this month)
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return orders
      .filter((order: any) => {
        const orderDate = new Date(order.orderDate || order.createdAt);
        return orderDate >= startOfMonth && order.status === "PAID";
      })
      .reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);
  }, [orders]);

  // Calculate total users/customers
  const totalUsers = useMemo(() => {
    return customers.length;
  }, [customers]);

  // Calculate user growth (simplified - compare with previous month)
  const userGrowth = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const thisMonthCustomers = customers.filter((customer: any) => {
      const customerDate = new Date(customer.createdAt);
      return customerDate >= startOfMonth;
    }).length;
    
    const lastMonthCustomers = customers.filter((customer: any) => {
      const customerDate = new Date(customer.createdAt);
      return customerDate >= startOfLastMonth && customerDate < startOfMonth;
    }).length;
    
    if (lastMonthCustomers === 0) return 0;
    return ((thisMonthCustomers - lastMonthCustomers) / lastMonthCustomers) * 100;
  }, [customers]);

  const data = useMemo(() => [
    {
      name: "Monthly recurring revenue",
      value: `$${(monthlyRevenue / 1000).toFixed(1)}K`,
      change: "+6.1%", // Placeholder - could calculate from previous month
      changeType: "positive" as "positive" | "negative",
      href: "#"
    },
    {
      name: "Users",
      value: `${(totalUsers / 1000).toFixed(1)}K`,
      change: "+19.2%", // Placeholder
      changeType: "positive" as "positive" | "negative",
      href: "#"
    },
    {
      name: "User growth",
      value: `${userGrowth.toFixed(1)}%`,
      change: userGrowth >= 0 ? `+${userGrowth.toFixed(1)}%` : `${userGrowth.toFixed(1)}%`,
      changeType: (userGrowth >= 0 ? "positive" : "negative") as "positive" | "negative",
      href: "#"
    }
  ], [monthlyRevenue, totalUsers, userGrowth]);

  return (
    <div className="flex w-full items-center justify-center">
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        {data.map((item) => (
          <Card key={item.name} className="py-0">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start justify-between space-x-2">
                <span className="text-muted-foreground truncate text-sm">{item.name}</span>
                {!loading && (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      item.changeType === "positive"
                        ? "text-emerald-700 dark:text-emerald-500"
                        : "text-red-700 dark:text-red-500"
                    )}>
                    {item.change}
                  </span>
                )}
              </div>
              <dd className="text-foreground mt-1 text-3xl font-semibold">
                {loading ? "..." : item.value}
              </dd>
            </CardContent>
            <CardFooter className="border-border flex justify-end border-t p-0!">
              <Link
                href="#"
                className="text-primary hover:text-primary/90 flex items-center px-6 py-3 text-sm font-medium">
                View more <ArrowRightIcon className="ms-2 size-4" />
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
