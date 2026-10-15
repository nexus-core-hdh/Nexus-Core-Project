/** Stored inside PermissionSetting.fieldPermissions (JSON) */
export const RESOURCE_ACCESS_KEY = "__resourceAccess" as const;

/** Per non-read permission: allowlist (same shape as __resourceAccess). */
export const ACTION_RESOURCE_ACCESS_KEY = "__actionResourceAccess" as const;

export type ResourceAccessMode = "all" | "users_items" | "deny";

export interface ResourceAccessMeta {
  mode: ResourceAccessMode;
  /** When mode is users_items — only these user IDs may access (within the role). */
  allowedUserIds?: number[];
}

export type ActionResourceAccessKey =
  | "canWrite"
  | "canEdit"
  | "canDelete"
  | "canManage"
  | "canExport"
  | "canImport";

function parseMeta(raw: unknown): ResourceAccessMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const mode = m.mode;
  if (mode !== "all" && mode !== "users_items" && mode !== "deny") return null;
  const allowedUserIds = Array.isArray(m.allowedUserIds)
    ? (m.allowedUserIds as unknown[]).filter((x): x is number => typeof x === "number")
    : [];
  return { mode, allowedUserIds };
}

export function getResourceAccessMeta(fieldPermissions: unknown): ResourceAccessMeta | null {
  if (!fieldPermissions || typeof fieldPermissions !== "object") return null;
  const raw = (fieldPermissions as Record<string, unknown>)[RESOURCE_ACCESS_KEY];
  return parseMeta(raw);
}

export function getActionResourceAccessMeta(
  fieldPermissions: unknown,
  permKey: ActionResourceAccessKey
): ResourceAccessMeta | null {
  if (!fieldPermissions || typeof fieldPermissions !== "object") return null;
  const bucket = (fieldPermissions as Record<string, unknown>)[ACTION_RESOURCE_ACCESS_KEY];
  if (!bucket || typeof bucket !== "object") return null;
  return parseMeta((bucket as Record<string, unknown>)[permKey]);
}
