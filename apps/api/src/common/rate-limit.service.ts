import { Injectable, Logger } from '@nestjs/common';

/**
 * Fixed-window rate limiter, in process memory.
 *
 * Deliberately dependency-free. It protects the credential endpoints against
 * online guessing, which is the realistic threat here: an unthrottled login
 * endpoint accepts unlimited password attempts, and the audit confirmed 10
 * consecutive failures were all processed normally.
 *
 * Limits are per key (client address plus route), not global, so one noisy
 * client cannot lock everyone out.
 *
 * Known limitation: state is per process, so it does not coordinate across
 * instances. If this ever runs behind more than one API process the limiter
 * should move to Redis. With a single API process it is sufficient, and it is
 * honest about what it is rather than pretending to be distributed.
 */
@Injectable()
export class RateLimitService {
  private logger = new Logger('RateLimit');
  private hits = new Map<string, { count: number; resetAt: number }>();
  // Bound the map so a flood of distinct keys cannot grow memory without limit.
  private readonly maxKeys = 10_000;

  /**
   * Record a hit and report whether the caller is within its allowance.
   *
   * Returns `allowed: false` once the window is exhausted. `retryAfterSeconds`
   * is what a client should wait, and is returned to the caller as a header.
   */
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.evictExpired(now);
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);
    if (entry.count > limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return { allowed: true, remaining, retryAfterSeconds: 0 };
  }

  /** Clear a key's counter, used after a successful login. */
  reset(key: string) {
    this.hits.delete(key);
  }

  private evictExpired(now: number) {
    let removed = 0;
    for (const [k, v] of this.hits) {
      if (v.resetAt <= now) {
        this.hits.delete(k);
        removed++;
      }
    }
    // If nothing had expired, drop the oldest entries rather than grow.
    if (removed === 0) {
      const excess = this.hits.size - this.maxKeys + 1;
      let i = 0;
      for (const k of this.hits.keys()) {
        if (i++ >= excess) break;
        this.hits.delete(k);
      }
      this.logger.warn('Rate limit store full; evicted oldest entries');
    }
  }
}
