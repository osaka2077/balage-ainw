/**
 * Security Hardening — Rate Limiter
 * Sliding Window Rate Limiting pro Domain und Session.
 */

import pino from "pino";
import type {
  RateLimiterConfig,
  RateLimit,
  RateLimitResult,
  QuotaInfo,
  RateLimitStats,
} from "./types.js";

const logger = pino({ name: "security:rate-limiter" });

const DEFAULT_CONFIG: RateLimiterConfig = {
  defaultPerDomain: { maxRequests: 30, windowMs: 60_000 },
  defaultPerSession: { maxRequests: 100, windowMs: 60_000 },
  globalLimit: { maxRequests: 200, windowMs: 60_000 },
  domainOverrides: {},
  cleanupIntervalMs: 60_000,
};

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly domainRequests = new Map<string, number[]>();
  private readonly sessionRequests = new Map<string, number[]>();
  private readonly globalRequests: number[] = [];
  private readonly stats: RateLimitStats = {
    totalRequests: 0,
    totalBlocked: 0,
    perDomain: {},
  };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs,
    );
  }

  checkLimit(domain: string, sessionId: string): RateLimitResult {
    const now = Date.now();

    // Domain-Limit pruefen
    const domainLimit =
      this.config.domainOverrides[domain] ?? this.config.defaultPerDomain;
    const domainTimestamps = this.getRecentTimestamps(
      this.domainRequests,
      domain,
      now,
      domainLimit.windowMs,
    );
    if (domainTimestamps.length >= domainLimit.maxRequests) {
      const oldestInWindow = domainTimestamps[0]!;
      const retryAfterMs = oldestInWindow + domainLimit.windowMs - now;
      logger.warn(
        {
          domain,
          limit: domainLimit.maxRequests,
          windowMs: domainLimit.windowMs,
        },
        "Domain rate limit hit",
      );
      return {
        allowed: false,
        remaining: 0,
        limit: domainLimit.maxRequests,
        windowMs: domainLimit.windowMs,
        retryAfterMs: Math.max(0, retryAfterMs),
        blockedBy: "domain",
      };
    }

    // Session-Limit pruefen
    const sessionLimit = this.config.defaultPerSession;
    const sessionTimestamps = this.getRecentTimestamps(
      this.sessionRequests,
      sessionId,
      now,
      sessionLimit.windowMs,
    );
    if (sessionTimestamps.length >= sessionLimit.maxRequests) {
      const oldestInWindow = sessionTimestamps[0]!;
      const retryAfterMs = oldestInWindow + sessionLimit.windowMs - now;
      logger.warn(
        { sessionId, limit: sessionLimit.maxRequests },
        "Session rate limit hit",
      );
      return {
        allowed: false,
        remaining: 0,
        limit: sessionLimit.maxRequests,
        windowMs: sessionLimit.windowMs,
        retryAfterMs: Math.max(0, retryAfterMs),
        blockedBy: "session",
      };
    }

    // Global-Limit pruefen
    const globalLimit = this.config.globalLimit;
    const globalRecent = this.globalRequests.filter(
      (t) => t > now - globalLimit.windowMs,
    );
    if (globalRecent.length >= globalLimit.maxRequests) {
      const oldestInWindow = globalRecent[0]!;
      const retryAfterMs = oldestInWindow + globalLimit.windowMs - now;
      logger.warn(
        { limit: globalLimit.maxRequests },
        "Global rate limit hit",
      );
      return {
        allowed: false,
        remaining: 0,
        limit: globalLimit.maxRequests,
        windowMs: globalLimit.windowMs,
        retryAfterMs: Math.max(0, retryAfterMs),
        blockedBy: "global",
      };
    }

    const domainRemaining =
      domainLimit.maxRequests - domainTimestamps.length;
    return {
      allowed: true,
      remaining: domainRemaining,
      limit: domainLimit.maxRequests,
      windowMs: domainLimit.windowMs,
      blockedBy: null,
    };
  }

  recordRequest(domain: string, sessionId: string): void {
    const now = Date.now();

    if (!this.domainRequests.has(domain)) {
      this.domainRequests.set(domain, []);
    }
    this.domainRequests.get(domain)!.push(now);

    if (!this.sessionRequests.has(sessionId)) {
      this.sessionRequests.set(sessionId, []);
    }
    this.sessionRequests.get(sessionId)!.push(now);

    this.globalRequests.push(now);

    this.stats.totalRequests++;
    if (!this.stats.perDomain[domain]) {
      this.stats.perDomain[domain] = { requests: 0, blocked: 0 };
    }
    this.stats.perDomain[domain]!.requests++;
  }

  getRemainingQuota(domain: string, sessionId: string): QuotaInfo {
    const now = Date.now();

    const domainLimit =
      this.config.domainOverrides[domain] ?? this.config.defaultPerDomain;
    const domainTimestamps = this.getRecentTimestamps(
      this.domainRequests,
      domain,
      now,
      domainLimit.windowMs,
    );

    const sessionLimit = this.config.defaultPerSession;
    const sessionTimestamps = this.getRecentTimestamps(
      this.sessionRequests,
      sessionId,
      now,
      sessionLimit.windowMs,
    );

    const globalLimit = this.config.globalLimit;
    const globalRecent = this.globalRequests.filter(
      (t) => t > now - globalLimit.windowMs,
    );

    return {
      domain: {
        remaining: Math.max(
          0,
          domainLimit.maxRequests - domainTimestamps.length,
        ),
        limit: domainLimit.maxRequests,
        windowMs: domainLimit.windowMs,
      },
      session: {
        remaining: Math.max(
          0,
          sessionLimit.maxRequests - sessionTimestamps.length,
        ),
        limit: sessionLimit.maxRequests,
        windowMs: sessionLimit.windowMs,
      },
      global: {
        remaining: Math.max(
          0,
          globalLimit.maxRequests - globalRecent.length,
        ),
        limit: globalLimit.maxRequests,
        windowMs: globalLimit.windowMs,
      },
    };
  }

  setDomainLimit(domain: string, limit: RateLimit): void {
    this.config.domainOverrides[domain] = limit;
  }

  resetDomain(domain: string): void {
    this.domainRequests.delete(domain);
  }

  resetAll(): void {
    this.domainRequests.clear();
    this.sessionRequests.clear();
    this.globalRequests.length = 0;
    this.stats.totalRequests = 0;
    this.stats.totalBlocked = 0;
    this.stats.perDomain = {};
  }

  getStats(): RateLimitStats {
    return { ...this.stats };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private getRecentTimestamps(
    map: Map<string, number[]>,
    key: string,
    now: number,
    windowMs: number,
  ): number[] {
    const timestamps = map.get(key);
    if (!timestamps) return [];
    return timestamps.filter((t) => t > now - windowMs);
  }

  private cleanup(): void {
    const now = Date.now();
    const maxWindow = Math.max(
      this.config.defaultPerDomain.windowMs,
      this.config.defaultPerSession.windowMs,
      this.config.globalLimit.windowMs,
    );

    for (const [key, timestamps] of this.domainRequests) {
      const recent = timestamps.filter((t) => t > now - maxWindow);
      if (recent.length === 0) {
        this.domainRequests.delete(key);
      } else {
        this.domainRequests.set(key, recent);
      }
    }

    for (const [key, timestamps] of this.sessionRequests) {
      const recent = timestamps.filter((t) => t > now - maxWindow);
      if (recent.length === 0) {
        this.sessionRequests.delete(key);
      } else {
        this.sessionRequests.set(key, recent);
      }
    }

    const recentGlobal = this.globalRequests.filter(
      (t) => t > now - maxWindow,
    );
    this.globalRequests.length = 0;
    this.globalRequests.push(...recentGlobal);
  }
}
