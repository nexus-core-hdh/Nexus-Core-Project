"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/api";
import { useOnboardingStore } from "../store";
import { useRouter } from "@/lib/app-navigation";

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type UserForm = z.infer<typeof userSchema>;

export function AdminUserStep() {
  const { data, updateAdminUser, prevStep } = useOnboardingStore();
  const router = useRouter();
  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: data.adminUser,
  });

  const onSubmit = async (formData: UserForm) => {
    updateAdminUser(formData);

    try {
      // Create company
      const companyRes = await fetch(`${API_BASE_URL}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.company),
      });
      const company = await companyRes.json();

      // Create branches
      const createdBranchIds: number[] = [];
      for (const branch of data.branches) {
        const branchRes = await fetch(`${API_BASE_URL}/branches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...branch, companyId: company.id }),
        });
        const createdBranch = await branchRes.json();
        createdBranchIds.push(createdBranch.id);
      }

      // Create admin user
      await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          role: "admin",
          country: "US", // default
          image: "/images/avatars/default.png",
          status: "active",
          plan_name: "Free",
          companyId: company.id,
          branchId: createdBranchIds[0] || null, // assign to first branch
        }),
      });

      alert("Onboarding completed!");
      router.push("/companies");
    } catch (error) {
      console.error(error);
      alert("Error during onboarding");
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Admin User</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...form.register("password")} />
            {form.formState.errors.password && (
              <p className="text-red-500">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="flex justify-between">
            <Button onClick={prevStep}>Back</Button>
            <Button type="submit">Complete Onboarding</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}