"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/lib/api";
import { useOnboardingStore } from "../store";
import { useRouter } from "@/lib/app-navigation";
import { UserPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type UserForm = z.infer<typeof userSchema>;

export function AdminUserStep() {
  const { data, updateAdminUser, prevStep } = useOnboardingStore();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: data.adminUser,
  });

  const onSubmit = async (formData: UserForm) => {
    updateAdminUser(formData);
    setIsSubmitting(true);

    try {
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

      // Create admin user
      const userRes = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          role: "admin",
          country: data.company.country || "US",
          image: "/images/avatars/default.png",
          status: "active",
          plan_name: data.subscriptionPlan,
          companyId: company.id,
          branchId: createdBranchIds[0] || null, // assign to first branch
        }),
      });

      if (!userRes.ok) {
        const errorData = await userRes.json();
        throw new Error(errorData.error || "Failed to create admin user");
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
          <UserPlus className="text-primary-foreground size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Create Admin Account</h2>
          <p className="text-muted-foreground text-sm">Set up your administrator account</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...form.register("password")} />
            {form.formState.errors.password && (
              <p className="text-red-500">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={prevStep} disabled={isSubmitting}>
              Back
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
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
        </form>
    </div>
  );
}


