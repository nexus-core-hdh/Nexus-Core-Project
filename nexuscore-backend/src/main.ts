import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { Logger, LogLevel } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { nexuscoreValidationPipe } from './common/pipes/validation.pipe';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaService } from './prisma/prisma.service';
import { BpmService } from './modules/bpm/bpm.service';
import { RolesService } from './modules/roles/roles.service';
import { collectRoutes, logCoverage, permissionsReferenced } from './common/security/permission-coverage';

const isProduction = process.env.NODE_ENV === 'production';

/** TRUST_PROXY: "false", "true", a hop count, or Express trust list (default "loopback" = a reverse proxy on this host). */
function trustProxySetting(): boolean | number | string {
  const raw = (process.env.TRUST_PROXY ?? 'loopback').trim();
  if (raw === 'false' || raw === '') return false;
  if (raw === 'true') return true;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

async function bootstrap() {
  const logger = new Logger('[NexusCore] Bootstrap');
  const logLevels: LogLevel[] = isProduction ? ['log', 'error', 'warn'] : ['log', 'error', 'warn', 'debug'];
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: logLevels });

  // ── Global config ───────────────────────────────────────────────────────────
  // Behind a reverse proxy (IIS/Nginx), req.ip must be the real client address, not the proxy's,
  // for per-client rate limiting and audit logs.
  app.set('trust proxy', trustProxySetting());
  app.disable('x-powered-by');
  // Raised from Express's 100kb default so base64-encoded image uploads (notes, feed posts) fit.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || ['http://localhost:3000'],
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(nexuscoreValidationPipe);
  // SIGTERM/SIGINT (process manager stop/restart) -> Nest closes the HTTP server and runs
  // onModuleDestroy (PrismaService disconnects) instead of dying mid-request.
  app.enableShutdownHooks();

  // RolesGuard needs PrismaService so we apply it here rather than via APP_GUARD
  const reflector = app.get(Reflector);
  const prisma = app.get(PrismaService);
  app.useGlobalGuards(new RolesGuard(reflector, prisma));

  // ── Swagger ─────────────────────────────────────────────────────────────────
  // Development only by default; production exposes it only when SWAGGER_ENABLED=true is set
  // explicitly (and should then be restricted at the reverse proxy).
  const swaggerEnabled = isProduction ? process.env.SWAGGER_ENABLED === 'true' : process.env.SWAGGER_ENABLED !== 'false';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NexusCore API v1')
      .setDescription('NexusCore Backend — Modular NestJS monolith (fabric · cutting · BPM · notifications)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // ── Seed BPM processes on startup ────────────────────────────────────────────
  try {
    const bpmService = app.get(BpmService);
    await bpmService.seedProcesses();
    logger.log('BPM processes seeded');
  } catch (e) {
    logger.warn(`BPM seed skipped: ${(e as Error).message}`);
  }

  // ── Seed the Requirements lock/unlock permissions ────────────────────────────
  // RolesService.seedPermissions() already existed for exactly this ("ensure these Permission
  // rows exist so an admin can grant them via the existing Role/Permission UI") but was never
  // actually called anywhere — same idempotent-upsert-at-boot shape as the BPM seed above.
  try {
    const rolesService = app.get(RolesService);
    await rolesService.seedPermissions([
      { module: 'requirements', action: 'lock', description: 'Lock a Fabric/Yarn/Trim Requirement on a Work Order' },
      { module: 'requirements', action: 'unlock', description: 'Unlock a Fabric/Yarn/Trim Requirement on a Work Order (also required to Calculate/Save/Delete a currently-locked one)' },
    ]);
    logger.log('Requirements lock/unlock permissions seeded');
  } catch (e) {
    logger.warn(`Requirements permission seed skipped: ${(e as Error).message}`);
  }

  // ── RBAC: permission catalog + coverage ──────────────────────────────────────
  // Every permission a route requires (explicit @Permissions or controller @PermissionModule) is
  // upserted into the existing Permission catalog so administrators can grant it from the
  // Role/Permission screen, and granted to the system "Full access" role so Admin keeps working.
  const routes = collectRoutes(app);
  try {
    await app.get(RolesService).seedPermissions(permissionsReferenced(app, routes), { grantToSystemRoles: true });
  } catch (e) {
    logger.warn(`Permission catalog sync skipped: ${(e as Error).message}`);
  }
  logCoverage(routes);

  // ── Start ────────────────────────────────────────────────────────────────────
  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`NexusCore API running → http://localhost:${port}/api/v1 (${isProduction ? 'production' : 'development'})`);
  if (swaggerEnabled) logger.log(`Swagger docs       → http://localhost:${port}/api/docs`);
}

bootstrap().catch((e) => {
  // e.g. jwt.config.ts refusing a missing/placeholder secret in production — exit non-zero so the
  // process manager reports a failed start instead of running a half-configured API.
  new Logger('[NexusCore] Bootstrap').error(`Startup failed: ${(e as Error).message}`);
  process.exit(1);
});
