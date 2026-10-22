"use client";

import { useEffect, useState } from "react";
import { cn, generateMeta } from "@/lib/utils";
import { 
  ChevronRightIcon, 
  Download, 
  List, 
  CheckCircle2, 
  Clock, 
  XCircle 
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import CalendarDateRangePicker from "@/components/custom-date-range-picker";
import { customerPaymentApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

type CustomerPayment = {
  id: number;
  paymentNumber: string;
  customer: {
    id: number;
    name: string;
    email?: string;
  };
  order?: {
    id: number;
    orderNumber: string;
  } | null;
  amount: number;
  paymentMethod: string;
  status: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
};

export default function CustomerPaymentsPage() {
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");

  useEffect(() => {
    fetchPayments();
  }, [filter]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) return;

      const params: any = {
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      };

      if (filter !== "all") {
        params.status = filter.toUpperCase();
      }

      const data = await customerPaymentApi.getCustomerPayments(params);
      setPayments(data || []);
    } catch (error: any) {
      console.error("Error fetching customer payments:", error);
      toast.error("Failed to fetch customer payments", {
        description: error.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatAmount = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return "text-green-600";
      case "PENDING":
        return "text-yellow-600";
      case "FAILED":
        return "text-red-600";
      case "CANCELLED":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "CASH":
        return "Cash";
      case "CARD":
        return "Card";
      case "BANK_TRANSFER":
        return "Bank Transfer";
      case "CHEQUE":
        return "Cheque";
      case "OTHER":
        return "Other";
      default:
        return method;
    }
  };

  const filteredPayments = payments.filter((payment) => {
    if (filter === "all") return true;
    return payment.status.toUpperCase() === filter.toUpperCase();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Customer Payments</h1>
        <div className="flex items-center space-x-2">
          <CalendarDateRangePicker />
          <Button size="icon">
            <Download />
          </Button>
        </div>
      </div>
      <Tabs defaultValue="latest" value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList className="mb-2">
          <TabsTrigger value="all">
            <List className="mr-2 h-4 w-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="completed">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="mr-2 h-4 w-4" />
            Pending
          </TabsTrigger>
          <TabsTrigger value="failed">
            <XCircle className="mr-2 h-4 w-4" />
            Failed
          </TabsTrigger>
        </TabsList>

        <Card className="p-0">
          <CardContent className="p-0">
            <TabsContent value={filter}>
              {loading ? (
                <div className="text-muted-foreground px-4 py-10 text-center text-sm">
                  Loading payments...
                </div>
              ) : filteredPayments.length === 0 ? (
                <p className="text-muted-foreground px-4 py-4 text-center text-sm lg:py-10">
                  No payments found.
                </p>
              ) : (
                <div className="space-y-0">
                  <Table>
                    <TableBody>
                      {filteredPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="w-36 ps-6">{formatDate(payment.paymentDate)}</TableCell>
                          <TableCell>
                            <div>
                              <div className="text-foreground font-medium">
                                Payment from {payment.customer.name}
                                {payment.order && ` - Order #${payment.order.orderNumber}`}
                              </div>
                              <div className="text-muted-foreground text-sm">
                                {getPaymentMethodLabel(payment.paymentMethod)} •{" "}
                                <span className={cn(getStatusColor(payment.status))}>
                                  {payment.status}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="pe-6">
                            <div className="flex items-center justify-end space-x-4">
                              <span className="text-green-600">{formatAmount(payment.amount)}</span>
                              <Button variant="outline" size="sm">
                                <ChevronRightIcon />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}



