"use client";

import { InterestsStep } from "./interests-step";
import { WorkPreferencesStep } from "./work-preferences-step";
import { AccountTypeStep } from "./account-type-step";
import { CompanyStep } from "./company-step";
import { BranchesStep } from "./branches-step";
import { AdminUserStep } from "./admin-user-step";

import { useOnboardingStore } from "../store";

const userSteps = [InterestsStep, WorkPreferencesStep, AccountTypeStep];
const companySteps = [CompanyStep, BranchesStep, AdminUserStep];

export default function Onboarding() {
  const { type, currentStep, data } = useOnboardingStore();
  const steps = type === 'company' ? companySteps : userSteps;

  if (currentStep >= steps.length) {
    // Onboarding completed
    return (
      <div className="mx-auto max-w-3xl lg:pt-10 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Onboarding Completed!</h1>
          <p className="text-muted-foreground mt-2">
            {type === 'company' ? 'Your company has been set up successfully.' : 'Your account has been configured.'}
          </p>
          <div className="mt-4 p-4 bg-muted rounded-md text-left">
            <h3 className="font-semibold">Collected Data:</h3>
            <pre className="text-sm mt-2">{JSON.stringify(data, null, 2)}</pre>
          </div>
        </div>
      </div>
    );
  }

  const CurrentStepComponent = steps[currentStep];

  return (
    <div className="mx-auto max-w-3xl lg:pt-10">
      <CurrentStepComponent />
    </div>
  );
}