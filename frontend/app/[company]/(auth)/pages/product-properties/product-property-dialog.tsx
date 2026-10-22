"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { productPropertiesApi } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

const productPropertyFormSchema = z.object({
  name: z.string().min(1, "Property name is required"),
  type: z.string().optional(),
  options: z.array(z.string()).default([]),
  isRequired: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type ProductPropertyFormValues = z.input<typeof productPropertyFormSchema>;

interface ProductPropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: ProductProperty | null;
  onSuccess?: () => void;
}

type ProductProperty = {
  id: number;
  name: string;
  type?: string | null;
  options: string[];
  isRequired: boolean;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

export function ProductPropertyDialog({
  open,
  onOpenChange,
  property,
  onSuccess
}: ProductPropertyDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [optionInput, setOptionInput] = React.useState("");

  const form = useForm<ProductPropertyFormValues>({
    resolver: zodResolver(productPropertyFormSchema),
    defaultValues: {
      name: "",
      type: "",
      options: [],
      isRequired: false,
      isDefault: false,
      isActive: true
    }
  });

  const options = form.watch("options");
  const propertyType = form.watch("type");

  React.useEffect(() => {
    if (open) {
      if (property) {
        form.reset({
          name: property.name,
          type: property.type || "",
          options: property.options || [],
          isRequired: property.isRequired,
          isDefault: property.isDefault,
          isActive: property.isActive
        });
      } else {
        form.reset({
          name: "",
          type: "",
          options: [],
          isRequired: false,
          isDefault: false,
          isActive: true
        });
      }
      setOptionInput("");
    }
  }, [open, property, form]);

  const addOption = () => {
    if (optionInput.trim()) {
      const currentOptions = form.getValues("options") || [];
      if (!currentOptions.includes(optionInput.trim())) {
        form.setValue("options", [...currentOptions, optionInput.trim()]);
        setOptionInput("");
      }
    }
  };

  const removeOption = (index: number) => {
    const currentOptions = form.getValues("options") || [];
    form.setValue("options", currentOptions.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: ProductPropertyFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = productPropertyFormSchema.parse(data);
      if (property) {
        await productPropertiesApi.updateProductProperty(property.id, parsed);
        toast.success("Product property updated successfully");
      } else {
        await productPropertiesApi.createProductProperty(parsed);
        toast.success("Product property created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save product property:", error);
      toast.error(error.message || "Failed to save product property");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{property ? "Edit Product Property" : "Add Product Property"}</DialogTitle>
          <DialogDescription>
            {property
              ? "Update the product property information below."
              : "Add a new product property to your system."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Color" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {propertyType === "select" && (
              <FormField
                control={form.control}
                name="options"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Options</FormLabel>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter option"
                          value={optionInput}
                          onChange={(e) => setOptionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addOption();
                            }
                          }}
                        />
                        <Button type="button" onClick={addOption} variant="outline">
                          Add
                        </Button>
                      </div>
                      {options && options.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {options.map((option, index) => (
                            <Badge key={index} variant="secondary" className="flex items-center gap-1">
                              {option}
                              <button
                                type="button"
                                onClick={() => removeOption(index)}
                                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="isRequired"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Required</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Make this property required
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
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Default Property</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Set this as the default product property
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
                      Enable or disable this property
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
                {isSubmitting ? "Saving..." : property ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

