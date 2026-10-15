'use client';

import { useEffect, useState } from "react";
import { pricingPlansApi } from "@/lib/api";
import PricingPlansDataTable, { PricingPlan } from "./data-table";

export default function Page() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getPricingPlans = async () => {
    try {
      setIsLoading(true);
      const data = await pricingPlansApi.getPricingPlans();
      setPlans(data);
    } catch (error) {
      console.error('Failed to fetch pricing plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getPricingPlans();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Pricing Plans</h1>
          <p className="text-muted-foreground">
            Manage pricing plans and their features. Plans are organized by industry.
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading pricing plans...</p>
        </div>
      ) : (
        <PricingPlansDataTable data={plans} onRefresh={getPricingPlans} />
      )}
    </>
  );
}



















































