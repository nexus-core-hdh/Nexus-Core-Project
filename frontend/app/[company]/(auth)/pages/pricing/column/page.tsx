"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Check } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { pricingPlansApi, companiesApi, subscriptionApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { useRouter } from "@/lib/app-navigation";

type PricingPlan = {
  id: number;
  name: string;
  description?: string;
  price: number;
  yearlyPrice?: number;
  industry?: string;
  features: any[];
  enabledMenuItems?: any[];
  isActive: boolean;
};

export default function Page() {
  const [isYearly, setIsYearly] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingPlanId, setUpdatingPlanId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadPricingPlans = async () => {
      try {
        setIsLoading(true);
        const user = getCurrentUser();
        
        if (!user?.companyId) {
          toast.error("Company information not found");
          return;
        }

        // Get company to find industry
        const companies = await companiesApi.getCompanies();
        const company = companies.find((c: any) => c.id === user.companyId);
        
        if (!company) {
          toast.error("Company not found");
          return;
        }

        // Fetch plans by industry (or all if no industry)
        const industry = company.industry || "";
        const plans = await pricingPlansApi.getPricingPlansByIndustry(industry);
        
        // Limit to 3 plans as per requirements
        setPricingTiers(plans.slice(0, 3));
      } catch (error: any) {
        console.error("Failed to load pricing plans:", error);
        toast.error("Failed to load pricing plans");
      } finally {
        setIsLoading(false);
      }
    };

    loadPricingPlans();
  }, []);

  const faqs = [
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept all major credit components, including Visa, MasterCard, American Express, and Discover. We also support PayPal for your convenience."
    },
    {
      question: "Can I cancel my subscription at any time?",
      answer:
        "Yes, you can cancel your subscription at any time. If you cancel, you'll continue to have access to the platform until the end of your current billing period."
    },
    {
      question: "Is there a limit to how many courses I can take?",
      answer:
        "No, there's no limit. With our Premium Plan, you have unlimited access to all courses on our platform. You can take as many courses as you like, at your own pace."
    },
    {
      question: "Do you offer a free trial?",
      answer:
        "We offer a 7-day free trial for new users. This allows you to explore our platform and content before committing to a subscription. No credit card is required for the trial."
    },
    {
      question: "Are the courses downloadable for offline viewing?",
      answer:
        "Yes, our mobile app allows you to download courses for offline viewing. This feature is available for both iOS and Android devices."
    }
  ];

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const calculateYearlySavings = (monthlyPrice: number, yearlyPrice: number) => {
    const yearlyCost = monthlyPrice * 12;
    const savings = yearlyCost - yearlyPrice;
    const savingsPercentage = (savings / yearlyCost) * 100;
    return savingsPercentage.toFixed(0);
  };

  // Map pricing plan name to Plan enum value
  const mapPlanNameToEnum = (planName: string): string => {
    const name = planName.toLowerCase();
    if (name.includes('free')) return 'Free';
    if (name.includes('basic')) return 'Basic';
    if (name.includes('pro')) return 'Pro';
    if (name.includes('enterprise')) return 'Enterprise';
    // Default: try to match the name directly (capitalize first letter)
    return planName.charAt(0).toUpperCase() + planName.slice(1).toLowerCase();
  };

  const handleChoosePlan = async (plan: PricingPlan) => {
    try {
      setUpdatingPlanId(plan.id);
      const user = getCurrentUser();
      
      if (!user?.companyId) {
        toast.error("Company information not found");
        return;
      }

      // Map plan name to enum value
      const planEnum = mapPlanNameToEnum(plan.name);
      
      // Determine billing cycle
      const billingCycle = isYearly ? 'Yearly' : 'Monthly';

      // Update company plan
      const updatedCompany = await subscriptionApi.updateCompanyPlan(user.companyId, {
        plan: planEnum,
        billingCycle: planEnum === 'Free' ? undefined : billingCycle,
      });

      // Update user data in localStorage to reflect the new plan
      if (updatedCompany) {
        const userData = getCurrentUser();
        if (userData && userData.company) {
          userData.company.plan = updatedCompany.plan;
          userData.company.subscriptionStatus = updatedCompany.subscriptionStatus;
          userData.company.billingCycle = updatedCompany.billingCycle;
          localStorage.setItem("user", JSON.stringify(userData));
        }
      }

      toast.success(`Successfully upgraded to ${plan.name} plan!`);
      
      // Refresh the page after a short delay to show the success message
      setTimeout(() => {
        router.refresh();
        // Optionally redirect to billing page
        // router.push("/pages/settings/billing");
      }, 1500);
    } catch (error: any) {
      console.error("Failed to update plan:", error);
      toast.error(error.message || "Failed to update plan. Please try again.");
    } finally {
      setUpdatingPlanId(null);
    }
  };

  return (
    <div className="mx-auto max-w-(--breakpoint-lg) py-6 lg:py-8">
      <div className="mb-4 flex flex-col items-start justify-between space-y-2 lg:flex-row lg:items-center">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Choose Your Plan</h1>
        <div className="flex items-center space-x-3">
          <span className={`text-sm ${!isYearly ? "font-bold" : ""}`}>Monthly</span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            aria-label="Toggle yearly pricing"
          />
          <span className={`text-sm ${isYearly ? "font-bold" : ""}`}>Yearly</span>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Loading pricing plans...</p>
        </div>
      ) : pricingTiers.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No pricing plans available for your industry.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {pricingTiers.map((tier, index) => {
            const monthlyPrice = tier.price;
            const yearlyPrice = tier.yearlyPrice || monthlyPrice * 12;
            const features = Array.isArray(tier.features) 
              ? tier.features.map((f: any) => typeof f === 'string' ? f : f.text || f.name || "")
              : [];

            return (
              <Card key={tier.id || index} className="relative flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  {tier.description && (
                    <CardDescription className="text-sm">{tier.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="grow space-y-3">
                  <div>
                    <p className="text-3xl font-bold">
                      {isYearly ? formatPrice(yearlyPrice) : formatPrice(monthlyPrice)}
                      <span className="text-sm font-normal text-muted-foreground">/{isYearly ? "year" : "month"}</span>
                    </p>
                    {isYearly && yearlyPrice < monthlyPrice * 12 && (
                      <Badge variant="default" className="absolute end-3 top-3 text-xs">
                        Save {calculateYearlySavings(monthlyPrice, yearlyPrice)}%
                      </Badge>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {features.map((feature: string, featureIndex: number) => (
                      <li key={featureIndex} className="flex items-start text-sm">
                        <Check className="mr-2 h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="pt-3">
                  <Button 
                    className="w-full" 
                    size="sm"
                    onClick={() => handleChoosePlan(tier)}
                    disabled={updatingPlanId === tier.id || updatingPlanId !== null}>
                    {updatingPlanId === tier.id ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Updating...
                      </>
                    ) : (
                      `Choose ${tier.name}`
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <div className="my-6 lg:my-8">
        <h2 className="mb-3 text-lg font-semibold">Why Choose Our Platform?</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Comprehensive Library</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Access thousands of courses across various disciplines
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Expert Instructors</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Learn from industry professionals and thought leaders
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Flexible Learning</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">Study at your own pace, anytime and anywhere</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 max-w-(--breakpoint-sm)">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Frequently Asked Questions</h2>
          <Card>
            <CardContent className="p-4">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-sm">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
