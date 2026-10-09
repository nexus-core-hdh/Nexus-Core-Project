"use client";

import * as React from "react";
import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Filter,
  Package,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  AlertCircle,
  DollarSign,
  Calendar,
  User,
} from "lucide-react";
import { orderApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

type ReturnStatus = "PENDING" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "CANCELLED";
type ReturnReason = "DEFECTIVE" | "DAMAGED" | "WRONG_ITEM" | "NOT_AS_DESCRIBED" | "CUSTOMER_CHANGE_MIND" | "LATE_DELIVERY" | "DUPLICATE_ORDER" | "OTHER";

interface OrderReturn {
  id: number;
  returnNumber: string;
  orderId: number;
  order: {
    id: number;
    orderNumber: string;
    customer: {
      id: number;
      name: string;
      email?: string;
    };
  };
  customer: {
    id: number;
    name: string;
    email?: string;
  };
  status: ReturnStatus;
  returnReason: ReturnReason;
  returnReasonNote?: string;
  returnDate: string;
  processedDate?: string;
  refundAmount: number;
  refundMethod?: string;
  refundStatus?: string;
  refundReference?: string;
  items: Array<{
    id: number;
    product: {
      id: number;
      name: string;
      sku?: string;
    };
    quantity: number;
    price: number;
    refundAmount: number;
    reason?: ReturnReason;
    condition?: string;
  }>;
  notes?: string;
  processedBy?: {
    id: number;
    name: string;
    email: string;
  };
}

const STATUS_COLORS: Record<ReturnStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PROCESSING: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const RETURN_REASONS: Record<ReturnReason, string> = {
  DEFECTIVE: "Defective Product",
  DAMAGED: "Damaged in Transit",
  WRONG_ITEM: "Wrong Item Received",
  NOT_AS_DESCRIBED: "Not as Described",
  CUSTOMER_CHANGE_MIND: "Customer Changed Mind",
  LATE_DELIVERY: "Late Delivery",
  DUPLICATE_ORDER: "Duplicate Order",
  OTHER: "Other",
};

export default function ReturnsPage() {
  const [returns, setReturns] = useState<OrderReturn[]>([]);
  const [filteredReturns, setFilteredReturns] = useState<OrderReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReturn, setSelectedReturn] = useState<OrderReturn | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [refundStatus, setRefundStatus] = useState<string>("");
  const [refundReference, setRefundReference] = useState("");

  useEffect(() => {
    loadReturns();
  }, []);

  useEffect(() => {
    filterReturns();
  }, [returns, searchQuery, statusFilter]);

  const loadReturns = async () => {
    try {
      setLoading(true);
      const data = await orderApi.getOrderReturns();
      setReturns(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading returns:", error);
      toast.error("Failed to load returns");
    } finally {
      setLoading(false);
    }
  };

  const filterReturns = () => {
    let filtered = returns;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.returnNumber.toLowerCase().includes(query) ||
          r.order.orderNumber.toLowerCase().includes(query) ||
          r.customer.name.toLowerCase().includes(query) ||
          r.customer.email?.toLowerCase().includes(query)
      );
    }

    setFilteredReturns(filtered);
  };

  const handleProcessReturn = async (returnId: number, approve: boolean, reject: boolean) => {
    try {
      setProcessing(true);
      await orderApi.processOrderReturn(returnId, {
        approve,
        reject,
        refundStatus: refundStatus || undefined,
        refundReference: refundReference || undefined,
      });
      toast.success(`Return ${approve ? "approved" : reject ? "rejected" : "processed"} successfully`);
      setProcessDialogOpen(false);
      setRefundStatus("");
      setRefundReference("");
      await loadReturns();
    } catch (error: any) {
      console.error("Error processing return:", error);
      toast.error(error.message || "Failed to process return");
    } finally {
      setProcessing(false);
    }
  };

  const openDetailDialog = (returnItem: OrderReturn) => {
    setSelectedReturn(returnItem);
    setDetailDialogOpen(true);
  };

  const openProcessDialog = (returnItem: OrderReturn) => {
    setSelectedReturn(returnItem);
    setProcessDialogOpen(true);
    setRefundStatus(returnItem.refundStatus || "");
    setRefundReference(returnItem.refundReference || "");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Returns Management</h1>
        <Button onClick={loadReturns} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by return number, order number, or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Returns ({filteredReturns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              No returns found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return Number</TableHead>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Refund Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Return Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((returnItem) => (
                    <TableRow key={returnItem.id}>
                      <TableCell className="font-medium">
                        {returnItem.returnNumber}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/pages/orders/${returnItem.orderId}`}
                          className="text-primary hover:underline"
                        >
                          {returnItem.order.orderNumber}
                        </a>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{returnItem.customer.name}</div>
                          {returnItem.customer.email && (
                            <div className="text-sm text-muted-foreground">
                              {returnItem.customer.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {RETURN_REASONS[returnItem.returnReason] || returnItem.returnReason}
                      </TableCell>
                      <TableCell className="font-medium">
                        ${returnItem.refundAmount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[returnItem.status]}>
                          {returnItem.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(returnItem.returnDate), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetailDialog(returnItem)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(returnItem.status === "PENDING" || returnItem.status === "APPROVED") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openProcessDialog(returnItem)}
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return Details: {selectedReturn?.returnNumber}</DialogTitle>
            <DialogDescription>
              View complete return information and items
            </DialogDescription>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-6">
              {/* Return Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order Number</Label>
                  <div className="font-medium">{selectedReturn.order.orderNumber}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Return Date</Label>
                  <div className="font-medium">
                    {format(new Date(selectedReturn.returnDate), "MMM dd, yyyy HH:mm")}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>
                    <Badge className={STATUS_COLORS[selectedReturn.status]}>
                      {selectedReturn.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Refund Amount</Label>
                  <div className="font-medium text-lg">
                    ${selectedReturn.refundAmount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Return Reason</Label>
                  <div className="font-medium">
                    {RETURN_REASONS[selectedReturn.returnReason] || selectedReturn.returnReason}
                  </div>
                </div>
                {selectedReturn.refundMethod && (
                  <div>
                    <Label className="text-muted-foreground">Refund Method</Label>
                    <div className="font-medium">{selectedReturn.refundMethod}</div>
                  </div>
                )}
              </div>

              {selectedReturn.returnReasonNote && (
                <div>
                  <Label className="text-muted-foreground">Reason Notes</Label>
                  <div className="mt-1 p-3 bg-muted rounded-md">
                    {selectedReturn.returnReasonNote}
                  </div>
                </div>
              )}

              <Separator />

              {/* Return Items */}
              <div>
                <Label className="text-lg font-semibold">Returned Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Refund Amount</TableHead>
                      <TableHead>Condition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReturn.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.product.name}</div>
                            {item.product.sku && (
                              <div className="text-sm text-muted-foreground">
                                SKU: {item.product.sku}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>${item.price.toFixed(2)}</TableCell>
                        <TableCell className="font-medium">
                          ${item.refundAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>{item.condition || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedReturn.notes && (
                <div>
                  <Label className="text-muted-foreground">Additional Notes</Label>
                  <div className="mt-1 p-3 bg-muted rounded-md">{selectedReturn.notes}</div>
                </div>
              )}

              {selectedReturn.processedBy && (
                <div>
                  <Label className="text-muted-foreground">Processed By</Label>
                  <div className="font-medium">
                    {selectedReturn.processedBy.name} ({selectedReturn.processedBy.email})
                  </div>
                  {selectedReturn.processedDate && (
                    <div className="text-sm text-muted-foreground">
                      on {format(new Date(selectedReturn.processedDate), "MMM dd, yyyy HH:mm")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Return Dialog */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Return: {selectedReturn?.returnNumber}</DialogTitle>
            <DialogDescription>
              Approve or reject this return. Stock will be updated automatically upon approval.
            </DialogDescription>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Refund Amount:</strong> ${selectedReturn.refundAmount.toFixed(2)}
                  <br />
                  <strong>Items:</strong> {selectedReturn.items.length} item(s)
                </AlertDescription>
              </Alert>

              {selectedReturn.status === "PENDING" && (
                <div className="space-y-2">
                  <Label htmlFor="refundStatus">Refund Status</Label>
                  <Select value={refundStatus} onValueChange={setRefundStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select refund status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="refundReference">Refund Reference (Optional)</Label>
                <Input
                  id="refundReference"
                  value={refundReference}
                  onChange={(e) => setRefundReference(e.target.value)}
                  placeholder="Transaction reference number"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() =>
                    handleProcessReturn(selectedReturn.id, false, true)
                  }
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Reject Return
                </Button>
                <Button
                  onClick={() =>
                    handleProcessReturn(selectedReturn.id, true, false)
                  }
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {selectedReturn.status === "PENDING" ? "Approve" : "Process"} Return
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProcessDialogOpen(false)}
              disabled={processing}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}












