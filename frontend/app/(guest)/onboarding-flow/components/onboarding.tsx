"use client";

import { InterestsStep } from "./interests-step";
import { WorkPreferencesStep } from "./work-preferences-step";
import { AccountTypeStep } from "./account-type-step";
import { CompanyStep } from "./company-step";
import { BranchesStep } from "./branches-step";
import { SubscriptionPlanStep } from "./subscription-plan-step";
import { ProgressIndicator } from "./progress-indicator";
import { useOnboardingStore } from "../store";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/app-navigation";

const userSteps = [InterestsStep, WorkPreferencesStep, AccountTypeStep];
const companySteps = [CompanyStep, BranchesStep, SubscriptionPlanStep];

const companyStepLabels = ["Company Details", "Branches", "Subscription Plan"];

export default function Onboarding() {
  const { type, currentStep, data } = useOnboardingStore();
  const router = useRouter();
  const steps = type === 'company' ? companySteps : userSteps;
  const stepLabels = type === 'company' ? companyStepLabels : ["Interests", "Preferences", "Account Type"];

  if (currentStep >= steps.length) {
    // Onboarding completed
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-card border rounded-lg shadow-lg p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle2 className="w-16 h-16 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Onboarding Completed!</h1>
              <p className="text-muted-foreground text-lg">
                {type === 'company' 
                  ? 'Your company has been set up successfully. You can now start using all the features.' 
                  : 'Your account has been configured successfully.'}
              </p>
            </div>
            <div className="pt-4">
              <Button 
                size="lg" 
                onClick={() => router.push("/default")}
                className="w-full sm:w-auto"
              >
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const CurrentStepComponent = steps[currentStep];

  return (
    <div className="flex min-h-screen pb-8 lg:h-screen lg:pb-0 lg:overflow-hidden">
      {/* Left side - Image/Visual (hidden on mobile) */}
      <div className="hidden w-2/5 bg-gray-100 lg:flex lg:items-center lg:justify-center lg:fixed lg:h-screen">
        <div className="w-full h-full flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-gray-800">Welcome to Nexus Core</h1>
            <p className="text-lg text-gray-600">Let's set up your company profile</p>
            <div className="mt-8">
              <ProgressIndicator 
                currentStep={currentStep} 
                totalSteps={steps.length} 
                stepLabels={stepLabels}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form Content */}
      <div className="flex w-full justify-center lg:w-3/5 bg-background lg:ml-[40%] overflow-y-auto">
        <div className={`w-full ${currentStep === 2 && type === 'company' ? 'max-w-7xl' : 'max-w-2xl'} space-y-6 px-4 py-8`}>
          {/* Progress Indicator for mobile */}
          <div className="lg:hidden">
            <ProgressIndicator 
              currentStep={currentStep} 
              totalSteps={steps.length} 
              stepLabels={stepLabels}
            />
          </div>
          
          {/* Step Content */}
          <div className="bg-card border rounded-lg shadow-sm p-6 sm:p-8">
            <CurrentStepComponent />
          </div>
        </div>
      </div>
    </div>
  );
}

