"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function ProgressIndicator({ currentStep, totalSteps, stepLabels }: ProgressIndicatorProps) {
  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between">
        {stepLabels.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep + 1;
          const isCurrent = stepNumber === currentStep + 1;
          
          return (
            <div key={index} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : isCurrent
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-background border-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{stepNumber}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center max-w-[100px]",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
              {index < stepLabels.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 transition-colors",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


