"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { customerPaymentApi, orderApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

type PaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItems: Array<{
    product: {
      id: string;
      name: string;
      price: number;
    };
    quantity: number;
  }>;
  customerId: number;
  totalAmount: number;
  orderId?: number;
  onPaymentComplete: () => void;
};

export default function PaymentDialog({
  open,
  onOpenChange,
  cartItems,
  customerId,
  totalAmount,
  orderId,
  onPaymentComplete,
}: PaymentDialogProps) {
  const [amount, setAmount] = useState<string>(totalAmount.toFixed(2));
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate change when cash payment
  const change = paymentMethod === "CASH" && amountPaid 
    ? parseFloat(amountPaid) - parseFloat(amount || "0")
    : 0;

  useEffect(() => {
    if (open) {
      setAmount(totalAmount.toFixed(2));
      setAmountPaid("");
      setPaymentMethod("CASH");
      setReference("");
      setNotes("");
    }
  }, [open, totalAmount]);

  useEffect(() => {
    if (paymentMethod === "CASH" && !amountPaid) {
      setAmountPaid(totalAmount.toFixed(2));
    } else if (paymentMethod !== "CASH") {
      setAmountPaid("");
    }
  }, [paymentMethod, totalAmount]);

  const handleSubmit = async () => {
    try {
      setIsProcessing(true);
      const user = getCurrentUser();
      if (!user) {
        throw new Error("User not found");
      }

      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        throw new Error("Please enter a valid amount");
      }

      // Validate cash payment
      if (paymentMethod === "CASH") {
        const paid = parseFloat(amountPaid);
        if (isNaN(paid) || paid < paymentAmount) {
          throw new Error("Amount paid must be greater than or equal to the total amount");
        }
      }

      // Calculate totals
      const subtotal = cartItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      // Create order items
      const orderItems = cartItems.map((item) => ({
        productId: parseInt(item.product.id),
        quantity: item.quantity,
        price: item.product.price,
        subtotal: item.product.price * item.quantity,
      }));

      let createdOrder;
      
      if (orderId) {
        // Update existing order
        createdOrder = await orderApi.updateOrder(orderId, {
          subtotal,
          tax,
          discount: 0,
          shippingCost: 0,
          totalAmount: total,
        });
        
        // Note: Order items should be updated separately if needed
        // For now, we're just updating the totals
        toast.success("Order updated successfully!", {
          description: `Order has been updated with new totals.`,
        });
      } else {
        // Create new order
        const orderNumber = `POS-${Date.now()}`;
        createdOrder = await orderApi.createOrder({
          orderNumber,
          customerId,
          status: "PENDING",
          type: "SALE",
          subtotal,
          tax,
          discount: 0,
          shippingCost: 0,
          totalAmount: total,
          items: orderItems,
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
        });
        
        toast.success("Order and payment processed successfully!", {
          description: `Order #${orderNumber} has been saved with payment of $${paymentAmount.toFixed(2)}.`,
        });
      }

      // Create payment
      await customerPaymentApi.createCustomerPayment(
        {
          customerId,
          orderId: createdOrder.id,
          amount: paymentAmount,
          paymentMethod,
          status: "COMPLETED",
          reference: reference || undefined,
          notes: notes || undefined,
        },
        {
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
        }
      );

      onPaymentComplete();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error processing payment:", error);
      toast.error("Failed to process payment", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Process Payment</DialogTitle>
          <DialogDescription>
            Record payment for this order. Total amount: ${totalAmount.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Total Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              readOnly
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="paymentMethod">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paymentMethod === "CASH" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="amountPaid">Amount Paid</Label>
                <Input
                  id="amountPaid"
                  type="number"
                  step="0.01"
                  min={parseFloat(amount)}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {change > 0 && (
                <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-green-900 dark:text-green-100">
                      Change to Return:
                    </span>
                    <span className="text-lg font-bold text-green-700 dark:text-green-300">
                      ${change.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              {change < 0 && (
                <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950">
                  <div className="text-sm text-red-700 dark:text-red-300">
                    Amount paid is less than total. Please enter a valid amount.
                  </div>
                </div>
              )}
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="reference">Reference Number (Optional)</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Enter reference number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Process Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


