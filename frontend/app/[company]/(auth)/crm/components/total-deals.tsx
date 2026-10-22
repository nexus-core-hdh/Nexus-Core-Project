"use client";

import { BriefcaseBusiness } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader } from "@/components/ui/card";

interface TotalDealsProps {
  deals?: any[];
  loading?: boolean;
}

export function TotalDeals({ deals = [], loading = false }: TotalDealsProps) {
  const totalDeals = deals?.length || 0;
  
  // Calculate growth (simplified)
  const growth = 0; // Placeholder for growth calculation

  return (
    <Card>
      <CardHeader>
        <CardDescription>Total Deals</CardDescription>
        <div className="flex flex-col gap-2">
          <h4 className="font-display text-2xl lg:text-3xl">
            {loading ? "..." : totalDeals.toLocaleString()}
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
              <BriefcaseBusiness className="size-5" />
            </div>
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
