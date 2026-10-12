"use client";

import { cn } from "@/lib/utils";
import { useRouter } from "@/lib/app-navigation";
import { Hash, FileText, List, Tag } from "lucide-react";

const templateItems = [
  {
    id: "leads",
    title: "Leads",
    icon: Hash,
    href: "/crm/settings/auto-numbering/leads"
  },
  {
    id: "deals",
    title: "Deals",
    icon: Tag,
    href: "/crm/settings/auto-numbering/deals"
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: FileText,
    href: "/crm/settings/auto-numbering/contacts"
  },
  {
    id: "companies",
    title: "Companies",
    icon: List,
    href: "/crm/settings/auto-numbering/companies"
  }
];

export default function AutoNumberingPage() {
  const router = useRouter();

  const handleItemClick = (href: string) => {
    router.push(href);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
      {templateItems.map((item) => {
        const Icon = item.icon;
        
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "group relative flex flex-col items-center justify-center p-6 aspect-square w-full",
              "border-2 rounded-lg transition-all cursor-pointer",
              "bg-background hover:bg-muted/50",
              "border-border hover:border-primary/50"
            )}
            onClick={() => handleItemClick(item.href)}
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
              {item.title}
            </p>
          </button>
        );
      })}
    </div>
  );
}

