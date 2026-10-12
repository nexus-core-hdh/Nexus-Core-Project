import { Metadata } from "next";
import { generateMeta } from "@/lib/utils";

import { SidebarNav } from "./components/sidebar-nav";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "Statuses and Dropdowns",
    description:
      "Manage statuses and dropdown options for leads, contacts, companies, and deals.",
    canonical: "/crm/statuses-dropdowns"
  });
}

export default function StatusesDropdownsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="space-y-0.5">
        <h3 className="text-2xl font-bold tracking-tight">Statuses and Dropdowns</h3>
        <h4>Configure statuses, stages, and dropdown options for your CRM.</h4>
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












































































