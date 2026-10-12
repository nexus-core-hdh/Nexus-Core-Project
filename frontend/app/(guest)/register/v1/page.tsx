"use client";

import Link from "@/components/app-link";
import Image from "next/image";
import { useRouter } from "@/lib/app-navigation";
import { useState } from "react";
import { generateMeta } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/lib/api";

export default function Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const first_name = formData.get("first_name") as string;
    const last_name = formData.get("last_name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      // Create user account
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${first_name} ${last_name}`,
          email,
          password,
          country: "US", // default
          role: "admin",
          image: "/images/avatars/default.png",
          status: "active",
          plan_name: "Free", // Default to Free plan initially
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Registration failed");
      }

      const userData = await response.json();
      
      // Store user in localStorage for onboarding flow
      if (userData.id) {
        localStorage.setItem('user', JSON.stringify({
          id: userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
          companyId: userData.companyId || null,
          branchId: userData.branchId || null,
        }));
      }

      // After successful registration, redirect to company onboarding
      setIsLoading(false);
      
      // Redirect to onboarding flow - use window.location to ensure it works
      window.location.href = "/onboarding-flow";
    } catch (err: any) {
      setError(err.message || "An error occurred during registration");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex pb-8 lg:h-screen lg:pb-0">
      {/* Same brand panel as login/v1: white in both themes with a soft brand-blue glow;
          mix-blend-multiply blends the artwork's off-white background into the panel. */}
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.10),transparent_55%)]" />
        <Image
          width={948}
          height={686}
          src="/brand/nexus-core-logo.png"
          alt="Nexus Core — Every Document. One Core."
          className="relative w-[72%] max-w-xl object-contain mix-blend-multiply"
          priority
          unoptimized
        />
      </div>

      <div className="flex w-full items-center justify-center lg:w-1/2">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            {/* On small screens the brand panel is hidden — show the logo above the form instead. */}
            <Image
              width={948}
              height={686}
              src="/brand/nexus-core-logo.png"
              alt="Nexus Core"
              className="mx-auto mt-6 w-56 rounded-lg bg-white object-contain lg:hidden"
              unoptimized
            />
            <h2 className="mt-6 text-3xl font-bold">Create New Account</h2>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="first_name" className="sr-only">
                  First name
                </Label>
                <Input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  className="w-full"
                  placeholder="First name"
                />
              </div>
              <div>
                <Label htmlFor="last_name" className="sr-only">
                  Last name
                </Label>
                <Input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  className="w-full"
                  placeholder="Last name"
                />
              </div>
              <div>
                <Label htmlFor="email" className="sr-only">
                  Email address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full"
                  placeholder="Email address"
                />
              </div>
              <div>
                <Label htmlFor="password" className="sr-only">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full"
                  placeholder="Password"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center">{error}</div>
            )}
            <div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Registering..." : "Register"}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm">
            Have an account?{" "}
            <Link href="/login/v1" className="underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
