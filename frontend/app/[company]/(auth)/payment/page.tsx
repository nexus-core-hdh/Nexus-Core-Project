"use client";

import { useEffect, useState } from "react";
import { BalanceOverview } from "./components/balance-overview";
import { TransactionHistory } from "./components/transaction-history";
import { ExchangeRates } from "./components/exchange-rates";
import { customerPaymentApi, supplierPaymentApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);

  useEffect(() => {
    fetchPaymentData();
  }, []);

  const fetchPaymentData = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) return;

      const params = {
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined
      };

      // Fetch both customer and supplier payments in parallel
      const [customerPaymentsData, supplierPaymentsData] = await Promise.all([
        customerPaymentApi.getCustomerPayments(params).catch(() => []),
        supplierPaymentApi.getSupplierPayments(params).catch(() => [])
      ]);

      setCustomerPayments(customerPaymentsData || []);
      setSupplierPayments(supplierPaymentsData || []);
    } catch (error: any) {
      console.error("Error fetching payment data:", error);
      toast.error("Failed to fetch payment data", {
        description: error.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <BalanceOverview 
          customerPayments={customerPayments}
          supplierPayments={supplierPayments}
          loading={loading}
        />
        <TransactionHistory 
          customerPayments={customerPayments}
          supplierPayments={supplierPayments}
          loading={loading}
        />
      </div>
      <div className="space-y-4">
        <ExchangeRates />
      </div>
    </div>
  );
}
