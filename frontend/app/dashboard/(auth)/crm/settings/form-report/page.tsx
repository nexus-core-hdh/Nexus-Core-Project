"use client";

import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { IdCard, BarChart3, FileText, FileCheck } from "lucide-react";

const options = [
  {
    id: "custom-fields",
    title: "User Defined Fields",
    icon: IdCard,
    href: "/dashboard/administration/user-defined-fields",
    description: "Create and manage custom fields for ERP screens and business entities (Administration > User Defined Fields)."
  },
  {
    id: "analytical-reports",
    title: "Analytical Reports",
    icon: BarChart3,
    href: "/dashboard/pages/analytical-reports",
    description: "Select custom fields to include in analytical reports and configure report settings."
  },
  {
    id: "report-templates",
    title: "Report Templates",
    icon: FileText,
    href: "/dashboard/crm/settings/report-templates",
    description: "Create and manage report templates. Configure how data will be displayed and export reports in CSV or PDF."
  },
  {
    id: "pdf-reports",
    title: "PDF Reports",
    icon: FileCheck,
    href: "/dashboard/crm/settings/pdf-reports",
    description: "Build dynamic PDF reports with drag-and-drop editor. Add labels, inputs, tables, and configure for printing."
  }
];

export default function FormReportSettingsPage() {
  const router = useRouter();

  const handleOptionClick = (href: string) => {
    router.push(href);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
        {options.map((option) => {
          const Icon = option.icon;
          
          return (
            <button
              key={option.id}
              type="button"
              className={cn(
                "group relative flex flex-col items-center justify-center p-6 aspect-square w-full",
                "border-2 rounded-lg transition-all cursor-pointer",
                "bg-background hover:bg-muted/50",
                "border-border hover:border-primary/50"
              )}
              onClick={() => handleOptionClick(option.href)}
            >
              <div className={cn(
                "mb-4 flex items-center justify-center",
                "h-16 w-16 rounded-lg",
                "bg-muted group-hover:bg-primary/10"
              )}>
                <Icon className={cn(
                  "h-8 w-8",
                  "text-muted-foreground group-hover:text-primary"
                )} />
              </div>
              <p className={cn(
                "text-xs sm:text-sm text-center font-medium leading-tight px-2",
                "text-foreground"
              )}>
                {option.title}
              </p>
            </button>
          );
        })}
      </div>
      
      <p className="text-center text-sm text-muted-foreground">
        Create your custom fields for any CRM entity. Select the fields to include in analytical reports.
      </p>
    </div>
  );
}

