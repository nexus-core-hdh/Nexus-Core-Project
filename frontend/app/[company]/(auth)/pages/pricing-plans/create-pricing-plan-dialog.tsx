"use client";

import * as React from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pricingPlansApi, menuItemsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { PricingPlan } from "./data-table";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const pricingPlanSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  description: z.string().optional(),
  price: z.number().min(0, "Price must be greater than or equal to 0"),
  yearlyPrice: z.number().min(0, "Yearly price must be greater than or equal to 0").optional(),
  industry: z.string().optional(),
  features: z.array(z.object({
    text: z.string().min(1, "Feature text is required")
  })).optional(),
  enabledMenuItems: z.array(z.string()).min(1, "At least one menu item must be selected"),
  isActive: z.boolean(),
});

type PricingPlanForm = z.infer<typeof pricingPlanSchema>;

interface CreatePricingPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: PricingPlan | null;
  onSuccess: () => void;
}

// Common industries - can be expanded
const industries = [
  "Technology",
  "Healthcare",
  "Finance",
  "Retail",
  "Education",
  "Manufacturing",
  "Real Estate",
  "Hospitality",
  "Other"
];

type MenuItem = {
  title: string;
  href: string;
  items?: MenuItem[];
  id?: number;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

export default function CreatePricingPlanDialog({
  open,
  onOpenChange,
  plan,
  onSuccess
}: CreatePricingPlanDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [menuGroups, setMenuGroups] = React.useState<MenuGroup[]>([]);
  const [loadingMenus, setLoadingMenus] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

  const form = useForm<PricingPlanForm>({
    resolver: zodResolver(pricingPlanSchema),
    defaultValues: {
      name: plan?.name || "",
      description: plan?.description || "",
      price: plan?.price || 0,
      yearlyPrice: plan?.yearlyPrice || undefined,
      industry: plan?.industry || "",
      features: plan?.features?.length 
        ? (plan.features as any[]).map((f: any) => ({ text: typeof f === 'string' ? f : f.text || f.name || "" }))
        : [{ text: "" }],
      enabledMenuItems: plan?.enabledMenuItems || [],
      isActive: plan?.isActive !== undefined ? plan.isActive : true,
    },
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "features",
  });

  // Load menu items when dialog opens
  React.useEffect(() => {
    if (open) {
      loadMenuItems();
    }
  }, [open]);

  const loadMenuItems = async () => {
    try {
      setLoadingMenus(true);
      const user = getCurrentUser();
      
      if (!user) {
        // Fallback to default nav items structure
        setMenuGroups([]);
        return;
      }

      try {
        const menuData = await menuItemsApi.getMenuItems(
          user.companyId || undefined,
          user.branchId || undefined
        );

        if (Array.isArray(menuData) && menuData.length > 0) {
          setMenuGroups(menuData);
          // Expand all groups by default
          setExpandedGroups(new Set(menuData.map((g: any) => g.title)));
        } else {
          // Fallback to default nav items
          const { defaultNavItems } = await import("@/components/layout/sidebar/nav-main");
          setMenuGroups(defaultNavItems);
          setExpandedGroups(new Set(defaultNavItems.map(g => g.title)));
        }
      } catch (error) {
        console.error("Error loading menu items:", error);
        // Fallback to default nav items
        const { defaultNavItems } = await import("@/components/layout/sidebar/nav-main");
        setMenuGroups(defaultNavItems);
        setExpandedGroups(new Set(defaultNavItems.map(g => g.title)));
      }
    } catch (error) {
      console.error("Failed to load menu items:", error);
    } finally {
      setLoadingMenus(false);
    }
  };

  // Helper function to get menu item path (for identification)
  const getMenuItemPath = (item: MenuItem, groupTitle: string): string => {
    // Use href as the identifier, or create a path from group + title
    if (item.href && item.href !== "#") {
      return item.href;
    }
    return `${groupTitle}.${item.title}`;
  };

  // Helper function to flatten menu items for easier checking
  const flattenMenuItems = (items: MenuItem[], groupTitle: string): Array<{ item: MenuItem; path: string; groupTitle: string }> => {
    const result: Array<{ item: MenuItem; path: string; groupTitle: string }> = [];
    items.forEach(item => {
      const path = getMenuItemPath(item, groupTitle);
      result.push({ item, path, groupTitle });
      if (item.items && item.items.length > 0) {
        result.push(...flattenMenuItems(item.items, groupTitle));
      }
    });
    return result;
  };

  const allMenuItems = React.useMemo(() => {
    return menuGroups.flatMap(group => flattenMenuItems(group.items, group.title));
  }, [menuGroups]);

  const toggleMenuItem = (path: string) => {
    const currentItems = form.getValues("enabledMenuItems") || [];
    const isSelected = currentItems.includes(path);
    
    if (isSelected) {
      form.setValue("enabledMenuItems", currentItems.filter(p => p !== path));
    } else {
      form.setValue("enabledMenuItems", [...currentItems, path]);
    }
  };

  const isMenuItemSelected = (path: string): boolean => {
    const currentItems = form.getValues("enabledMenuItems") || [];
    return currentItems.includes(path);
  };

  const toggleGroup = (groupTitle: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupTitle)) {
      newExpanded.delete(groupTitle);
    } else {
      newExpanded.add(groupTitle);
    }
    setExpandedGroups(newExpanded);
  };

  React.useEffect(() => {
    if (open) {
      if (plan) {
        form.reset({
          name: plan.name,
          description: plan.description || "",
          price: plan.price,
          yearlyPrice: plan.yearlyPrice || undefined,
          industry: plan.industry || "",
          features: plan.features?.length 
            ? (plan.features as any[]).map((f: any) => ({ text: typeof f === 'string' ? f : f.text || f.name || "" }))
            : [{ text: "" }],
          enabledMenuItems: plan.enabledMenuItems || [],
          isActive: plan.isActive,
        });
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          yearlyPrice: undefined,
          industry: "",
          features: [{ text: "" }],
          enabledMenuItems: [],
          isActive: true,
        });
      }
    }
  }, [open, plan, form]);

  const onSubmit = async (data: PricingPlanForm) => {
    try {
      setIsSubmitting(true);

      const payload = {
        name: data.name,
        description: data.description || null,
        price: data.price,
        yearlyPrice: data.yearlyPrice || null,
        industry: data.industry || null,
        features: (data.features ?? []).map((f) => f.text).filter((t) => t.trim()),
        enabledMenuItems: data.enabledMenuItems || [],
        isActive: data.isActive,
      };

      if (plan) {
        await pricingPlansApi.updatePricingPlan(plan.id, payload);
        toast.success("Pricing plan updated successfully");
      } else {
        await pricingPlansApi.createPricingPlan(payload);
        toast.success("Pricing plan created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save pricing plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit Pricing Plan" : "Create Pricing Plan"}</DialogTitle>
          <DialogDescription>
            {plan ? "Update the pricing plan details." : "Create a new pricing plan with features and menu items."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Basic, Pro, Enterprise" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Plan description..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Price ($) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="yearlyPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yearly Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === "all" ? "" : value)} 
                    value={field.value || "all"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry (leave empty for all industries)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">All Industries</SelectItem>
                      {industries.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabledMenuItems"
              render={() => (
                <FormItem>
                  <div className="space-y-2">
                    <FormLabel>Available Menu Items (Features) *</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Select the menu items that will be available for companies using this pricing plan. Only selected menus will be visible.
                    </div>
                    {loadingMenus ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-muted-foreground">Loading menu items...</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px] rounded-md border p-4">
                        <div className="space-y-2">
                          {menuGroups.map((group) => (
                            <Collapsible
                              key={group.title}
                              open={expandedGroups.has(group.title)}
                              onOpenChange={() => toggleGroup(group.title)}
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-md hover:bg-accent">
                                <div className="flex items-center gap-2">
                                  {expandedGroups.has(group.title) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                  <span className="font-medium">{group.title}</span>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-6 mt-2 space-y-1">
                                  {group.items.map((item) => {
                                    const itemPath = getMenuItemPath(item, group.title);
                                    const hasChildren = item.items && item.items.length > 0;
                                    
                                    return (
                                      <div key={itemPath} className="space-y-1">
                                        <div className="flex items-center gap-2 py-1">
                                          <Checkbox
                                            id={itemPath}
                                            checked={isMenuItemSelected(itemPath)}
                                            onCheckedChange={() => toggleMenuItem(itemPath)}
                                          />
                                          <label
                                            htmlFor={itemPath}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                          >
                                            {item.title}
                                          </label>
                                        </div>
                                        {hasChildren && item.items && (
                                          <div className="ml-6 space-y-1">
                                            {item.items.map((subItem) => {
                                              const subItemPath = getMenuItemPath(subItem, group.title);
                                              return (
                                                <div key={subItemPath} className="flex items-center gap-2 py-1">
                                                  <Checkbox
                                                    id={subItemPath}
                                                    checked={isMenuItemSelected(subItemPath)}
                                                    onCheckedChange={() => toggleMenuItem(subItemPath)}
                                                  />
                                                  <label
                                                    htmlFor={subItemPath}
                                                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                                  >
                                                    {subItem.title}
                                                  </label>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    {form.watch("enabledMenuItems")?.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {form.watch("enabledMenuItems")?.length} menu item(s) selected
                      </div>
                    )}
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Additional Features (Text)</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`features.${index}.text`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input placeholder="Enter feature..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ text: "" })}
                className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Feature
              </Button>
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Whether this plan is currently available
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : plan ? "Update Plan" : "Create Plan"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

