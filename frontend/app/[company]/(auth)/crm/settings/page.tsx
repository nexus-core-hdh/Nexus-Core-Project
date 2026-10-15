"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import {
  BookOpen,
  Coins,
  MapPin,
  Calculator,
  Ruler,
  List,
  Handshake,
  FileText,
  Building2,
  Boxes
} from "lucide-react";

const menuItems = [
  {
    id: "statuses",
    title: "Statuses and Dropdowns",
    icon: BookOpen,
    href: "/crm/statuses-dropdowns"
  },
  {
    id: "currency",
    title: "Currency",
    icon: Coins,
    href: "/pages/currencies"
  },
  {
    id: "locations",
    title: "Locations",
    icon: MapPin,
    href: "/pages/locations"
  },
  {
    id: "taxes",
    title: "Taxes",
    icon: Calculator,
    href: "/pages/taxes"
  },
  {
    id: "units",
    title: "Units of Measurement",
    icon: Ruler,
    href: "/pages/units"
  },
  {
    id: "properties",
    title: "Product Properties",
    icon: List,
    href: "/pages/product-properties"
  },
  {
    id: "pipelines",
    title: "Deal Pipelines",
    icon: Handshake,
    href: "/pages/deal-pipelines"
  },
  {
    id: "templates",
    title: "Contact or Company Details Templates",
    icon: FileText,
    href: "#"
  },
  {
    id: "company",
    title: "My Company Details",
    icon: Building2,
    href: "/pages/companies"
  },
  {
    id: "presets",
    title: "Solution presets",
    icon: Boxes,
    href: "#"
  }
];

export default function StartPointPage() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const router = useRouter();

  const handleItemClick = (item: typeof menuItems[0]) => {
    if (item.href && item.href !== "#") {
      router.push(item.href);
    } else {
      setSelectedItem(item.id);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isSelected = selectedItem === item.id;
        
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "group relative flex flex-col items-center justify-center p-6 aspect-square w-full",
              "border-2 rounded-lg transition-all cursor-pointer",
              "bg-background hover:bg-muted/50",
              isSelected 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50"
            )}
            onClick={() => handleItemClick(item)}
          >
            <div className={cn(
              "mb-4 flex items-center justify-center",
              "h-16 w-16 rounded-lg",
              isSelected ? "bg-primary/10" : "bg-muted"
            )}>
              <Icon className={cn(
                "h-8 w-8",
                isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
            </div>
            <p className={cn(
              "text-xs sm:text-sm text-center font-medium leading-tight px-2",
              isSelected ? "text-primary" : "text-foreground"
            )}>
              {item.title}
            </p>
          </button>
        );
      })}
    </div>
  );
}

