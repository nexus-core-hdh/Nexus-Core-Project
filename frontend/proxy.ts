import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if user is trying to access auth routes (protected routes)
  // Exclude onboarding-flow from auth routes since it's in the guest folder
  const isOnboardingFlow = pathname.startsWith('/dashboard/pages/onboarding-flow');
  const isAuthRoute = pathname.startsWith('/dashboard/default') ||
                      (pathname.startsWith('/dashboard/pages') && !isOnboardingFlow) ||
                      pathname.startsWith('/dashboard/apps') ||
                      pathname.startsWith('/dashboard/crm') ||
                      pathname.startsWith('/dashboard/collaboration') ||
                      pathname.startsWith('/dashboard/academy') ||
                      pathname.startsWith('/dashboard/crypto') ||
                      pathname.startsWith('/dashboard/ecommerce') ||
                      pathname.startsWith('/dashboard/finance') ||
                      pathname.startsWith('/dashboard/hotel') ||
                      pathname.startsWith('/dashboard/logistics') ||
                      pathname.startsWith('/dashboard/payment') ||
                      pathname.startsWith('/dashboard/project') ||
                      pathname.startsWith('/dashboard/sales') ||
                      pathname.startsWith('/dashboard/website-analytics') ||
                      pathname.startsWith('/dashboard/widgets') ||
                      pathname.startsWith('/dashboard/file-manager') ||
                      pathname.startsWith('/dashboard/hospital-management') ||
                      pathname.startsWith('/dashboard/onboarding-flow');
  
  // Check if user is trying to access guest routes (login, register, etc.)
  const isGuestRoute = pathname.startsWith('/dashboard/login') ||
                       pathname.startsWith('/dashboard/register') ||
                       pathname.startsWith('/dashboard/forgot-password') ||
                       pathname.startsWith('/dashboard/reset-password') ||
                       isOnboardingFlow;
  
  // Get token from cookie
  const token = request.cookies.get('auth_token')?.value;
  
  // Serial Card scan page (a label's QR link, /s/<Serial No>): signed out -> login, then back to
  // the card. Done here as a real 307 (the page also checks, but a streamed page can only
  // redirect client-side).
  if (pathname.startsWith('/s/') && !token) {
    const login = new URL('/dashboard/login/v1', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  // If accessing auth route without token, redirect to login
  if (isAuthRoute && !token) {
    return NextResponse.redirect(new URL('/dashboard/login/v1', request.url));
  }
  
  // If accessing guest route with token, redirect to dashboard
  // Exception: Allow onboarding-flow even with token (user might need to complete company setup)
  if (isGuestRoute && token && !isOnboardingFlow) {
    // Already signed in on a login link that carries a return path (e.g. a scanned Serial Card
    // QR: /s/<Serial No> -> login?next=...) — go straight there instead of the dashboard.
    const next = safeNextPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(next ?? '/dashboard/default', request.url));
  }
  
  // For root path, redirect based on auth status
  if (pathname === '/' || pathname === '/dashboard') {
    if (token) {
      return NextResponse.redirect(new URL('/dashboard/default', request.url));
    } else {
      return NextResponse.redirect(new URL('/dashboard/login/v1', request.url));
    }
  }
  
  // Continue with next response for other routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/dashboard',
    '/dashboard/:path*',
    '/s/:path*'
  ]
};
