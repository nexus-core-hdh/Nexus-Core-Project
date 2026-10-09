"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Wallet, Boxes } from "lucide-react";

const paymentOptions = [
  {
    id: "payment-systems",
    title: "Payment Systems",
    icon: Wallet,
    description: "Use the Payment Methods page to specify your company's details, logo, stamp and signature."
  },
  {
    id: "market",
    title: "Market",
    icon: Boxes,
    description: "Use the Payment Methods page to specify your company's details, logo, stamp and signature."
  }
];

export default function PaymentOptionsPage() {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
        {paymentOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedOption === option.id;
          
          return (
            <button
              key={option.id}
              type="button"
              className={cn(
                "group relative flex flex-col items-center justify-center p-6 aspect-square w-full",
                "border-2 rounded-lg transition-all cursor-pointer",
                "bg-background hover:bg-muted/50",
                isSelected 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => setSelectedOption(option.id)}
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
                {option.title}
              </p>
            </button>
          );
        })}
      </div>
      
      <p className="text-center text-sm text-muted-foreground">
        Use the Payment Methods page to specify your company's details, logo, stamp and signature.
      </p>
    </div>
  );
}

