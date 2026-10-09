"use client";

import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "../store";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { useRouter } from "@/lib/app-navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

const subscriptionPlans = [
  {
    id: "Free",
    title: "Free",
    price: "Free",
    features: {
      users: true,
      storage: true,
      projects: true,
      taskManagement: true,
      crm: true,
      support: true,
      notifications: true,
      reporting: true,
      api: false,
      integrations: false,
      branding: false,
      backup: false,
      compliance: false,
      audit: false
    }
  },
  {
    id: "Basic",
    title: "Basic",
    price: "$9/month",
    features: {
      users: true,
      storage: true,
      projects: true,
      taskManagement: true,
      crm: true,
      support: true,
      notifications: true,
      reporting: true,
      api: true,
      integrations: false,
      branding: false,
      backup: false,
      compliance: false,
      audit: false
    }
  },
  {
    id: "Pro",
    title: "Pro",
    price: "$19/month",
    features: {
      users: true,
      storage: true,
      projects: true,
      taskManagement: true,
      crm: true,
      support: true,
      notifications: true,
      reporting: true,
      api: true,
      integrations: true,
      branding: true,
      backup: true,
      compliance: false,
      audit: false
    }
  },
  {
    id: "Enterprise",
    title: "Enterprise",
    price: "$49/month",
    features: {
      users: true,
      storage: true,
      projects: true,
      taskManagement: true,
      crm: true,
      support: true,
      notifications: true,
      reporting: true,
      api: true,
      integrations: true,
      branding: true,
      backup: true,
      compliance: true,
      audit: true
    }
  }
];

const featureLabels: Record<string, string> = {
  users: "Users",
  storage: "Storage",
  projects: "Projects",
  taskManagement: "Task Management",
  crm: "CRM",
  support: "Support",
  notifications: "Notifications",
  reporting: "Reporting",
  api: "API & Integrations",
  integrations: "Integrations",
  branding: "Branding",
  backup: "Backup & Export",
  compliance: "Compliance",
  audit: "Audit Logs"
};

export function SubscriptionPlanStep() {
  const { data, updateSubscriptionPlan, prevStep } = useOnboardingStore();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get all unique feature keys across all plans
  const allFeatureKeys = Array.from(
    new Set(subscriptionPlans.flatMap(plan => Object.keys(plan.features)))
  );

  const handleComplete = async () => {
    if (!data.subscriptionPlan) {
      toast.error("Please select a subscription plan");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user from localStorage (created during registration)
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (!userStr) {
        throw new Error("User not found. Please register first.");
      }
      const currentUser = JSON.parse(userStr);

      // Create company with selected plan and all company data
      const companyRes = await fetch(`${API_BASE_URL}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.company.name,
          email: data.company.email,
          phone: data.company.phone,
          address: data.company.address,
          website: data.company.website,
          industry: data.company.industry,
          plan: data.subscriptionPlan || 'Free',
          // Additional fields for future use
          city: data.company.city,
          state: data.company.state,
          country: data.company.country,
          zipCode: data.company.zipCode,
          companySize: data.company.companySize,
          taxId: data.company.taxId,
          registrationNumber: data.company.registrationNumber,
          description: data.company.description,
          foundedYear: data.company.foundedYear,
          timezone: data.company.timezone,
          currency: data.company.currency,
        }),
      });
      
      if (!companyRes.ok) {
        const errorData = await companyRes.json();
        throw new Error(errorData.error || "Failed to create company");
      }
      
      const company = await companyRes.json();

      // Create branches
      const createdBranchIds: number[] = [];
      for (const branch of data.branches) {
        const branchRes = await fetch(`${API_BASE_URL}/branches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...branch, companyId: company.id }),
        });
        
        if (!branchRes.ok) {
          const errorData = await branchRes.json();
          throw new Error(errorData.error || "Failed to create branch");
        }
        
        const createdBranch = await branchRes.json();
        createdBranchIds.push(createdBranch.id);
      }

      // Update existing user to associate with company
      const userRes = await fetch(`${API_BASE_URL}/users/${currentUser.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...(typeof window !== 'undefined' && localStorage.getItem('auth_token') 
            ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            : {})
        },
        body: JSON.stringify({
          companyId: company.id,
          branchId: createdBranchIds[0] || null,
          role: "admin",
          plan_name: data.subscriptionPlan,
        }),
      });

      if (!userRes.ok) {
        const errorData = await userRes.json();
        throw new Error(errorData.error || "Failed to update user");
      }

      // Update user in localStorage
      const updatedUser = await userRes.json();
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      // Onboarding completed successfully
      toast.success("Company setup completed successfully!");
      router.push("/default");
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast.error("Setup failed", {
        description: error.message || "An error occurred during onboarding. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary flex size-10 items-center justify-center rounded-full">
          <Sparkles className="text-primary-foreground size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Choose Your Plan</h2>
          <p className="text-muted-foreground text-sm">Select the subscription plan that fits your needs</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Features</TableHead>
                  {subscriptionPlans.map((plan) => (
                    <TableHead key={plan.id} className="text-center relative">
                      <button
                        onClick={() => updateSubscriptionPlan(plan.id)}
                        className={`font-semibold text-lg transition-colors ${
                          data.subscriptionPlan === plan.id 
                            ? "text-primary" 
                            : "text-foreground hover:text-primary"
                        }`}
                      >
                        {plan.title}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Price Row */}
                <TableRow>
                  <TableCell className="font-medium">Price</TableCell>
                  {subscriptionPlans.map((plan) => (
                    <TableCell 
                      key={plan.id} 
                      className={`text-center ${
                        data.subscriptionPlan === plan.id ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="font-semibold text-lg">
                        {plan.price === "Free" ? (
                          plan.price
                        ) : (
                          plan.price
                        )}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>

                {/* Feature Rows */}
                {allFeatureKeys.map((featureKey) => (
                  <TableRow key={featureKey}>
                    <TableCell className="font-medium">
                      {featureLabels[featureKey] || featureKey}
                    </TableCell>
                    {subscriptionPlans.map((plan) => (
                      <TableCell 
                        key={plan.id} 
                        className={`text-center ${
                          data.subscriptionPlan === plan.id ? "bg-primary/5" : ""
                        }`}
                      >
                        {plan.features[featureKey as keyof typeof plan.features] ? (
                          <Check className="mx-auto h-5 w-5 text-green-500" />
                        ) : (
                          <X className="mx-auto h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

                {/* Select Button Row */}
                <TableRow>
                  <TableCell></TableCell>
                  {subscriptionPlans.map((plan) => (
                    <TableCell 
                      key={plan.id} 
                      className={`text-center ${
                        data.subscriptionPlan === plan.id ? "bg-primary/5" : ""
                      }`}
                    >
                      <Button
                        variant={data.subscriptionPlan === plan.id ? "default" : "outline"}
                        onClick={() => updateSubscriptionPlan(plan.id)}
                        className="w-full"
                      >
                        {data.subscriptionPlan === plan.id ? "Selected" : `Choose ${plan.title}`}
                      </Button>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={prevStep} disabled={isSubmitting}>
          Back
        </Button>
        <Button size="lg" onClick={handleComplete} disabled={!data.subscriptionPlan || isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : (
            "Complete Setup"
          )}
        </Button>
      </div>
    </div>
  );
}
