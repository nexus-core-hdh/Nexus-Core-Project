"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Store, Package, Puzzle, ShoppingBag } from "lucide-react";

const marketItems = [
  {
    id: "marketplace",
    title: "Marketplace",
    icon: Store
  },
  {
    id: "apps",
    title: "Apps",
    icon: Package
  },
  {
    id: "plugins",
    title: "Plugins",
    icon: Puzzle
  },
  {
    id: "extensions",
    title: "Extensions",
    icon: ShoppingBag
  }
];

export default function MarketPage() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
      {marketItems.map((item) => {
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
            onClick={() => setSelectedItem(item.id)}
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

