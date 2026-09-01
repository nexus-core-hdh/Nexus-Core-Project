"use client";

import * as React from "react";
import { useEffect } from "react";
import { ChevronsUpDown, ShoppingBagIcon, UserCircle2Icon } from "lucide-react";
import { PlusIcon } from "@radix-ui/react-icons";
import { usePathname } from "next/navigation";
import { useIsTablet } from "@/hooks/use-mobile";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/layout/sidebar/nav-main";
import { NavUser } from "@/components/layout/sidebar/nav-user";
import Logo from "@/components/layout/logo";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const isTablet = useIsTablet();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname]);

  useEffect(() => {
    setOpen(!isTablet);
  }, [isTablet]);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-2 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="flex shrink-0 items-center justify-center rounded-md ring-1 ring-sidebar-border">
                <Logo />
              </div>
              <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                <p className="truncate text-[13.5px] font-bold tracking-wide text-sidebar-foreground uppercase">Nexus Core</p>
                <p className="mt-0.5 truncate text-[10px] font-medium tracking-wider text-sidebar-foreground/50 uppercase">Enterprise ERP</p>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="pt-2">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
