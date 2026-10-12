"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnboardingStore } from "../store";

const accountTypeSchema = z.object({
  accountType: z.string().min(1, "Account type is required"),
});

type AccountTypeForm = z.infer<typeof accountTypeSchema>;

export function AccountTypeStep() {
  const { data, updateAccountType, nextStep } = useOnboardingStore();
  const form = useForm<AccountTypeForm>({
    resolver: zodResolver(accountTypeSchema),
    defaultValues: { accountType: data.accountType },
  });

  const onSubmit = (formData: AccountTypeForm) => {
    updateAccountType(formData.accountType);
    nextStep();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Account Type</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="accountType">Select Account Type</Label>
            <Select onValueChange={(value) => form.setValue("accountType", value)} defaultValue={form.watch("accountType")}>
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="freelancer">Freelancer</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.accountType && (
              <p className="text-red-500">{form.formState.errors.accountType.message}</p>
            )}
          </div>
          <Button type="submit">Next</Button>
        </form>
      </CardContent>
    </Card>
  );
}