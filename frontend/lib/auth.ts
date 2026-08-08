/**
 * Authentication utility functions
 */

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  companyId?: number | null;
  branchId?: number | null;
  image?: string;
  /**
   * Some API responses store a nested `company` object in localStorage's `user`.
   * Keep this optional so UI code can update subscription fields without casts.
   */
  company?: {
    plan?: string;
    subscriptionStatus?: string;
    billingCycle?: string;
    [key: string]: any;
  };
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Get authentication token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Logout user - clears all auth data and redirects to login
 */
export function logout(): void {
  if (typeof window === 'undefined') return;

  // Clear localStorage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');

  // Session-scoped grid preferences (e.g. Purchase Order line grid's "Save for This Session"
  // column order) must reset on logout, not just on tab close — sessionStorage survives a full
  // page navigation/reload within the same tab, which is exactly what this logout() causes, so
  // without this a different user logging into the same tab would inherit the previous user's
  // session-only column order.
  sessionStorage.removeItem('po-line-grid-column-order');

  // Clear cookie
  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  
  // Redirect to login page
  window.location.href = '/dashboard/login/v1';
}

/**
 * Generate avatar fallback from name
 */
export function getAvatarFallback(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function getFirstLetter(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  return parts[0][0].toUpperCase();
}



