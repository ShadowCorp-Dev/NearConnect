/**
 * Rate Limiting & Anti-Abuse Layer
 * Prevents brute force attacks and rapid-fire abuse
 */

export interface RateLimitConfig {
  /** Maximum requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Duration to block after limit exceeded (optional) */
  blockDurationMs?: number;
  /** Whether to use sliding window (vs fixed window) */
  slidingWindow?: boolean;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Seconds until retry is allowed (if blocked) */
  retryAfter?: number;
  /** Number of remaining requests in current window */
  remaining: number;
  /** Time until window resets (ms) */
  resetIn: number;
}

interface RateLimitEntry {
  requests: number[];
  blockedUntil?: number;
}

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequests: 10,
      windowMs: 60000,         // 1 minute
      blockDurationMs: 300000, // 5 minutes
      slidingWindow: true,
      ...config,
    };
  }

  /**
   * Check if an action is allowed and record the request
   */
  check(action: string): RateLimitResult {
    const now = Date.now();
    const entry = this.entries.get(action) || { requests: [] };

    // Check if currently blocked
    if (entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        remaining: 0,
        resetIn: entry.blockedUntil - now,
      };
    }

    // Clean old requests outside the window
    const windowStart = now - this.config.windowMs;
    entry.requests = entry.requests.filter(t => t > windowStart);

    // Check if limit exceeded
    if (entry.requests.length >= this.config.maxRequests) {
      // Block the action
      entry.blockedUntil = now + this.config.blockDurationMs;
      this.entries.set(action, entry);

      return {
        allowed: false,
        retryAfter: Math.ceil(this.config.blockDurationMs / 1000),
        remaining: 0,
        resetIn: this.config.blockDurationMs,
      };
    }

    // Record this request
    entry.requests.push(now);
    this.entries.set(action, entry);

    // Calculate reset time
    const oldestRequest = entry.requests[0] || now;
    const resetIn = this.config.slidingWindow
      ? oldestRequest + this.config.windowMs - now
      : this.config.windowMs - (now - oldestRequest);

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.requests.length,
      resetIn: Math.max(0, resetIn),
    };
  }

  /**
   * Check without recording (peek)
   */
  peek(action: string): RateLimitResult {
    const now = Date.now();
    const entry = this.entries.get(action) || { requests: [] };

    // Check if currently blocked
    if (entry.blockedUntil && entry.blockedUntil > now) {
      return {
        allowed: false,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
        remaining: 0,
        resetIn: entry.blockedUntil - now,
      };
    }

    // Count recent requests
    const windowStart = now - this.config.windowMs;
    const recentRequests = entry.requests.filter(t => t > windowStart);

    return {
      allowed: recentRequests.length < this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - recentRequests.length),
      resetIn: recentRequests.length > 0
        ? (recentRequests[0] || now) + this.config.windowMs - now
        : 0,
    };
  }

  /**
   * Reset limits for an action
   */
  reset(action: string): void {
    this.entries.delete(action);
  }

  /**
   * Reset all limits
   */
  resetAll(): void {
    this.entries.clear();
  }

  /**
   * Manually block an action
   */
  block(action: string, durationMs?: number): void {
    const entry = this.entries.get(action) || { requests: [] };
    entry.blockedUntil = Date.now() + (durationMs || this.config.blockDurationMs);
    this.entries.set(action, entry);
  }

  /**
   * Unblock an action
   */
  unblock(action: string): void {
    const entry = this.entries.get(action);
    if (entry) {
      delete entry.blockedUntil;
      this.entries.set(action, entry);
    }
  }

  /**
   * Get current status for all tracked actions
   */
  getStatus(): Map<string, RateLimitResult> {
    const status = new Map<string, RateLimitResult>();
    for (const action of this.entries.keys()) {
      status.set(action, this.peek(action));
    }
    return status;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [action, entry] of this.entries.entries()) {
      // Remove expired blocks
      if (entry.blockedUntil && entry.blockedUntil <= now) {
        delete entry.blockedUntil;
      }

      // Remove old requests
      entry.requests = entry.requests.filter(t => t > windowStart);

      // Remove empty entries
      if (entry.requests.length === 0 && !entry.blockedUntil) {
        this.entries.delete(action);
      } else {
        this.entries.set(action, entry);
      }
    }
  }
}

/**
 * Pre-configured rate limiter for wallet connections
 * Allows 5 connection attempts per minute, blocks for 2 minutes after
 */
export const connectLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 60000,        // 1 minute
  blockDurationMs: 120000, // 2 minutes
});

/**
 * Pre-configured rate limiter for transaction signing
 * Allows 20 signs per minute, blocks for 1 minute after
 */
export const signLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: 60000,       // 1 minute
  blockDurationMs: 60000, // 1 minute
});

/**
 * Pre-configured rate limiter for RPC calls
 * Allows 100 calls per minute
 */
export const rpcLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  blockDurationMs: 30000,
});

/**
 * Decorator to rate limit a function
 */
export function rateLimit(limiter: RateLimiter, action: string) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const original = descriptor.value!;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const result = limiter.check(action);
      if (!result.allowed) {
        throw new Error(`Rate limited. Retry in ${result.retryAfter} seconds.`);
      }
      return original.apply(this, args);
    } as T;

    return descriptor;
  };
}

/**
 * Higher-order function to wrap an async function with rate limiting
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  limiter: RateLimiter,
  action: string
): T {
  return (async (...args: unknown[]) => {
    const result = limiter.check(action);
    if (!result.allowed) {
      throw new Error(`Rate limited. Retry in ${result.retryAfter} seconds.`);
    }
    return fn(...args);
  }) as T;
}
