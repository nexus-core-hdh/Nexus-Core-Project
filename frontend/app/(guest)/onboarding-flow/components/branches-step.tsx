"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, X } from "lucide-react";
import { useOnboardingStore } from "../store";

const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type BranchForm = z.infer<typeof branchSchema>;

export function BranchesStep() {
  const { data, updateBranches, nextStep, prevStep } = useOnboardingStore();
  const [branches, setBranches] = useState(data.branches);
  const form = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
  });

  const onAddBranch = (formData: BranchForm) => {
    setBranches([...branches, formData]);
    form.reset();
  };

  const onNext = () => {
    updateBranches(branches);
    nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary flex size-10 items-center justify-center rounded-full">
          <Building2 className="text-primary-foreground size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Company Branches</h2>
          <p className="text-muted-foreground text-sm">Add your company branches (optional)</p>
        </div>
      </div>

      <div className="space-y-4">
        <form onSubmit={form.handleSubmit(onAddBranch)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Branch Name</Label>
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
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...form.register("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...form.register("address")} />
          </div>
          <Button type="submit" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Branch
          </Button>
        </form>
        {branches.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Added Branches ({branches.length})</h3>
            <div className="space-y-2">
              {branches.map((branch, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{branch.name}</p>
                    {branch.email && <p className="text-sm text-muted-foreground">{branch.email}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const updated = branches.filter((_, idx) => idx !== i);
                      setBranches(updated);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={prevStep}>
            Back
          </Button>
          <Button onClick={onNext} size="lg">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}


