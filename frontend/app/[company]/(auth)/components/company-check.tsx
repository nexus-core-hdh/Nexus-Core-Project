"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "@/lib/app-navigation";
import { API_BASE_URL } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompanyCheck() {
  const router = useRouter();
  const pathname = usePathname();
  const [trialExpired, setTrialExpired] = useState(false);
  const [companyData, setCompanyData] = useState<any>(null);

  useEffect(() => {
    // Skip check for onboarding-flow pages
    if (pathname?.startsWith("/onboarding-flow")) {
      return;
    }

    const checkCompanyAndTrial = async () => {
      // Check if user has company_id
      const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          // If user doesn't have company_id (mandatory), redirect to onboarding
          if (!user.companyId) {
            router.push("/onboarding-flow");
            return;
          }

          // Check trial expiration
          try {
            const companyRes = await fetch(`${API_BASE_URL}/companies/${user.companyId}`);
            if (companyRes.ok) {
              const company = await companyRes.json();
              setCompanyData(company);
              
              // Check if trial has expired. The platform owner (Nexus Core) manages the other
              // companies and their billing, so it is never on a trial.
              if (!company.isPlatformOwner && company.plan === 'Free' && company.trialEndDate) {
                const now = new Date();
                const trialEnd = new Date(company.trialEndDate);
                if (now > trialEnd) {
                  setTrialExpired(true);
                  // Clear auth data and redirect to login
                  localStorage.removeItem('auth_token');
                  localStorage.removeItem('user');
                  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
                }
              }
            }
          } catch (error) {
            console.error("Error checking company trial:", error);
          }
        } catch (error) {
          console.error("Error parsing user data:", error);
        }
      }
    };

    checkCompanyAndTrial();
  }, [router, pathname]);

  // Show trial expired notification
  if (trialExpired) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <Alert className="max-w-md" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Trial Account Expired</AlertTitle>
          <AlertDescription className="mt-2">
            Your trial account has been expired. Please upgrade your plan to continue using the service.
          </AlertDescription>
          <div className="mt-4 flex gap-2">
            <Button 
              onClick={() => {
                window.location.href = '/login/v1';
              }}
              variant="default"
            >
              Go to Login
            </Button>
            <Button 
              onClick={() => {
                // Redirect to billing/upgrade page if available
                window.location.href = '/pages/settings/billing';
              }}
              variant="outline"
            >
              Upgrade Plan
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return null;
}




