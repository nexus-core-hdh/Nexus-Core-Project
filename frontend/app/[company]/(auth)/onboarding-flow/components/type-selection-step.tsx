"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnboardingStore } from "../store";

export function TypeSelectionStep() {
  const { setType, nextStep } = useOnboardingStore();

  const handleUser = () => {
    setType('user');
    nextStep();
  };

  const handleCompany = () => {
    setType('company');
    nextStep();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Welcome to Onboarding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          Please select your account type to get started.
        </p>
        <div className="flex gap-4">
          <Button onClick={handleUser} className="flex-1">
            I'm a User
          </Button>
          <Button onClick={handleCompany} variant="outline" className="flex-1">
            I'm a Company
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}