"use client";

import { useState, useEffect, useCallback } from 'react';
import { permissionSettingsApi } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';

interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
}

/**
 * Hook to check if the current user has permission to access a resource
 * @param resourcePath - The resource path to check (e.g., "/dashboard/crm/leads" or "crm.leads")
 * @returns Object with hasPermission boolean and loading state
 */
export function usePermission(resourcePath: string | null) {
  const [hasPermission, setHasPermission] = useState<boolean>(true); // Default to true to avoid blocking during load
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resourcePath) {
      setHasPermission(true);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      try {
        setLoading(true);
        setError(null);

        const user = getCurrentUser();
        if (!user) {
          setHasPermission(false);
          setLoading(false);
          return;
        }

        // Admin users have full access
        if (user.role === 'admin') {
          setHasPermission(true);
          setLoading(false);
          return;
        }

        // Normalize the resource path
        const normalizedPath = resourcePath.startsWith('/dashboard/')
          ? resourcePath.replace('/dashboard/', '').replace(/\//g, '.')
          : resourcePath.replace(/\//g, '.');

        const result: PermissionCheckResult = await permissionSettingsApi.checkResourcePermission(normalizedPath);
        console.log(`[Permission Check] Path: ${normalizedPath}, Result:`, result);
        setHasPermission(result.hasPermission || false);
      } catch (err: any) {
        console.error('Permission check error:', err);
        console.error('Error details:', {
          message: err.message,
          status: err.status,
          resourcePath,
          normalizedPath: resourcePath.startsWith('/dashboard/')
            ? resourcePath.replace('/dashboard/', '').replace(/\//g, '.')
            : resourcePath.replace(/\//g, '.')
        });
        setError(err.message || 'Failed to check permission');
        // On error, default to denying access for security
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [resourcePath]);

  return { hasPermission, loading, error };
}

/**
 * Hook to check multiple permissions at once
 */
export function usePermissions(resourcePaths: string[]) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        
        if (!user) {
          resourcePaths.forEach(path => {
            permissions[path] = false;
          });
          setPermissions(permissions);
          setLoading(false);
          return;
        }

        // Admin users have full access
        if (user.role === 'admin') {
          const allGranted: Record<string, boolean> = {};
          resourcePaths.forEach(path => {
            allGranted[path] = true;
          });
          setPermissions(allGranted);
          setLoading(false);
          return;
        }

        // Check each permission
        const permissionPromises = resourcePaths.map(async (path) => {
          try {
            const normalizedPath = path.startsWith('/dashboard/')
              ? path.replace('/dashboard/', '').replace(/\//g, '.')
              : path.replace(/\//g, '.');
            
            const result: PermissionCheckResult = await permissionSettingsApi.checkResourcePermission(normalizedPath);
            return { path, hasPermission: result.hasPermission || false };
          } catch {
            return { path, hasPermission: false };
          }
        });

        const results = await Promise.all(permissionPromises);
        const permissionMap: Record<string, boolean> = {};
        results.forEach(({ path, hasPermission }) => {
          permissionMap[path] = hasPermission;
        });
        setPermissions(permissionMap);
      } catch (err) {
        console.error('Permissions check error:', err);
        // On error, deny all permissions
        const denied: Record<string, boolean> = {};
        resourcePaths.forEach(path => {
          denied[path] = false;
        });
        setPermissions(denied);
      } finally {
        setLoading(false);
      }
    };

    if (resourcePaths.length > 0) {
      checkPermissions();
    } else {
      setLoading(false);
    }
  }, [resourcePaths.join(',')]);

  return { permissions, loading };
}

/**
 * Utility function to check permission synchronously (uses cached result)
 * This is useful for onClick handlers
 */
export function usePermissionCheck() {
  const [cache, setCache] = useState<Record<string, boolean>>({});

  const checkPermission = useCallback(async (resourcePath: string): Promise<boolean> => {
    // Check cache first
    if (cache[resourcePath] !== undefined) {
      return cache[resourcePath];
    }

    try {
      const user = getCurrentUser();
      if (!user) {
        return false;
      }

      // Admin users have full access
      if (user.role === 'admin') {
        setCache(prev => ({ ...prev, [resourcePath]: true }));
        return true;
      }

      // Normalize the resource path
      const normalizedPath = resourcePath.startsWith('/dashboard/')
        ? resourcePath.replace('/dashboard/', '').replace(/\//g, '.')
        : resourcePath.replace(/\//g, '.');

      const result: PermissionCheckResult = await permissionSettingsApi.checkResourcePermission(normalizedPath);
      const hasPermission = result.hasPermission || false;

      // Cache the result
      setCache(prev => ({ ...prev, [resourcePath]: hasPermission }));
      return hasPermission;
    } catch (err) {
      console.error('Permission check error:', err);
      // Deny access this time, but don't cache the denial — a transient
      // failure (e.g. rate limiting, a dropped request) would otherwise
      // permanently lock this resource out for the rest of the session, even
      // after the underlying issue clears.
      return false;
    }
  }, [cache]);

  return { checkPermission };
}













