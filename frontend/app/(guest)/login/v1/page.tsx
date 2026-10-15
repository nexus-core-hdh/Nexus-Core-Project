"use client";

import Link from "@/components/app-link";
import Image from "next/image";
import { useRouter } from "@/lib/app-navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { nexuscoreAuth } from "@/lib/nexuscore-api";
import { nextPathFromLocation } from "@/lib/safe-next";
import { setCompanySlugCookie } from "@/lib/company-path";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordChangeDialog, setShowPasswordChangeDialog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  // Social login disabled for now.

  // Function to get device and browser info
  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let device = 'Unknown';
    let browser = 'Unknown';
    let os = 'Unknown';

    // Detect device
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      device = 'Tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
      device = 'Mobile';
    } else {
      device = 'Desktop';
    }

    // Detect browser
    if (ua.indexOf('Firefox') > -1) {
      browser = 'Firefox';
    } else if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
      browser = 'Chrome';
    } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
      browser = 'Safari';
    } else if (ua.indexOf('Edg') > -1) {
      browser = 'Edge';
    } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
      browser = 'Opera';
    }

    // Detect OS
    if (ua.indexOf('Win') > -1) {
      os = 'Windows';
    } else if (ua.indexOf('Mac') > -1) {
      os = 'macOS';
    } else if (ua.indexOf('Linux') > -1) {
      os = 'Linux';
    } else if (ua.indexOf('Android') > -1) {
      os = 'Android';
    } else if (ua.indexOf('iOS') > -1 || /iPad|iPhone|iPod/.test(ua)) {
      os = 'iOS';
    }

    return { device, browser, os, userAgent: ua };
  };

  // Function to get geolocation
  const getGeolocation = (): Promise<{ latitude?: number; longitude?: number; city?: string; region?: string; country?: string; timezone?: string }> => {
    return new Promise((resolve) => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // First, try to get location from IP-based geolocation (more reliable, no permission needed)
      const getLocationFromIP = async () => {
        try {
          // Try ip-api.com first (most reliable free service, allows CORS)
          try {
            const response = await fetch('https://ip-api.com/json/?fields=status,message,country,regionName,city,lat,lon,timezone', { 
              signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.status === 'success') {
                resolve({
                  latitude: data.lat || null,
                  longitude: data.lon || null,
                  city: data.city || null,
                  region: data.regionName || null,
                  country: data.country || null,
                  timezone: data.timezone || timezone,
                });
                return;
              }
            }
          } catch (e) {
            console.log('ip-api.com failed, trying alternatives:', e);
          }
          
          // Fallback: Try ipapi.co (may have CORS issues but worth trying)
          try {
            const response = await fetch('https://ipapi.co/json/', { 
              signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.city || data.country_name) {
                resolve({
                  latitude: data.latitude || null,
                  longitude: data.longitude || null,
                  city: data.city || null,
                  region: data.region || null,
                  country: data.country_name || null,
                  timezone: data.timezone || timezone,
                });
                return;
              }
            }
          } catch (e) {
            console.log('ipapi.co failed:', e);
          }
        } catch (error) {
          console.log('IP geolocation failed:', error);
        }
        
        // If IP geolocation fails, try browser geolocation
        if (!navigator.geolocation) {
          resolve({ timezone });
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            
            // Try to get location details from reverse geocoding API
            const reverseGeocodeServices = [
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            ];
            
            for (const serviceUrl of reverseGeocodeServices) {
              try {
                const response = await fetch(serviceUrl, {
                  signal: AbortSignal.timeout(3000)
                });
                if (!response.ok) continue;
                
                const data = await response.json();
                
                let city, region, country;
                
                if (serviceUrl.includes('bigdatacloud')) {
                  city = data.city || data.locality;
                  region = data.principalSubdivision || data.region;
                  country = data.countryName;
                } else if (serviceUrl.includes('nominatim')) {
                  const addr = data.address || {};
                  city = addr.city || addr.town || addr.village;
                  region = addr.state || addr.region;
                  country = addr.country;
                }
                
                resolve({
                  latitude,
                  longitude,
                  city: city || null,
                  region: region || null,
                  country: country || null,
                  timezone,
                });
                return;
              } catch (error) {
                continue; // Try next service
              }
            }
            
            // If reverse geocoding fails, at least return coordinates
            resolve({
              latitude,
              longitude,
              timezone,
            });
          },
          (error) => {
            console.log('Browser geolocation failed:', error);
            // If all methods fail, just return timezone
            resolve({ timezone });
          },
          { 
            timeout: 10000, // Increased timeout
            enableHighAccuracy: false, // Faster, less accurate is fine
            maximumAge: 300000 // Accept cached position up to 5 minutes old
          }
        );
      };
      
      // Start with IP-based geolocation (no permission needed)
      getLocationFromIP().catch(() => {
        // If IP geolocation completely fails, just return timezone
        resolve({ timezone });
      });
    });
  };

  // Note: Social login disabled for now.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Trim email to remove whitespace
      const trimmedEmail = email.trim();
      
      if (!trimmedEmail) {
        toast.error("Please enter your email");
        setIsLoading(false);
        return;
      }

      if (!password) {
        toast.error("Please enter your password");
        setIsLoading(false);
        return;
      }

      console.log('Attempting login with email:', trimmedEmail);
      
      // Get geolocation and device info
      const geoData = await getGeolocation();
      const deviceInfo = getDeviceInfo();
      
      // Log geolocation data for debugging
      console.log('Geolocation data:', geoData);
      console.log('Device info:', deviceInfo);
      
      // Get IP address (will be captured on backend from request headers)
      const loginData = {
        email: trimmedEmail,
        password,
        ...geoData,
        ...deviceInfo,
      };
      
      const data = await nexuscoreAuth.login(loginData);

      // Store token in localStorage and cookie
      if (data.accessToken) {
        localStorage.setItem("auth_token", data.accessToken);
        localStorage.setItem("nc_token", data.accessToken);
        localStorage.setItem("user", JSON.stringify(data.user));

        // Set cookie for server-side auth checks
        document.cookie = `auth_token=${data.accessToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
        // Company slug for the /{slug}/... app URLs (read by proxy.ts).
        setCompanySlugCookie(data.user?.company?.slug);
      }

      // Check if password change is required
      if (data.user?.mustChangePassword && data.user?.id) {
        setCurrentUserId(data.user.id);
        setShowPasswordChangeDialog(true);
        setIsLoading(false);
        return;
      }

      // Check if user has company_id (mandatory) - if not, redirect to onboarding
      if (!data.user?.companyId) {
        toast.info("Please complete company setup to continue");
        router.push("/onboarding-flow");
        setIsLoading(false);
        return;
      }

      toast.success("Login successful!");
      
      // Redirect to default dashboard
      router.push(nextPathFromLocation() ?? "/default");
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Check if trial has expired
      if (error.status === 403 && (error.trialExpired || error.message?.includes('Trial expired'))) {
        const errorMessage = error.message || "Your trial account has been expired. Please upgrade your plan to continue.";
        toast.error("Trial Account Expired", {
          description: errorMessage,
          duration: 10000,
        });
        // Optionally redirect to billing page
        setTimeout(() => {
          router.push("/pages/settings/billing");
        }, 2000);
        setIsLoading(false);
        return;
      }
      
      const errorMessage = error.message || "Invalid email or password";
      toast.error("Login failed", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!currentUserId) {
      toast.error("User ID not found");
      return;
    }

    setIsChangingPassword(true);

    try {
      await nexuscoreAuth.changePassword({ newPassword });

      toast.success("Password changed successfully!");
      setShowPasswordChangeDialog(false);
      setNewPassword("");
      setConfirmPassword("");
      
      // Redirect to dashboard
      router.push(nextPathFromLocation() ?? "/default");
    } catch (error: any) {
      toast.error("Failed to change password", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLoginSuccess = (data: any) => {

  
    // Store token in localStorage and cookie
    if (data.accessToken) {
      localStorage.setItem("auth_token", data.accessToken);
      localStorage.setItem("nc_token", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Set cookie for server-side auth checks
      document.cookie = `auth_token=${data.accessToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      // Company slug for the /{slug}/... app URLs (read by proxy.ts).
      setCompanySlugCookie(data.user?.company?.slug);
    }

    // Check if user has company_id (mandatory) - if not, redirect to onboarding
    if (!data.user?.companyId) {
      toast.info("Please complete company setup to continue");
      router.push("/onboarding-flow");
      return;
    }

    toast.success("Login successful!");
    router.push(nextPathFromLocation() ?? "/default");
  };

  return (
    <div className="flex pb-8 lg:h-screen lg:pb-0">
      {/* Brand panel â€” the logo artwork has a white background, so the panel stays white in both
          themes, with a soft brand-blue glow so it doesn't read as an empty page; mix-blend-multiply
          lets the artwork's own off-white background take on the panel colour instead of showing as
          a box. */}
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.10),transparent_55%)]" />
        <Image
          width={948}
          height={686}
          src="/brand/nexus-core-logo.png"
          alt="Nexus Core â€” Every Document. One Core."
          className="relative w-[72%] max-w-xl object-contain mix-blend-multiply"
          priority
          unoptimized
        />
      </div>

      <div className="flex w-full items-center justify-center lg:w-1/2">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            {/* On small screens the brand panel is hidden â€” show the logo above the form instead. */}
            <Image
              width={948}
              height={686}
              src="/brand/nexus-core-logo.png"
              alt="Nexus Core"
              className="mx-auto mt-6 w-56 rounded-lg bg-white object-contain lg:hidden"
              unoptimized
            />
            <h2 className="mt-6 text-3xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground mt-2 text-sm">Please sign in to your account</p>
          </div>

          {/* method="post": if the page's JavaScript hasn't loaded, a native submit must never put
              the email and password in the URL (address bar, history, server logs). */}
          <form method="post" onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="space-y-4">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
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
                  className="w-full"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="text-end">
                <Link
                  href="/forgot-password"
                  className="ml-auto inline-block text-sm underline">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link href="/register/v1" className="underline">
                Sign up
              </Link>
            </div>
        </div>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={showPasswordChangeDialog} onOpenChange={(open) => {
        // Don't allow closing without changing password
        if (!open) {
          toast.error("You must change your password to continue");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Your Password</DialogTitle>
            <DialogDescription>
              You are using a temporary password. Please set a new password to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isChangingPassword}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={isChangingPassword}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Password must be at least 6 characters long
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isChangingPassword}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isChangingPassword}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword || !newPassword || !confirmPassword}
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                "Change Password"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
