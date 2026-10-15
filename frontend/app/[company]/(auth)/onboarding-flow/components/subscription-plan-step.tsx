"use client";

import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "../store";
import { CreditCard, Zap, Crown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const subscriptionPlans = [
  {
    id: "Basic",
    title: "Basic",
    description: "Perfect for small teams",
    icon: CreditCard,
    emoji: "💳",
    features: ["Up to 5 users", "Basic support", "Core features"],
    price: "$9/month",
    color: "from-green-500 to-emerald-500"
  },
  {
    id: "Team",
    title: "Team",
    description: "Ideal for growing businesses",
    icon: Zap,
    emoji: "⚡",
    features: ["Up to 20 users", "Priority support", "Advanced features"],
    price: "$29/month",
    color: "from-blue-500 to-indigo-500"
  },
  {
    id: "Enterprise",
    title: "Enterprise",
    description: "For large organizations",
    icon: Crown,
    emoji: "👑",
    features: ["Unlimited users", "Dedicated support", "Custom integrations"],
    price: "$99/month",
    color: "from-purple-500 to-pink-500"
  }
];

export function SubscriptionPlanStep() {
  const { data, updateSubscriptionPlan, nextStep, prevStep } = useOnboardingStore();

  return (
    <div className="space-y-8">
      <div className="flex gap-3">
        <div className="bg-primary flex size-8 items-center justify-center rounded-full">
          <CreditCard className="text-primary-foreground size-4" />
        </div>
        <h1 className="text-2xl font-bold">Choose your subscription plan</h1>
      </div>

      <div className="space-y-6">
        <RadioGroup
          value={data.subscriptionPlan}
          onValueChange={updateSubscriptionPlan}
          className="grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {subscriptionPlans.map((plan) => {
            return (
              <div key={plan.id} className="relative">
                <RadioGroupItem value={plan.id} id={plan.id} className="peer sr-only" />
                <Label
                  htmlFor={plan.id}
                  className="peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:border-primary hover:border-primary flex cursor-pointer flex-col items-start space-y-2 rounded-md border px-4 py-6">
                  <div className="text-3xl">{plan.emoji}</div>
                  <h3 className="text-xl font-bold">{plan.title}</h3>
                  <p className="text-muted-foreground">{plan.description}</p>
                  <p className="text-lg font-semibold">{plan.price}</p>
                  <ul className="text-muted-foreground list-inside list-disc space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button size="lg" onClick={nextStep} disabled={!data.subscriptionPlan}>
          Next
        </Button>
      </div>
    </div>
  );
}