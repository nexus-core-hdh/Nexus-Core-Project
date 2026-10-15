"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, AlertCircle, Package, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OrderItem {
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
}

interface Order {
  id: number;
  orderNumber: string;
  customerId: number;
  items: OrderItem[];
  totalAmount: number;
  subtotal: number;
  tax?: number;
  discount?: number;
}

interface ReturnOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onReturnCreated?: () => void;
}

type ReturnReason =
  | "DEFECTIVE"
  | "DAMAGED"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "CUSTOMER_CHANGE_MIND"
  | "LATE_DELIVERY"
  | "DUPLICATE_ORDER"
  | "OTHER";

type RefundMethod =
  | "ORIGINAL_PAYMENT"
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "STORE_CREDIT"
  | "EXCHANGE";

interface ReturnItem {
  orderItemId: number;
  quantity: number;
  reason?: ReturnReason;
  reasonNote?: string;
  condition?: string;
}

const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: "DEFECTIVE", label: "Defective Product" },
  { value: "DAMAGED", label: "Damaged in Transit" },
  { value: "WRONG_ITEM", label: "Wrong Item Received" },
  { value: "NOT_AS_DESCRIBED", label: "Not as Described" },
  { value: "CUSTOMER_CHANGE_MIND", label: "Customer Changed Mind" },
  { value: "LATE_DELIVERY", label: "Late Delivery" },
  { value: "DUPLICATE_ORDER", label: "Duplicate Order" },
  { value: "OTHER", label: "Other" },
];

const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
  { value: "ORIGINAL_PAYMENT", label: "Original Payment Method" },
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "STORE_CREDIT", label: "Store Credit" },
  { value: "EXCHANGE", label: "Exchange" },
];

const ITEM_CONDITIONS = [
  "New/Unopened",
  "Opened/Used",
  "Damaged",
  "Defective",
  "Missing Parts",
];

export function ReturnOrderDialog({
  open,
  onOpenChange,
  order,
  onReturnCreated,
}: ReturnOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [returnReason, setReturnReason] = useState<ReturnReason>("OTHER");
  const [returnReasonNote, setReturnReasonNote] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("ORIGINAL_PAYMENT");
  const [notes, setNotes] = useState("");
  const [returnItems, setReturnItems] = useState<Record<number, ReturnItem>>({});

  useEffect(() => {
    if (open && order) {
      // Initialize return items with default values
      const initialItems: Record<number, ReturnItem> = {};
      order.items.forEach((item) => {
        const availableToReturn = item.quantity - (item.returnedQuantity || 0);
        if (availableToReturn > 0) {
          initialItems[item.id] = {
            orderItemId: item.id,
            quantity: 0,
            reason: returnReason,
            condition: "New/Unopened",
          };
        }
      });
      setReturnItems(initialItems);
    }
  }, [open, order, returnReason]);

  const handleItemQuantityChange = (itemId: number, quantity: number) => {
    const item = order?.items.find((i) => i.id === itemId);
    if (!item) return;

    const availableToReturn = item.quantity - (item.returnedQuantity || 0);
    if (quantity > availableToReturn) {
      toast.error(`Only ${availableToReturn} items available to return`);
      return;
    }

    setReturnItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantity: Math.max(0, quantity),
      },
    }));
  };

  const handleItemReasonChange = (itemId: number, reason: ReturnReason) => {
    setReturnItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        reason,
      },
    }));
  };

  const handleItemConditionChange = (itemId: number, condition: string) => {
    setReturnItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        condition,
      },
    }));
  };

  const calculateRefundAmount = (): number => {
    if (!order) return 0;

    let total = 0;
    order.items.forEach((item) => {
      const returnItem = returnItems[item.id];
      if (returnItem && returnItem.quantity > 0) {
        const itemPrice = item.price;
        const itemDiscount = (item.discount || 0) * (returnItem.quantity / item.quantity);
        total += itemPrice * returnItem.quantity - itemDiscount;
      }
    });

    return total;
  };

  const handleSubmit = async () => {
    if (!order) return;

    const itemsToReturn = Object.values(returnItems).filter(
      (item) => item.quantity > 0
    );

    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }

    if (!returnReason) {
      toast.error("Please select a return reason");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"}/orders/${order.id}/return`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            returnReason,
            returnReasonNote,
            items: itemsToReturn.map((item) => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
              reason: item.reason || returnReason,
              reasonNote: item.reasonNote,
              condition: item.condition,
            })),
            refundMethod,
            notes,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create return");
      }

      const result = await response.json();
      toast.success(`Return created successfully: ${result.returnNumber}`);
      onReturnCreated?.();
      onOpenChange(false);
      
      // Reset form
      setReturnReason("OTHER");
      setReturnReasonNote("");
      setRefundMethod("ORIGINAL_PAYMENT");
      setNotes("");
      setReturnItems({});
    } catch (error: any) {
      console.error("Error creating return:", error);
      toast.error(error.message || "Failed to create return");
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  const refundAmount = calculateRefundAmount();
  const hasSelectedItems = Object.values(returnItems).some((item) => item.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5" />
            Return Order: {order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Select items to return and provide return details. Stock will be updated automatically upon approval.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Return Reason Section */}
          <div className="space-y-2">
            <Label htmlFor="returnReason" className="text-sm font-semibold">Return Reason *</Label>
            <Select value={returnReason} onValueChange={(value) => setReturnReason(value as ReturnReason)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items to Return */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Select Items to Return</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items.map((item) => {
                  const availableToReturn = item.quantity - (item.returnedQuantity || 0);
                  const returnItem = returnItems[item.id];
                  const returnQuantity = returnItem?.quantity || 0;

                  if (availableToReturn <= 0) {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{item.product.name}</span>
                          <Badge variant="outline">All items already returned</Badge>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="p-5 border rounded-lg space-y-4 bg-card"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-base mb-2">{item.product.name}</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                            <div><span className="font-medium">SKU:</span> {item.product.sku || "N/A"}</div>
                            <div><span className="font-medium">Ordered:</span> {item.quantity}</div>
                            <div><span className="font-medium">Returned:</span> {item.returnedQuantity || 0}</div>
                            <div><span className="font-medium">Available:</span> {availableToReturn}</div>
                          </div>
                          <div className="text-sm font-semibold mt-2 text-primary">
                            Price: ${item.price.toFixed(2)} each
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Quantity to Return</Label>
                          <Input
                            type="number"
                            min="0"
                            max={availableToReturn}
                            value={returnQuantity || ""}
                            onChange={(e) =>
                              handleItemQuantityChange(item.id, parseInt(e.target.value) || 0)
                            }
                            className="h-11"
                          />
                          <div className="text-xs text-muted-foreground">
                            Max: {availableToReturn}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Item Condition</Label>
                          <Select
                            value={returnItem?.condition || "New/Unopened"}
                            onValueChange={(value) => handleItemConditionChange(item.id, value)}
                          >
                            <SelectTrigger className="h-11 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ITEM_CONDITIONS.map((condition) => (
                                <SelectItem key={condition} value={condition}>
                                  {condition}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Item-Specific Reason</Label>
                          <Select
                            value={returnItem?.reason || returnReason}
                            onValueChange={(value) =>
                              handleItemReasonChange(item.id, value as ReturnReason)
                            }
                          >
                            <SelectTrigger className="h-11 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RETURN_REASONS.map((reason) => (
                                <SelectItem key={reason.value} value={reason.value}>
                                  {reason.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {returnQuantity > 0 && (
                        <div className="p-3 bg-primary/10 rounded-md text-sm border border-primary/20">
                          <strong className="text-primary">Refund for this item:</strong>{" "}
                          <span className="font-bold text-lg">$
                          {(
                            item.price * returnQuantity -
                            ((item.discount || 0) * (returnQuantity / item.quantity))
                          ).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Refund Summary */}
          {hasSelectedItems && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 font-semibold">
                  <DollarSign className="h-5 w-5" />
                  Refund Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="refundMethod" className="text-sm font-semibold">Refund Method *</Label>
                  <Select
                    value={refundMethod}
                    onValueChange={(value) => setRefundMethod(value as RefundMethod)}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFUND_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <span className="text-sm font-semibold">Total Refund Amount:</span>
                    <span className="font-bold text-2xl text-primary">${refundAmount.toFixed(2)}</span>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Stock will be automatically updated when the return is approved and processed.
                    Refund will be processed according to the selected method.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-semibold">Additional Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information about this return..."
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-11">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !hasSelectedItems} className="h-11 min-w-[160px]">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Return Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


