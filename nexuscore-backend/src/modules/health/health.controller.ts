import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const DB_CHECK_TIMEOUT_MS = 2000;

// Unauthenticated probes for the dev launcher (scripts/dev-all.mjs), the dev API proxy and process
// managers. Not throttled: anonymous requests through a same-host proxy all share one client-IP
// bucket, which periodic probes must not use up.
//   GET /health        liveness  — the HTTP server answers (bootstrap finished: Nest only listens
//                                  after every module, seed and permission sync has run).
//   GET /health/ready  readiness — additionally the database answers; 503 when it does not.
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('database check timed out')), DB_CHECK_TIMEOUT_MS); }),
      ]);
    } catch (e) {
      throw new ServiceUnavailableException({ message: 'Database not reachable', errors: { code: 'DATABASE_UNAVAILABLE', detail: (e as Error).message } });
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ready', uptimeSeconds: Math.round(process.uptime()) };
  }
}
