"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnboardingStore } from "../store";

const workPreferencesSchema = z.object({
  workStyle: z.string().min(1, "Work style is required"),
  experience: z.string().min(1, "Experience level is required"),
  availability: z.string().min(1, "Availability is required"),
});

type WorkPreferencesForm = z.infer<typeof workPreferencesSchema>;

export function WorkPreferencesStep() {
  const { data, updateWorkPreferences, nextStep } = useOnboardingStore();
  const form = useForm<WorkPreferencesForm>({
    resolver: zodResolver(workPreferencesSchema),
    defaultValues: data.workPreferences,
  });

  const onSubmit = (formData: WorkPreferencesForm) => {
    updateWorkPreferences(formData);
    nextStep();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Work Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="workStyle">Preferred Work Style</Label>
            <Select onValueChange={(value) => form.setValue("workStyle", value)} defaultValue={form.watch("workStyle")}>
              <SelectTrigger>
                <SelectValue placeholder="Select work style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.workStyle && (
              <p className="text-red-500">{form.formState.errors.workStyle.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="experience">Experience Level</Label>
            <Select onValueChange={(value) => form.setValue("experience", value)} defaultValue={form.watch("experience")}>
              <SelectTrigger>
                <SelectValue placeholder="Select experience level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Mid-level</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.experience && (
              <p className="text-red-500">{form.formState.errors.experience.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="availability">Availability</Label>
            <Select onValueChange={(value) => form.setValue("availability", value)} defaultValue={form.watch("availability")}>
              <SelectTrigger>
                <SelectValue placeholder="Select availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full-time">Full-time</SelectItem>
                <SelectItem value="part-time">Part-time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.availability && (
              <p className="text-red-500">{form.formState.errors.availability.message}</p>
            )}
          </div>
          <Button type="submit">Next</Button>
        </form>
      </CardContent>
    </Card>
  );
}