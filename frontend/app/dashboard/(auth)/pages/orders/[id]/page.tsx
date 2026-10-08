"use client";

import { useEffect, useState, use } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  EditIcon,
  Package,
  Pencil,
  Printer,
  Truck,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { generateMeta } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { orderApi } from "@/lib/api";
import { format } from "date-fns";
import { toast } from "sonner";
import { ReturnOrderDialog } from "../components/return-order-dialog";
import { UpdateOrderStatusDialog } from "../components/update-order-status-dialog";

type OrderStatus = "PENDING" | "PROCESSING" | "PAID" | "SHIPPED" | "DELIVERED" | "COMPLETED" | "CANCELLED" | "FAILED";

interface Order {
  id: number;
  orderNumber: string;
  customerId: number;
  customer: {
    id: number;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  status: OrderStatus;
  type: string;
  totalAmount: number;
  subtotal: number;
  tax?: number;
  discount?: number;
  shippingCost?: number;
  currency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  shippingAddress?: string;
  notes?: string;
  orderDate: string;
  shippedDate?: string;
  deliveredDate?: string;
  items: Array<{
    id: number;
    productId: number;
    product: {
      id: number;
      name: string;
      image?: string;
      sku?: string;
    };
    quantity: number;
    returnedQuantity?: number;
    price: number;
    discount?: number;
    subtotal: number;
  }>;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  useWorkspaceRecordLabel(order?.orderNumber || undefined);
  const [loading, setLoading] = useState(true);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [resolvedParams.id]);

  useEffect(() => {
    // Auto-open return dialog if hash is present
    if (window.location.hash === "#return" && order && canReturn() && hasReturnableItems()) {
      setReturnDialogOpen(true);
      // Remove hash from URL
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Auto-open status dialog if hash is present
    if (window.location.hash === "#status" && order) {
      setStatusDialogOpen(true);
      // Remove hash from URL
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [order]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await orderApi.getOrderById(parseInt(resolvedParams.id));
      setOrder(data);
    } catch (error: any) {
      console.error("Error loading order:", error);
      toast.error("Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  const statusSteps: Record<string, string> = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    PAID: "Paid",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    COMPLETED: "Completed",
  };

  const getStatusIndex = (status: OrderStatus): number => {
    const statusOrder = ["PENDING", "PROCESSING", "PAID", "SHIPPED", "DELIVERED", "COMPLETED"];
    return statusOrder.indexOf(status);
  };

  const canReturn = (): boolean => {
    if (!order) return false;
    // Can return if order is paid, shipped, delivered, or completed
    // Cannot return if order is pending, cancelled, or failed
    const returnableStatuses = ["PAID", "SHIPPED", "DELIVERED", "COMPLETED"];
    return returnableStatuses.includes(order.status);
  };

  const hasReturnableItems = (): boolean => {
    if (!order) return false;
    return order.items.some(
      (item) => (item.returnedQuantity || 0) < item.quantity
    );
  };

  const handlePrint = () => {
    if (!order) return;
    window.print();
  };

  const handleEdit = () => {
    if (!order) return;
    // Navigate to POS system with order ID to load it for editing
    window.location.href = `/dashboard/apps/pos-system?orderId=${order.id}`;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Order not found</p>
      </div>
    );
  }

  const currentStepIndex = getStatusIndex(order.status);
  const progressValue = (currentStepIndex / (Object.keys(statusSteps).length - 1)) * 100;

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            margin: 1cm;
          }
          body {
            background: white;
          }
          body * {
            visibility: hidden;
          }
          .print-section,
          .print-section * {
            visibility: visible;
          }
          .print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
          .print-section .print-grid {
            display: flex !important;
            flex-direction: column !important;
            margin-bottom: 2rem;
          }
          .print-section .print-grid > * {
            display: block !important;
            width: 100% !important;
            margin-bottom: 1.5rem !important;
            page-break-inside: avoid;
            position: relative !important;
          }
          /* Reorder for print: Customer Info (1), Order Items (2), Order Summary (3) */
          .print-section .print-customer-info {
            order: 1 !important;
          }
          .print-section .print-order-items {
            order: 2 !important;
          }
          .print-section .print-order-summary {
            order: 3 !important;
          }
          .print-section .print-card {
            page-break-inside: avoid;
            margin-bottom: 1.5rem !important;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 1rem;
            display: block !important;
            position: relative !important;
            width: 100% !important;
          }
          .print-section table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.5rem;
          }
          .print-section th,
          .print-section td {
            border: 1px solid #e5e7eb;
            padding: 0.5rem;
            text-align: left;
          }
          .print-section th {
            background-color: #f9fafb;
            font-weight: 600;
          }
        }
      `}</style>
      <div className="mx-auto max-w-screen-lg space-y-4 lg:mt-10">
      <div className="flex items-center justify-between no-print">
        <Button asChild variant="outline">
          <Link href="/dashboard/pages/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex gap-2">
          {canReturn() && hasReturnableItems() && (
            <Button onClick={() => setReturnDialogOpen(true)} className="bg-orange-600 hover:bg-orange-700">
              <RotateCcw className="mr-2 h-4 w-4" />
              Return Order
            </Button>
          )}
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={() => handleEdit()}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      <div className="print-section">
        <div className="grid gap-4 md:grid-cols-2 print-grid">
          <Card className="print-card print-customer-info">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Order {order.orderNumber}</CardTitle>
              <p className="text-muted-foreground text-sm no-print">
                Placed on {format(new Date(order.orderDate), "MMM dd, yyyy")}
              </p>
            </CardHeader>
            <CardContent>
              <Separator className="mb-4" />
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="font-medium">Customer Information</h3>
                  <p className="text-muted-foreground text-sm">{order.customer.name}</p>
                  {order.customer.email && (
                    <p className="text-muted-foreground text-sm">{order.customer.email}</p>
                  )}
                  {order.customer.phone && (
                    <p className="text-muted-foreground text-sm">{order.customer.phone}</p>
                  )}
                  {order.shippingAddress && (
                    <p className="text-muted-foreground text-sm">{order.shippingAddress}</p>
                  )}
                </div>
                <div className="bg-muted flex items-center justify-between space-y-2 rounded-md border p-4 no-print">
                  <div className="space-y-1">
                    <h4 className="font-medium">Payment Method</h4>
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <CreditCard className="size-4" />{" "}
                      {order.paymentMethod || "Not specified"}
                    </div>
                    {order.paymentStatus && (
                      <Badge variant={order.paymentStatus === "paid" ? "success" : "warning"}>
                        {order.paymentStatus}
                      </Badge>
                    )}
                  </div>
                  <Button variant="outline">
                    <EditIcon />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print-card print-order-summary">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              {order.tax && order.tax > 0 && (
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>${order.tax.toFixed(2)}</span>
                </div>
              )}
              {order.discount && order.discount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-${order.discount.toFixed(2)}</span>
                </div>
              )}
              {order.shippingCost && order.shippingCost > 0 && (
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>${order.shippingCost.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>${order.totalAmount.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="print-card print-order-items">
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">Price</TableHead>
                  <TableHead className="text-end">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => {
                  const returnedQty = item.returnedQuantity || 0;
                  const availableQty = item.quantity - returnedQty;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-4">
                          {(() => {
                            let imageSrc = "/images/products/01.jpeg"; // Default fallback
                            if (item.product.image) {
                              const img = item.product.image;
                              // Handle blob URLs, data URLs, and full HTTP/HTTPS URLs
                              if (img.startsWith("blob:") || img.startsWith("data:") || img.startsWith("http://") || img.startsWith("https://")) {
                                imageSrc = img;
                              } else if (img.startsWith("files/")) {
                                // Server-stored file path - prepend API base URL
                                const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
                                imageSrc = `${API_BASE_URL}/${img}`;
                              } else if (img.startsWith("/images") || img.startsWith("/")) {
                                // Already a valid path starting with /
                                imageSrc = img;
                              } else {
                                // Relative path, prepend /images
                                imageSrc = `/images${img}`;
                              }
                            }
                            return (
                              <Image
                                src={imageSrc}
                                width={60}
                                height={60}
                                className="h-10 w-10 rounded-md lg:h-16 lg:w-16 object-cover"
                                alt={item.product.name}
                                unoptimized
                                onError={(e) => {
                                  // Fallback to default image on error
                                  const target = e.target as HTMLImageElement;
                                  const fallbackSrc = "/images/products/01.jpeg";
                                  if (!target.src.includes(fallbackSrc)) {
                                    target.src = fallbackSrc;
                                  }
                                }}
                              />
                            );
                          })()}
                          <div>
                            <span className="font-medium">{item.product.name}</span>
                            {item.product.sku && (
                              <div className="text-sm text-muted-foreground">
                                SKU: {item.product.sku}
                              </div>
                            )}
                            {returnedQty > 0 && (
                              <div className="text-sm text-orange-600">
                                {returnedQty} returned
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <div>{item.quantity}</div>
                          {returnedQty > 0 && (
                            <div className="text-xs text-muted-foreground">
                              ({availableQty} available)
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">${item.price.toFixed(2)}</TableCell>
                      <TableCell className="text-end">
                        ${item.subtotal.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="no-print">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">Delivery Status</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusDialogOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Change Status
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-6 pt-1">
            <div className="mb-2 flex items-center justify-between">
              {Object.keys(statusSteps).map((step, index) => {
                const isActive = index <= currentStepIndex;
                return (
                  <div key={index} className="text-center">
                    <div
                      className={`mx-auto flex size-10 items-center justify-center rounded-full text-lg lg:size-12 ${
                        isActive
                          ? "bg-green-500 text-white dark:bg-green-900"
                          : "bg-muted border"
                      }`}
                    >
                      {index < currentStepIndex ? (
                        <CheckCircle className="size-4 lg:size-5" />
                      ) : (
                        {
                          PENDING: <Package className="size-4 lg:size-5" />,
                          PROCESSING: <Package className="size-4 lg:size-5" />,
                          PAID: <CheckCircle2 className="size-4 lg:size-5" />,
                          SHIPPED: <Truck className="size-4 lg:size-5" />,
                          DELIVERED: <Truck className="size-4 lg:size-5" />,
                          COMPLETED: <CheckCircle2 className="size-4 lg:size-5" />,
                        }[step] || <Package className="size-4 lg:size-5" />
                      )}
                    </div>
                    <div className="mt-2 text-xs">{statusSteps[step]}</div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-6">
              <Progress className="w-full" value={progressValue} />
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-xs flex items-center gap-2">
                  <Badge 
                    variant="info" 
                    className="me-1 cursor-pointer hover:opacity-80"
                    onClick={() => setStatusDialogOpen(true)}
                  >
                    {statusSteps[order.status] || order.status}
                  </Badge>
                  {order.deliveredDate
                    ? ` on ${format(new Date(order.deliveredDate), "MMM dd, yyyy")}`
                    : order.shippedDate
                    ? ` on ${format(new Date(order.shippedDate), "MMM dd, yyyy")}`
                    : ""}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Return Order Dialog */}
      {order && (
        <div className="no-print">
          <ReturnOrderDialog
            open={returnDialogOpen}
            onOpenChange={setReturnDialogOpen}
            order={order}
            onReturnCreated={() => {
              loadOrder();
              toast.success("Return created successfully");
            }}
          />
        </div>
      )}

      {/* Update Order Status Dialog */}
      {order && (
        <div className="no-print">
          <UpdateOrderStatusDialog
            open={statusDialogOpen}
            onOpenChange={setStatusDialogOpen}
            orderId={order.id}
            currentStatus={order.status}
            onStatusUpdated={() => {
              loadOrder();
            }}
          />
        </div>
      )}
      </div>
    </>
  );
}
