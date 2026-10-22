"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { locationsApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const locationFormSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type LocationFormValues = z.input<typeof locationFormSchema>;

interface LocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: Location | null;
  onSuccess?: () => void;
}

type Location = {
  id: number;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

export function LocationDialog({
  open,
  onOpenChange,
  location,
  onSuccess
}: LocationDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      country: "",
      zipCode: "",
      phone: "",
      email: "",
      isDefault: false,
      isActive: true
    }
  });

  React.useEffect(() => {
    if (open) {
      if (location) {
        form.reset({
          name: location.name,
          address: location.address || "",
          city: location.city || "",
          state: location.state || "",
          country: location.country || "",
          zipCode: location.zipCode || "",
          phone: location.phone || "",
          email: location.email || "",
          isDefault: location.isDefault,
          isActive: location.isActive
        });
      } else {
        form.reset({
          name: "",
          address: "",
          city: "",
          state: "",
          country: "",
          zipCode: "",
          phone: "",
          email: "",
          isDefault: false,
          isActive: true
        });
      }
    }
  }, [open, location, form]);

  const onSubmit = async (data: LocationFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = locationFormSchema.parse(data);
      if (location) {
        await locationsApi.updateLocation(location.id, parsed);
        toast.success("Location updated successfully");
      } else {
        await locationsApi.createLocation(parsed);
        toast.success("Location created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save location:", error);
      toast.error(error.message || "Failed to save location");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{location ? "Edit Location" : "Add Location"}</DialogTitle>
          <DialogDescription>
            {location
              ? "Update the location information below."
              : "Add a new location to your system."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Main Office" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main Street" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="New York" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State/Province</FormLabel>
                    <FormControl>
                      <Input placeholder="NY" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="United States" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP/Postal Code</FormLabel>
                    <FormControl>
                      <Input placeholder="10001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="location@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Default Location</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Set this as the default location
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Enable or disable this location
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : location ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}








































































