import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit key: the signed-in user where there is one, otherwise the client IP. Behind a reverse
 * proxy every request arrives from the proxy's address, so an IP-only key would make the whole
 * company share one bucket; `req.ip` is the real client address only because main.ts configures
 * Express `trust proxy` (TRUST_PROXY). Runs after JwtAuthGuard, so req.user is already resolved.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  }
}
