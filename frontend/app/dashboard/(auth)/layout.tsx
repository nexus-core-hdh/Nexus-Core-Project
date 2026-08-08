import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { SiteHeader } from "@/components/layout/header";
import { WorkspaceTabBar } from "@/components/layout/workspace/workspace-tab-bar";
import { CompanyCheck } from "./components/company-check";
import { ExceptionLogger } from "./components/exception-logger";
import { ContentContainer } from "./components/contentContainer";

export default async function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  
  // Redirect to login if no token
  // Note: This is a server-side check. Client-side checks are handled by middleware
  if (!token) {
    redirect("/dashboard/login/v1");
  }
  
  const defaultOpen =
    cookieStore.get("sidebar_state")?.value === "true" ||
    cookieStore.get("sidebar_state") === undefined;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 80)",
          "--header-height": "calc(var(--spacing) * 14)",
          "--content-padding": "calc(var(--spacing) * 4)",
          "--content-margin": "calc(var(--spacing) * 2)",
          // `--workspace-tab-bar-height` is set at runtime by WorkspaceTabBar
          // itself (0px when no tabs are open, 2.5rem when they are) — the tab
          // bar's height is inherently dynamic, so it can't be hardcoded here;
          // the fallback covers the instant before that client component mounts.
          "--content-full-height":
            "calc(100vh - var(--header-height) - var(--workspace-tab-bar-height, 0px) - (var(--content-padding) * 2) - (var(--content-margin) * 2))"
        } as React.CSSProperties
      }>
      <CompanyCheck />
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <WorkspaceTabBar />
        <ExceptionLogger />
        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          <ContentContainer>{children}</ContentContainer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
