"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Onboarding from "./components/onboarding";
import { useOnboardingStore } from "./store";

export default function Page() {
  const searchParams = useSearchParams();
  const type = (searchParams.get('type') as 'user' | 'company') || 'company';
  const { setType } = useOnboardingStore();

  useEffect(() => {
    setType(type);
  }, [type, setType]);

  return <Onboarding />;
}


























































