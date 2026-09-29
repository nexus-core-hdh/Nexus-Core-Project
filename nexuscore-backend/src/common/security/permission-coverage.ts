import { INestApplication, Logger, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import {
  PERMISSION_MODULE_KEY,
  PermissionResolution,
  RequiredPermission,
  UNCLASSIFIED_WRITE,
  resolveRequiredPermissions,
} from '../decorators/permissions.decorator';

export interface RouteInfo {
  method: string;
  path: string;
  controller: string;
  handler: string;
  resolution: PermissionResolution;
}

const joinPath = (...parts: (string | string[] | undefined)[]) =>
  '/' + parts.map((p) => (Array.isArray(p) ? p[0] : p) ?? '').join('/').split('/').filter(Boolean).join('/');

/** Every HTTP route of the running application with what RolesGuard will require for it. */
export function collectRoutes(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as any;
      if (!cls?.prototype) continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, cls);
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        if (name === 'constructor') continue;
        const handler = cls.prototype[name];
        if (typeof handler !== 'function') continue;
        const methodId = Reflect.getMetadata(METHOD_METADATA, handler);
        if (methodId === undefined) continue;
        const method = RequestMethod[methodId as RequestMethod];
        const get = <T>(key: string): T | undefined =>
          Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, cls);
        routes.push({
          method,
          path: joinPath(prefix, Reflect.getMetadata(PATH_METADATA, handler)),
          controller: cls.name,
          handler: name,
          resolution: resolveRequiredPermissions(get, method),
        });
      }
    }
  }
  return routes;
}

const ACTION_VERB: Record<string, string> = { create: 'Create', update: 'Update', delete: 'Delete' };

/** Distinct permissions referenced by any route, with a catalog description. */
export function permissionsReferenced(app: INestApplication, routes: RouteInfo[]) {
  const describe = new Map<string, string>();
  const moduleDescriptions = new Map<string, string>();
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const meta = wrapper.metatype && Reflect.getMetadata(PERMISSION_MODULE_KEY, wrapper.metatype);
      if (meta?.module && meta.description) moduleDescriptions.set(meta.module, meta.description);
    }
  }
  for (const r of routes) {
    if (r.resolution.kind !== 'permissions') continue;
    for (const p of r.resolution.permissions) {
      const key = `${p.module}:${p.action}`;
      if (describe.has(key)) continue;
      const area = moduleDescriptions.get(p.module) ?? p.module;
      describe.set(
        key,
        p.module === UNCLASSIFIED_WRITE.module && p.action === UNCLASSIFIED_WRITE.action
          ? 'Write routes not yet assigned to a module (administrators only)'
          : ACTION_VERB[p.action]
            ? `${ACTION_VERB[p.action]} records — ${area}`
            : `${p.action} — ${area}`,
      );
    }
  }
  return [...describe].map(([key, description]) => {
    const [module, action] = key.split(':');
    return { module, action, description } as RequiredPermission & { description: string };
  });
}

/** Logs a one-line summary, and names any write route that still falls back to UNCLASSIFIED_WRITE. */
export function logCoverage(routes: RouteInfo[], logger = new Logger('[NexusCore] RBAC')) {
  const count = (pred: (r: RouteInfo) => boolean) => routes.filter(pred).length;
  const isWrite = (r: RouteInfo) => r.method !== 'GET';
  const unclassified = routes.filter((r) => r.resolution.kind === 'permissions' && r.resolution.source === 'unclassified');
  logger.log(
    `routes=${routes.length} public=${count((r) => r.resolution.kind === 'public')} ` +
      `signed-in-only: reads=${count((r) => r.resolution.kind === 'authenticated' && !isWrite(r))} ` +
      `self-service-writes=${count((r) => r.resolution.kind === 'authenticated' && isWrite(r))} ` +
      `permission-protected=${count((r) => r.resolution.kind === 'permissions')} ` +
      `(explicit=${count((r) => r.resolution.kind === 'permissions' && r.resolution.source === 'explicit')}, ` +
      `module=${count((r) => r.resolution.kind === 'permissions' && r.resolution.source === 'module')}, ` +
      `unclassified=${unclassified.length})`,
  );
  for (const r of unclassified) {
    logger.warn(`write route without a permission module (admin-only until classified): ${r.method} ${r.path} (${r.controller}.${r.handler})`);
  }
  if (process.env.NEXUSCORE_PRINT_ROUTE_PERMISSIONS === '1') {
    for (const r of routes) {
      const req = r.resolution.kind === 'permissions' ? r.resolution.permissions.map((p) => `${p.module}:${p.action}`).join('+') : r.resolution.kind;
      logger.log(`${r.method.padEnd(6)} ${r.path}  ->  ${req}`);
    }
  }
}
