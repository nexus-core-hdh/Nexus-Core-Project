import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { nexuscoreValidationPipe } from './common/pipes/validation.pipe';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaService } from './prisma/prisma.service';
import { BpmService } from './modules/bpm/bpm.service';
import { RolesService } from './modules/roles/roles.service';

async function bootstrap() {
  const logger = new Logger('[NexusCore] Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn', 'debug'] });

  // ── Global config ───────────────────────────────────────────────────────────
  // Raised from Express's 100kb default so base64-encoded image uploads (notes, feed posts) fit.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(nexuscoreValidationPipe);

  // RolesGuard needs PrismaService so we apply it here rather than via APP_GUARD
  const reflector = app.get(Reflector);
  const prisma = app.get(PrismaService);
  app.useGlobalGuards(new RolesGuard(reflector, prisma));

  // ── Swagger ─────────────────────────────────────────────────────────────────
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

  // ── Start ────────────────────────────────────────────────────────────────────
  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`NexusCore API running → http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs       → http://localhost:${port}/api/docs`);
}

bootstrap();
