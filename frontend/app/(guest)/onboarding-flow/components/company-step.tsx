"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOnboardingStore } from "../store";
import { Building2 } from "lucide-react";

const companySchema = z.object({
  // Basic Information
  name: z.string().min(1, "Company name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  industry: z.string().optional(),
  
  // Address Information
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipCode: z.string().optional(),
  
  // Company Details
  companySize: z.string().optional(),
  description: z.string().optional(),
  foundedYear: z.string().optional(),
  
  // Business Information
  taxId: z.string().optional(),
  registrationNumber: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
});

type CompanyForm = z.infer<typeof companySchema>;

const companySizes = [
  "1-10 employees",
  "11-50 employees",
  "51-200 employees",
  "201-500 employees",
  "501-1000 employees",
  "1000+ employees"
];

const industries = [
  "Technology",
  "Healthcare",
  "Finance",
  "Retail",
  "Manufacturing",
  "Education",
  "Real Estate",
  "Consulting",
  "Marketing",
  "Legal",
  "Hospitality",
  "Transportation",
  "Other"
];

const timezones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney"
];

const currencies = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "SGD"
];

export function CompanyStep() {
  const { data, updateCompany, nextStep } = useOnboardingStore();
  const form = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      ...data.company,
      website: data.company.website || "",
    },
  });

  const onSubmit = (formData: CompanyForm) => {
    updateCompany(formData);
    nextStep();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary flex size-10 items-center justify-center rounded-full">
          <Building2 className="text-primary-foreground size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Company Information</h2>
          <p className="text-muted-foreground text-sm">Tell us about your company</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input 
                id="name" 
                {...form.register("name")} 
                placeholder="Enter company name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Company Email *</Label>
              <Input 
                id="email" 
                type="email" 
                {...form.register("email")} 
                placeholder="company@example.com"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input 
                id="phone" 
                {...form.register("phone")} 
                placeholder="+1 (555) 123-4567"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input 
                id="website" 
                type="url"
                {...form.register("website")} 
                placeholder="https://www.example.com"
              />
              {form.formState.errors.website && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.website.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select 
                value={form.watch("industry") || ""} 
                onValueChange={(value) => form.setValue("industry", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="companySize">Company Size</Label>
              <Select 
                value={form.watch("companySize") || ""} 
                onValueChange={(value) => form.setValue("companySize", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company size" />
                </SelectTrigger>
                <SelectContent>
                  {companySizes.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Address Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Address Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="address">Street Address</Label>
              <Input 
                id="address" 
                {...form.register("address")} 
                placeholder="123 Main Street"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input 
                id="city" 
                {...form.register("city")} 
                placeholder="New York"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input 
                id="state" 
                {...form.register("state")} 
                placeholder="NY"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input 
                id="country" 
                {...form.register("country")} 
                placeholder="United States"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP/Postal Code</Label>
              <Input 
                id="zipCode" 
                {...form.register("zipCode")} 
                placeholder="10001"
              />
            </div>
          </div>
        </div>

        {/* Company Details Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Company Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="foundedYear">Founded Year</Label>
              <Input 
                id="foundedYear" 
                type="number"
                {...form.register("foundedYear")} 
                placeholder="2020"
                min="1900"
                max={new Date().getFullYear()}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select 
                value={form.watch("timezone") || "UTC"} 
                onValueChange={(value) => form.setValue("timezone", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select 
                value={form.watch("currency") || "USD"} 
                onValueChange={(value) => form.setValue("currency", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((curr) => (
                    <SelectItem key={curr} value={curr}>
                      {curr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="description">Company Description</Label>
              <Textarea 
                id="description" 
                {...form.register("description")} 
                placeholder="Tell us about your company..."
                rows={4}
              />
            </div>
          </div>
        </div>

        {/* Business Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Business Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID / EIN</Label>
              <Input 
                id="taxId" 
                {...form.register("taxId")} 
                placeholder="12-3456789"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="registrationNumber">Registration Number</Label>
              <Input 
                id="registrationNumber" 
                {...form.register("registrationNumber")} 
                placeholder="Registration number"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" size="lg">
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
