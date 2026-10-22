import { create } from "zustand";

export interface OnboardingData {
  // User onboarding data
  interests: string[];
  workPreferences: {
    workStyle: string;
    experience: string;
    availability: string;
  };
  accountType: string;
  // Company onboarding data
  company: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
    website?: string;
    industry?: string;
    companySize?: string;
    taxId?: string;
    registrationNumber?: string;
    description?: string;
    foundedYear?: string;
    timezone?: string;
    currency?: string;
  };
  branches: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  }[];
  adminUser: {
    name: string;
    email: string;
    password: string;
  };
  subscriptionPlan: string;
}

interface OnboardingStore {
  type: 'user' | 'company';
  currentStep: number;
  data: OnboardingData;
  setType: (type: 'user' | 'company') => void;
  setCurrentStep: (step: number) => void;
  updateInterests: (interests: string[]) => void;
  updateWorkPreferences: (preferences: Partial<OnboardingData["workPreferences"]>) => void;
  updateAccountType: (accountType: string) => void;
  updateCompany: (company: Partial<OnboardingData["company"]>) => void;
  updateBranches: (branches: OnboardingData["branches"]) => void;
  updateAdminUser: (adminUser: Partial<OnboardingData["adminUser"]>) => void;
  updateSubscriptionPlan: (plan: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const initialData: OnboardingData = {
  interests: [],
  workPreferences: {
    workStyle: "",
    experience: "",
    availability: ""
  },
  accountType: "",
  company: {
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    zipCode: "",
    website: "",
    industry: "",
    companySize: "",
    taxId: "",
    registrationNumber: "",
    description: "",
    foundedYear: "",
    timezone: "UTC",
    currency: "USD"
  },
  branches: [],
  adminUser: {
    name: "",
    email: "",
    password: ""
  },
  subscriptionPlan: "Free"
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  type: 'company',
  currentStep: 0,
  data: initialData,
  setType: (type) => set({ type }),
  setCurrentStep: (step) => set({ currentStep: step }),
  updateInterests: (interests) =>
    set((state) => ({
      data: { ...state.data, interests }
    })),
  updateWorkPreferences: (preferences) =>
    set((state) => ({
      data: {
        ...state.data,
        workPreferences: { ...state.data.workPreferences, ...preferences }
      }
    })),
  updateAccountType: (accountType) =>
    set((state) => ({
      data: { ...state.data, accountType }
    })),
  updateCompany: (company) =>
    set((state) => ({
      data: { ...state.data, company: { ...state.data.company, ...company } }
    })),
  updateBranches: (branches) =>
    set((state) => ({
      data: { ...state.data, branches }
    })),
  updateAdminUser: (adminUser) =>
    set((state) => ({
      data: { ...state.data, adminUser: { ...state.data.adminUser, ...adminUser } }
    })),
  updateSubscriptionPlan: (plan) =>
    set((state) => ({
      data: { ...state.data, subscriptionPlan: plan }
    })),
  nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
  prevStep: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),
  reset: () => set({ currentStep: 0, data: initialData })
}));

