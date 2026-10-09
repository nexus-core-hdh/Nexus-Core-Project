"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/app-navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    
    if (token) {
      // Redirect to dashboard if logged in
      router.push("/default");
    } else {
      // Redirect to login if not logged in
      router.push("/login/v1");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>
  );
}




