import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export interface RequiredPermission {
  module: string;
  action: string;
}
/** Explicit permission(s) for a route or controller. Always wins over PermissionModule. */
export const Permissions = (...permissions: RequiredPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PERMISSION_MODULE_KEY = 'permissionModule';
/**
 * Controller-level RBAC module for the existing `module:action` permission catalog. Write routes
 * without an explicit @Permissions then require `<module>:create` (POST), `<module>:update`
 * (PUT/PATCH) or `<module>:delete` (DELETE) — the same verbs the catalog already uses for
 * users/fabric/cutting. Read (GET) routes stay open to any signed-in user unless they declare
 * @Permissions themselves.
 */
export const PermissionModule = (module: string, description?: string) =>
  SetMetadata(PERMISSION_MODULE_KEY, { module, description });

export const ALLOW_AUTHENTICATED_KEY = 'allowAuthenticated';
/**
 * Any signed-in user may call this route regardless of role: self-service actions (own profile,
 * own password, own notifications), client error logging, and POST routes that only read data.
 */
export const AllowAuthenticated = () => SetMetadata(ALLOW_AUTHENTICATED_KEY, true);

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';
/**
 * Route stays usable while the user still has to replace an initial/admin-issued password
 * (User.mustChangePassword). Every other route answers 403 until the password is changed.
 */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);

/** Catch-all permission for a write route nobody has classified yet (held only by Admin). */
export const UNCLASSIFIED_WRITE: RequiredPermission = { module: 'system', action: 'unclassified-write' };

const WRITE_ACTION: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

export type PermissionResolution =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: RequiredPermission[]; source: 'explicit' | 'module' | 'unclassified' };

/**
 * Single source of truth for what a route requires — used by RolesGuard at request time and by
 * the startup coverage report / permission-catalog sync, so the two can never disagree.
 */
export function resolveRequiredPermissions(
  get: <T>(key: string) => T | undefined,
  httpMethod: string,
): PermissionResolution {
  if (get<boolean>('isPublic')) return { kind: 'public' };
  const explicit = get<RequiredPermission[]>(PERMISSIONS_KEY);
  if (explicit?.length) return { kind: 'permissions', permissions: explicit, source: 'explicit' };
  if (get<boolean>(ALLOW_AUTHENTICATED_KEY)) return { kind: 'authenticated' };
  const action = WRITE_ACTION[httpMethod.toUpperCase()];
  if (!action) return { kind: 'authenticated' };
  const mod = get<{ module: string }>(PERMISSION_MODULE_KEY);
  if (mod?.module) return { kind: 'permissions', permissions: [{ module: mod.module, action }], source: 'module' };
  return { kind: 'permissions', permissions: [UNCLASSIFIED_WRITE], source: 'unclassified' };
}
