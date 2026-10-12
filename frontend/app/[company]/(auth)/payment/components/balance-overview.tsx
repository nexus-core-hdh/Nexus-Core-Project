"use client";

import { useMemo } from "react";
import { ChevronRight, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { NotificationBanner } from "@/app/[company]/(auth)/payment/components/notification-banner";

interface BalanceOverviewProps {
  customerPayments?: any[];
  supplierPayments?: any[];
  loading?: boolean;
}

export function BalanceOverview({ customerPayments = [], supplierPayments = [], loading = false }: BalanceOverviewProps) {
  // Calculate balances by currency
  const balances = useMemo(() => {
    const balanceMap: Record<string, number> = {
      USD: 0,
      EUR: 0,
      GBP: 0
    };

    // Add customer payments (incoming money)
    customerPayments.forEach((payment: any) => {
      if (payment.status === "COMPLETED") {
        // Assume USD for now, could be extended to support multiple currencies
        const currency = "USD";
        balanceMap[currency] = (balanceMap[currency] || 0) + (payment.amount || 0);
      }
    });

    // Subtract supplier payments (outgoing money)
    supplierPayments.forEach((payment: any) => {
      if (payment.status === "COMPLETED") {
        // Assume USD for now
        const currency = "USD";
        balanceMap[currency] = (balanceMap[currency] || 0) - (payment.amount || 0);
      }
    });

    return [
      { 
        currency: "USD", 
        amount: balanceMap.USD.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","), 
        flag: "🇺🇸",
        value: balanceMap.USD
      },
      { 
        currency: "EUR", 
        amount: balanceMap.EUR.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","), 
        flag: "🇪🇺",
        value: balanceMap.EUR
      },
      { 
        currency: "GBP", 
        amount: balanceMap.GBP.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","), 
        flag: "🇬🇧",
        value: balanceMap.GBP
      }
    ];
  }, [customerPayments, supplierPayments]);

  // Calculate total in USD (simplified - in real app would convert currencies)
  const totalUSD = useMemo(() => {
    return balances.reduce((sum, balance) => sum + balance.value, 0);
  }, [balances]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-lg font-bold tracking-tight">Balances</h1>
          {!loading && (
            <div className="text-muted-foreground flex items-center space-x-2 text-sm">
              Total funds in all balances: {totalUSD.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} USD
            </div>
          )}
        </div>
      </div>

      <NotificationBanner />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {balances.map((balance) => (
          <Card
            key={balance.currency}
            className={`cursor-pointer transition-shadow hover:shadow-md`}>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{balance.flag}</span>
                  <div>
                    <div className="text-foreground text-2xl font-bold">
                      {loading ? "..." : `${balance.amount} ${balance.currency}`}
                    </div>
                  </div>
                </div>
                <ChevronRight className="text-muted-foreground h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
