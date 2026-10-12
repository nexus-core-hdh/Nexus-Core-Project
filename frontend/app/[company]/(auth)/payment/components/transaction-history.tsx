"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronRightIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import Link from "@/components/app-link";
import { format } from "date-fns";

interface TransactionHistoryProps {
  customerPayments?: any[];
  supplierPayments?: any[];
  loading?: boolean;
}

export function TransactionHistory({ customerPayments = [], supplierPayments = [], loading = false }: TransactionHistoryProps) {
  const [activeTab, setActiveTab] = useState("latest");

  // Transform and combine payments into transactions
  const transactions = useMemo(() => {
    const allTransactions: any[] = [];

    // Add customer payments (incoming)
    customerPayments.forEach((payment: any) => {
      allTransactions.push({
        id: `customer-${payment.id}`,
        date: payment.createdAt || payment.paymentDate,
        description: payment.order 
          ? `Payment from ${payment.customer?.name || "Customer"} - Order #${payment.order.orderNumber || payment.order.id}`
          : `Payment from ${payment.customer?.name || "Customer"}`,
        status: payment.status === "COMPLETED" ? "Completed" : payment.status,
        amount: payment.amount || 0,
        type: "payment",
        originalPayment: payment
      });
    });

    // Add supplier payments (outgoing)
    supplierPayments.forEach((payment: any) => {
      allTransactions.push({
        id: `supplier-${payment.id}`,
        date: payment.createdAt || payment.paymentDate,
        description: `Payment to ${payment.supplier?.name || "Supplier"}`,
        status: payment.status === "COMPLETED" ? "Completed" : payment.status,
        amount: payment.amount || 0,
        type: "withdrawal",
        originalPayment: payment
      });
    });

    // Sort by date (newest first)
    return allTransactions.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [customerPayments, supplierPayments]);

  // Filter transactions based on tab
  const filteredTransactions = useMemo(() => {
    if (activeTab === "latest") {
      return transactions.slice(0, 10); // Show latest 10
    } else {
      // For "upcoming", show pending payments
      return transactions.filter(t => t.status !== "COMPLETED");
    }
  }, [transactions, activeTab]);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd MMM yyyy");
    } catch {
      return dateString;
    }
  };

  const formatAmount = (amount: number, type: string) => {
    const sign = type === "payment" ? "+" : "-";
    return `${sign}${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} USD`;
  };
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>Updated every several minutes</CardDescription>
        <CardAction>
          <Button variant="ghost" asChild>
            <Link href="/payment/transactions">
              View all
              <ChevronRightIcon />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0!">
          <TabsList className="h-auto rounded-none bg-transparent p-0 ps-6">
            <TabsTrigger
              value="latest"
              className="data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Latest
            </TabsTrigger>
            <TabsTrigger
              value="upcoming"
              className="data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Upcoming
            </TabsTrigger>
          </TabsList>
          <Separator className="-mt-0.5" />
          <TabsContent value="latest">
            {loading ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground px-4 py-4 text-center text-sm lg:py-10">
                No transactions found.
              </p>
            ) : (
              <div className="space-y-0">
                <Table>
                  <TableBody>
                    {filteredTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="w-36 ps-6">{formatDate(transaction.date)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="text-foreground font-medium">
                              {transaction.description}
                            </div>
                            <div className="text-muted-foreground text-sm">{transaction.status}</div>
                          </div>
                        </TableCell>
                        <TableCell className="pe-6">
                          <div className="flex items-center justify-end space-x-4">
                            <span
                              className={cn({
                                "text-green-600": transaction.type === "payment",
                                "text-red-400": transaction.type === "withdrawal"
                              })}>
                              {formatAmount(transaction.amount, transaction.type)}
                            </span>
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
          <TabsContent value="upcoming">
            {loading ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground px-4 py-4 text-center text-sm lg:py-10">
                Nothing to see here right now.
              </p>
            ) : (
              <div className="space-y-0">
                <Table>
                  <TableBody>
                    {filteredTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="w-36 ps-6">{formatDate(transaction.date)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="text-foreground font-medium">
                              {transaction.description}
                            </div>
                            <div className="text-muted-foreground text-sm">{transaction.status}</div>
                          </div>
                        </TableCell>
                        <TableCell className="pe-6">
                          <div className="flex items-center justify-end space-x-4">
                            <span
                              className={cn({
                                "text-green-600": transaction.type === "payment",
                                "text-red-400": transaction.type === "withdrawal"
                              })}>
                              {formatAmount(transaction.amount, transaction.type)}
                            </span>
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
