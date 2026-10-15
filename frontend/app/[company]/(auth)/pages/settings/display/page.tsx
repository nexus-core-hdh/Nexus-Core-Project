"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { customEntityPageApi, menuItemsApi, settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

type SidebarDisplayItem = { id: string; label: string; group: string };

const HIDDEN_GROUP_TITLES = new Set<string>(["AI Apps"]);
const HIDDEN_ITEM_HREFS = new Set<string>([
  "/apps/api-keys",
  "/pages/user-profile",
]);
const HIDDEN_ITEM_TITLES = new Set<string>(["Api Keys", "Profile V2"]);

function buildSidebarDisplayItemsFromMenuData(menuData: any[], customEntityPages: any[]): SidebarDisplayItem[] {
  const items: SidebarDisplayItem[] = [];
  const normalizeId = (href: string) =>
    href
      .trim()
      .replace(/\/+$/, "")
      .replace(/\?[\s\S]*$/, "");

  const shouldKeep = (item: any): boolean => {
    const href = typeof item?.href === "string" ? item.href : "";
    const title = typeof item?.title === "string" ? item.title : "";
    if (!href || href === "#") return false;
    if (HIDDEN_ITEM_HREFS.has(href)) return false;
    if (HIDDEN_ITEM_TITLES.has(title)) return false;
    return true;
  };

  const extractItems = (navItems: any[], groupTitle: string) => {
    navItems.forEach((item) => {
      if (shouldKeep(item)) {
        items.push({
          id: normalizeId(item.href),
          label: item.title,
          group: groupTitle,
        });
      }
      if (item.items && Array.isArray(item.items)) {
        extractItems(item.items, groupTitle);
      }
    });
  };

  (Array.isArray(menuData) ? menuData : [])
    .filter((g) => g && typeof g.title === "string" && !HIDDEN_GROUP_TITLES.has(g.title))
    .forEach((group) => {
      if (Array.isArray(group.items)) extractItems(group.items, group.title);
    });

  // Mirror the main sidebar behavior: custom entity pages are nested under Pages.
  const activeCustomPages = (Array.isArray(customEntityPages) ? customEntityPages : []).filter((p) => p?.isActive);
  activeCustomPages.forEach((page) => {
    if (!page?.slug || !page?.name) return;
    items.push({
      id: normalizeId(`/pages/custom-entities/${page.slug}`),
      label: page.name,
      group: "Pages",
    });
  });

  // De-dupe + stable sort
  const unique = Array.from(new Map(items.map((i) => [i.id, i])).values());
  return unique.sort((a, b) => (a.group !== b.group ? a.group.localeCompare(b.group) : a.label.localeCompare(b.label)));
}

const displayFormSchema = z.object({
  items: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one item."
  })
});

type DisplayFormValues = z.infer<typeof displayFormSchema>;

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarItems, setSidebarItems] = useState<SidebarDisplayItem[]>([]);
  const allSidebarItemIds = useMemo(() => sidebarItems.map((i) => i.id), [sidebarItems]);

  const form = useForm<DisplayFormValues>({
    resolver: zodResolver(displayFormSchema),
    defaultValues: {
      items: []
    }
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;

        const [menuData, customPages, settings] = await Promise.all([
          menuItemsApi.getMenuItems(user.companyId || undefined, user.branchId || undefined).catch(() => []),
          customEntityPageApi.getCustomEntityPages(user.companyId || undefined, user.branchId || undefined).catch(() => []),
          settingsApi.getUserSettings(user.id),
        ]);

        if (Array.isArray(menuData)) {
          setSidebarItems(buildSidebarDisplayItemsFromMenuData(menuData, Array.isArray(customPages) ? customPages : []));
        } else {
          setSidebarItems(buildSidebarDisplayItemsFromMenuData([], Array.isArray(customPages) ? customPages : []));
        }

        form.reset({
          items: settings.sidebarItems || []
        });
      } catch (error: any) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [form]);

  // Avoid hydration mismatches from SSR + client-only menu/settings state.
  if (!mounted) return null;

  async function onSubmit(data: DisplayFormValues) {
    try {
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to update settings");
        return;
      }

      await settingsApi.updateDisplay(user.id, {
        items: data.items
      });

      toast.success("Display settings updated successfully");
    } catch (error: any) {
      console.error('Failed to update display settings:', error);
      toast.error("Failed to update display settings", { description: error.message });
    }
  }

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="items"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Sidebar</FormLabel>
                    <FormDescription>
                      Select the items you want to display in the sidebar.
                    </FormDescription>
                  </div>
                  <FormField
                    control={form.control}
                    name="items"
                    render={({ field }) => {
                      const selected = Array.isArray(field.value) ? field.value : [];
                      const total = allSidebarItemIds.length;
                      const selectedCount = allSidebarItemIds.filter((id) => selected.includes(id)).length;
                      const allSelected = total > 0 && selectedCount === total;
                      const someSelected = selectedCount > 0 && selectedCount < total;

                      return (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 pb-2 border-b">
                          <FormControl>
                            <Checkbox
                              checked={allSelected ? true : someSelected ? "indeterminate" : false}
                              onCheckedChange={(checked) => {
                                if (checked) field.onChange(allSidebarItemIds);
                                else field.onChange([]);
                              }}
                            />
                          </FormControl>
                          <div className="flex flex-col gap-0.5">
                            <FormLabel className="font-normal cursor-pointer">Select all menus</FormLabel>
                            <FormDescription className="m-0">
                              {selectedCount} of {total} selected
                            </FormDescription>
                          </div>
                        </FormItem>
                      );
                    }}
                  />
                  <div className="space-y-4">
                    {Object.entries(
                      sidebarItems.reduce((acc, item) => {
                        if (!acc[item.group]) {
                          acc[item.group] = [];
                        }
                        acc[item.group].push(item);
                        return acc;
                      }, {} as Record<string, typeof sidebarItems>)
                    ).map(([group, items]) => (
                      <div key={group} className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">{group}</h4>
                        <div className="space-y-2 pl-4">
                          {items.map((item) => (
                            <FormField
                              key={item.id}
                              control={form.control}
                              name="items"
                              render={({ field }) => {
                                return (
                                  <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(item.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, item.id])
                                            : field.onChange(
                                                field.value?.filter((value) => value !== item.id)
                                              );
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer">{item.label}</FormLabel>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Update display</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
