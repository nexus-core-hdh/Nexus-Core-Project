"use client";

import { usePathname } from "@/lib/app-navigation";
import { SidebarNav } from "./components/sidebar-nav";

export default function CRMSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Pages that should not have the CRM settings layout wrapper
  const standalonePagePrefixes = [
    "/crm/settings/other/drive-usage",
    "/crm/settings/other/other-settings",
    "/crm/settings/other/exceptions",
    // Report Templates should follow the regular pages layout (no CRM Settings sidebar)
    "/crm/settings/report-templates",
    // PDF Reports should follow the regular pages layout (no CRM Settings sidebar)
    "/crm/settings/pdf-reports",
  ];
  
  const isStandalonePage = standalonePagePrefixes.some((prefix) => pathname.startsWith(prefix));
  
  if (isStandalonePage) {
    return <>{children}</>;
  }
  
  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="space-y-0.5">
        <h2 className="text-lg font-bold tracking-tight">CRM Settings</h2>
        <p className="text-muted-foreground">
          Manage your CRM configuration, forms, payments, permissions, and integrations.
        </p>
      </div>
      <div className="flex flex-col space-y-4 lg:flex-row lg:space-y-0 lg:space-x-4">
        <aside className="lg:w-64">
          <SidebarNav />
        </aside>
        <div className="flex-1 w-full">{children}</div>
      </div>
    </div>
  );
}
