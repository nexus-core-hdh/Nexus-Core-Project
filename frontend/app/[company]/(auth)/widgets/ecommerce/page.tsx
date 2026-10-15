"use client";

import { Metadata } from "next";
import { EcommerceRecentOrdersCard } from "./components/recent-orders-card";
import { EcommerceBestSellingProductsCard } from "./components/best-selling-products-card";
import { EcommerceTotalRevenueCard } from "./components/total-revenue-card";
import { EcommerceNewCustomersCard } from "./components/new-customers-card";

export default function EcommerceWidgetsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">E-Commerce Widgets</h1>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-12">
          <EcommerceNewCustomersCard />
        </div>
        <div className="space-y-4 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
          <EcommerceTotalRevenueCard />
        </div>
        <div className="space-y-4 xl:grid xl:grid-cols-12 xl:gap-4 xl:space-y-0">
          <EcommerceRecentOrdersCard />
          <EcommerceBestSellingProductsCard />
        </div>
      </div>
    </div>
  );
}
