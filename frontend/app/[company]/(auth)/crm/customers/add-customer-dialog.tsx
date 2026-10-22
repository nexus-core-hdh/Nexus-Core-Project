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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerApi, entityDataApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  customer?: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postalCode?: string | null;
  };
  templateId?: number;
}

export function AddCustomerDialog({ open, onOpenChange, onSaved, customer, templateId }: AddCustomerDialogProps) {
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
  });

  // Reset form when dialog opens/closes or customer changes
  useEffect(() => {
    if (!open) {
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        country: "",
        postalCode: "",
      });
    } else if (customer && !templateId) {
      setFormData({
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        state: customer.state || "",
        country: customer.country || "",
        postalCode: customer.postalCode || "",
      });
    }
  }, [open, customer, templateId]);

  const handleDefaultFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("User not found");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("Please enter a customer name");
      return;
    }

    try {
      setLoading(true);
      const data = {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        country: formData.country.trim() || undefined,
        postalCode: formData.postalCode.trim() || undefined,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      };

      if (customer) {
        await customerApi.updateCustomer(customer.id, data);
        toast.success("Customer updated successfully");
      } else {
        await customerApi.createCustomer(data);
        toast.success("Customer created successfully");
      }
      
      onSaved();
    } catch (error: any) {
      console.error("Failed to save customer:", error);
      toast.error(error?.error || `Failed to ${customer ? "update" : "create"} customer`);
    } finally {
      setLoading(false);
    }
  };

  const initialTemplateData = customer ? {
    name: customer.name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    address: customer.address || "",
    city: customer.city || "",
    state: customer.state || "",
    country: customer.country || "",
    postalCode: customer.postalCode || "",
  } : {};

  // If template exists, use TemplateViewerDialog (similar to leads)
  if (templateId) {
    return (
      <TemplateViewerDialog
        open={open}
        onOpenChange={onOpenChange}
        templateId={templateId}
        entityType="CUSTOMER"
        entityId={customer?.id}
        initialData={initialTemplateData}
        onSubmit={async (data: Record<string, any>) => {
          if (!user) {
            toast.error("User not found");
            return;
          }

          try {
            const customerData = {
              name: data.name || "",
              email: data.email || undefined,
              phone: data.phone || undefined,
              address: data.address || undefined,
              city: data.city || undefined,
              state: data.state || undefined,
              country: data.country || undefined,
              postalCode: data.postalCode || undefined,
              companyId: user.companyId || undefined,
              branchId: user.branchId || undefined,
            };

            if (customer) {
              // Update customer and entity data
              await customerApi.updateCustomer(customer.id, customerData);
              
              // Update entity data if it exists
              try {
                const entityDataList = await entityDataApi.getEntityDataByType("CUSTOMER");
                const existingEntityData = Array.isArray(entityDataList)
                  ? entityDataList.find((ed: any) => ed.id === customer.id || (ed.data && ed.data.id === customer.id))
                  : null;
                
                if (existingEntityData) {
                  await entityDataApi.updateEntityData(existingEntityData.id, data);
                } else {
                  // Create new entity data if it doesn't exist
                  await entityDataApi.createEntityData({
                    entityType: "CUSTOMER",
                    templateId: templateId,
                    data: {
                      ...data,
                      companyId: user.companyId || undefined,
                      branchId: user.branchId || undefined,
                    }
                  });
                }
              } catch (entityError) {
                console.error("Error updating entity data:", entityError);
                // Continue even if entity data update fails
              }
              
              toast.success("Customer updated successfully");
            } else {
              // Create entity data from template
              await entityDataApi.createEntityData({
                entityType: "CUSTOMER",
                templateId: templateId,
                data: {
                  ...data,
                  companyId: user.companyId || undefined,
                  branchId: user.branchId || undefined,
                }
              });
              
              // Also create customer record for compatibility
              await customerApi.createCustomer(customerData);
              toast.success("Customer created successfully");
            }
            
            onSaved();
          } catch (error: any) {
            console.error("Failed to save customer:", error);
            toast.error(error?.error || `Failed to ${customer ? "update" : "create"} customer`);
            throw error;
          }
        }}
        onCancel={() => onOpenChange(false)}
        submitLabel={customer ? "Update Customer" : "Create Customer"}
      />
    );
  }

  // Fallback to default form if no template
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
          <DialogDescription>
            {customer 
              ? "Update customer information" 
              : "Enter customer details below. All fields except name are optional."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDefaultFormSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Customer name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="customer@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="Country"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State/Province</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="State"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal Code</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  placeholder="ZIP/Postal Code"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : customer ? "Update" : "Create"} Customer
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}

