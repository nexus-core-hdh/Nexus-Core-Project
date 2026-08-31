"use client";

import Link from "next/link";
import { Zap, ShoppingBag, ShoppingCart, PackagePlus, UserPlus, Truck, UsersRound } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const actions = [
  { label: "Create Sale", href: "/dashboard/sales", icon: ShoppingBag, style: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
  { label: "Create Purchase", href: "/dashboard/legacy-erp/purchase-orders", icon: ShoppingCart, style: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
  { label: "Add Item", href: "/dashboard/plm/product-cards", icon: PackagePlus, style: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400" },
  { label: "Add Customer", href: "/dashboard/crm/customers", icon: UserPlus, style: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
  { label: "Add Supplier", href: "/dashboard/crm/contacts", icon: Truck, style: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
  { label: "Add User", href: "/dashboard/pages/users", icon: UsersRound, style: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" }
];

export function QuickActions() {
  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="text-primary size-4" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div className="grid grid-cols-3 gap-2">
          {actions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors">
              <div className={cn("flex size-9 items-center justify-center rounded-lg", a.style)}>
                <a.icon className="size-4" />
              </div>
              <span className="text-xs leading-tight font-medium">{a.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
