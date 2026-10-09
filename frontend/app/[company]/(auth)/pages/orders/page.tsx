"use client";

import { useEffect, useState } from "react";
import Link from "@/components/app-link";
import { PlusIcon } from "@radix-ui/react-icons";
import { generateMeta } from "@/lib/utils";
import { 
  ShoppingBag, 
  CheckCircle2, 
  Package, 
  RotateCcw, 
  XCircle,
  Loader2 
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OrdersDataTable from "./data-table";
import { orderApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { format } from "date-fns";

export default function Page() {
  const [orders, setOrders] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        if (!user) return;

        // `orderApi.getOrders` is scoped server-side via auth; it doesn't accept company/branch filters.
        const data = await orderApi.getOrders();

        // Transform API data to match UI format
        const transformedOrders = data.map((order: any) => {
          // Count items in the order
          const itemsCount = order.items?.length || 0;
          const totalQuantity = order.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

          // Map database status to UI status
          let uiStatus: "active" | "transportation" | "pending" | "completed" | "cancel" = "pending";
          if (order.status === "DELIVERED" || order.status === "COMPLETED") {
            uiStatus = "completed";
          } else if (order.status === "PROCESSING" || order.status === "SHIPPED") {
            uiStatus = "transportation";
          } else if (order.status === "PENDING") {
            uiStatus = "pending";
          } else if (order.status === "PAID") {
            uiStatus = "active";
          } else if (order.status === "CANCELLED" || order.status === "FAILED") {
            uiStatus = "cancel";
          }

          // Check if order type is RETURN for "returned" status
          if (order.type === "RETURN") {
            uiStatus = "cancel"; // Use cancel for returned in UI
          }

          return {
            id: order.id,
            itemsCount: itemsCount,
            totalQuantity: totalQuantity,
            customer: {
              name: order.customer?.name || "Unknown",
              email: order.customer?.email || ""
            },
            price: `$${order.totalAmount?.toFixed(2) || "0.00"}`,
            status: uiStatus,
            date: order.orderDate ? format(new Date(order.orderDate), "MMM dd, yyyy") : "",
            type: order.type || "SALE",
            _dbStatus: order.status, // Keep original status for filtering
            _dbType: order.type // Keep original type for filtering
          };
        });

        setOrders(transformedOrders);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    // Filter orders based on active tab
    let filtered = orders;

    switch (activeTab) {
      case "completed":
        filtered = orders.filter((order) => order._dbStatus === "DELIVERED");
        break;
      case "processed":
        filtered = orders.filter((order) => 
          order._dbStatus === "PROCESSING" || order._dbStatus === "SHIPPED"
        );
        break;
      case "returned":
        filtered = orders.filter((order) => order._dbType === "RETURN");
        break;
      case "canceled":
        filtered = orders.filter((order) => 
          order._dbStatus === "CANCELLED" || order._dbStatus === "FAILED" || order.status === "cancel"
        );
        break;
      case "overview":
      default:
        filtered = orders;
        break;
    }

    setFilteredOrders(filtered);
  }, [activeTab, orders]);

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Orders</h1>
        <Button asChild>
          <Link href="#">
            <PlusIcon /> Create Order
          </Link>
        </Button>
      </div>
      {!mounted ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              All
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="processed" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Processed
            </TabsTrigger>
            <TabsTrigger value="returned" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Returned
            </TabsTrigger>
            <TabsTrigger value="canceled" className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Canceled
            </TabsTrigger>
          </TabsList>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="overview">
                <OrdersDataTable data={filteredOrders} />
              </TabsContent>
              <TabsContent value="completed">
                <OrdersDataTable data={filteredOrders} />
              </TabsContent>
              <TabsContent value="processed">
                <OrdersDataTable data={filteredOrders} />
              </TabsContent>
              <TabsContent value="returned">
                <OrdersDataTable data={filteredOrders} />
              </TabsContent>
              <TabsContent value="canceled">
                <OrdersDataTable data={filteredOrders} />
              </TabsContent>
            </>
          )}
        </Tabs>
      )}
    </div>
  );
}
