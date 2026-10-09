"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { orderApi } from "@/lib/api";

type OrderStatus = "PENDING" | "PROCESSING" | "PAID" | "SHIPPED" | "DELIVERED" | "COMPLETED" | "CANCELLED" | "FAILED";

interface UpdateOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  currentStatus: OrderStatus;
  onStatusUpdated?: () => void;
}

const STATUS_OPTIONS: { value: OrderStatus; label: string; description?: string }[] = [
  { value: "PENDING", label: "Pending", description: "Order is waiting to be processed" },
  { value: "PROCESSING", label: "Processing", description: "Order is being prepared" },
  { value: "PAID", label: "Paid", description: "Payment has been received" },
  { value: "SHIPPED", label: "Shipped", description: "Order has been shipped" },
  { value: "DELIVERED", label: "Delivered", description: "Order has been delivered" },
  { value: "COMPLETED", label: "Completed", description: "Order is fully completed" },
  { value: "CANCELLED", label: "Cancelled", description: "Order has been cancelled" },
  { value: "FAILED", label: "Failed", description: "Order processing failed" },
];

export function UpdateOrderStatusDialog({
  open,
  onOpenChange,
  orderId,
  currentStatus,
  onStatusUpdated,
}: UpdateOrderStatusDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedStatus(currentStatus);
    }
  }, [open, currentStatus]);

  const handleSubmit = async () => {
    if (selectedStatus === currentStatus) {
      toast.info("Status is already set to this value");
      onOpenChange(false);
      return;
    }

    setLoading(true);
    try {
      // Determine if we need to set dates based on status
      const updateData: any = { status: selectedStatus };
      
      // Set shippedDate when status changes to SHIPPED
      if (selectedStatus === "SHIPPED" && currentStatus !== "SHIPPED") {
        updateData.shippedDate = new Date().toISOString();
      }
      
      // Set deliveredDate when status changes to DELIVERED
      if (selectedStatus === "DELIVERED" && currentStatus !== "DELIVERED") {
        updateData.deliveredDate = new Date().toISOString();
      }

      await orderApi.updateOrder(orderId, updateData);
      toast.success(`Order status updated to ${STATUS_OPTIONS.find(s => s.value === selectedStatus)?.label}`);
      onStatusUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating order status:", error);
      toast.error(error.message || "Failed to update order status");
    } finally {
      setLoading(false);
    }
  };

  const getNextValidStatuses = (): OrderStatus[] => {
    const statusFlow: OrderStatus[] = ["PENDING", "PROCESSING", "PAID", "SHIPPED", "DELIVERED", "COMPLETED"];
    const currentIndex = statusFlow.indexOf(currentStatus);
    
    // Allow moving forward in the flow, backward one step, or to cancelled/failed
    const validStatuses: OrderStatus[] = [];
    
    // Can move forward
    if (currentIndex < statusFlow.length - 1) {
      validStatuses.push(...statusFlow.slice(currentIndex + 1));
    }
    
    // Can move backward one step
    if (currentIndex > 0) {
      validStatuses.push(statusFlow[currentIndex - 1]);
    }
    
    // Can always cancel or fail
    validStatuses.push("CANCELLED", "FAILED");
    
    // Can always go back to current status
    validStatuses.push(currentStatus);
    
    // Remove duplicates and sort
    return Array.from(new Set(validStatuses)).sort((a, b) => {
      const aIndex = statusFlow.indexOf(a);
      const bIndex = statusFlow.indexOf(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  };

  const validStatuses = getNextValidStatuses();
  const availableOptions = STATUS_OPTIONS.filter(opt => validStatuses.includes(opt.value));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Order Status</DialogTitle>
          <DialogDescription>
            Change the status of this order. The system will automatically update relevant dates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="currentStatus">Current Status</Label>
            <div className="text-sm font-medium text-muted-foreground">
              {STATUS_OPTIONS.find(s => s.value === currentStatus)?.label}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newStatus">New Status *</Label>
            <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as OrderStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                {availableOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStatus !== currentStatus && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <strong>Note:</strong>{" "}
              {selectedStatus === "SHIPPED" && "Shipping date will be set automatically."}
              {selectedStatus === "DELIVERED" && "Delivery date will be set automatically."}
              {selectedStatus === "CANCELLED" && "This order will be marked as cancelled."}
              {selectedStatus === "FAILED" && "This order will be marked as failed."}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || selectedStatus === currentStatus}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}











