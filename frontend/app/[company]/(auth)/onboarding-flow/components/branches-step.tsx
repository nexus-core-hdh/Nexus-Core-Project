"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Branches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={form.handleSubmit(onAddBranch)} className="space-y-4">
          <div>
            <Label htmlFor="name">Branch Name</Label>
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
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...form.register("phone")} />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...form.register("address")} />
          </div>
          <Button type="submit">Add Branch</Button>
        </form>
        <div>
          <h3>Added Branches:</h3>
          <ul>
            {branches.map((b, i) => (
              <li key={i}>{b.name}</li>
            ))}
          </ul>
        </div>
        <div className="flex justify-between">
          <Button onClick={prevStep}>Back</Button>
          <Button onClick={onNext}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );
}