"use client";

import { Users2Icon } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader } from "@/components/ui/card";

interface TotalCustomersCardProps {
  customers?: any[];
  loading?: boolean;
}

export function TotalCustomersCard({ customers = [], loading = false }: TotalCustomersCardProps) {
  const totalCustomers = customers?.length || 0;
  
  // Calculate growth (simplified - compare with previous month)
  // In a real scenario, you'd fetch previous month's data
  const growth = 0; // Placeholder for growth calculation

  return (
    <Card>
      <CardHeader>
        <CardDescription>Total Customers</CardDescription>
        <div className="flex flex-col gap-2">
          <h4 className="font-display text-2xl lg:text-3xl">
            {loading ? "..." : totalCustomers.toLocaleString()}
          </h4>
          {!loading && (
            <div className="text-muted-foreground text-sm">
              {growth > 0 ? (
                <span className="text-green-600">+{growth.toFixed(1)}%</span>
              ) : growth < 0 ? (
                <span className="text-red-600">{growth.toFixed(1)}%</span>
              ) : (
                <span>No change</span>
              )} from last month
            </div>
          )}
        </div>
        <CardAction>
          <div className="flex gap-4">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full border">
              <Users2Icon className="size-5" />
            </div>
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
