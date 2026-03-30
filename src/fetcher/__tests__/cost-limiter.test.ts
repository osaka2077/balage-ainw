/**
 * CostLimiter — Unit Tests (FC-014)
 *
 * Prueft:
 *  - Minute-Limit: 11. Call wird blockiert
 *  - Hour-Limit: 101. Call wird blockiert
 *  - Limits resetten nach Zeitablauf
 *  - Custom Limits
 *  - stats() gibt korrekte Werte
 *  - reset() leert Counter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CostLimiter } from "../cost-limiter.js";
import { FetchRateLimitError } from "../errors.js";

describe("CostLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow calls within minute limit", () => {
    const limiter = new CostLimiter({ maxPerMinute: 10, maxPerHour: 100 });

    // 10 Calls innerhalb einer Minute sollten erlaubt sein
    for (let i = 0; i < 10; i++) {
      expect(() => limiter.check("https://example.com")).not.toThrow();
      limiter.record();
    }
  });

  it("should block 11th call per minute", () => {
    const limiter = new CostLimiter({ maxPerMinute: 10, maxPerHour: 100 });

    for (let i = 0; i < 10; i++) {
      limiter.check("https://example.com");
      limiter.record();
    }

    // 11. Call → blockiert
    expect(() => limiter.check("https://example.com")).toThrow(FetchRateLimitError);
  });

  it("should allow calls again after minute window passes", () => {
    const limiter = new CostLimiter({ maxPerMinute: 10, maxPerHour: 100 });

    for (let i = 0; i < 10; i++) {
      limiter.check("https://example.com");
      limiter.record();
    }

    // 11. Call blockiert
    expect(() => limiter.check("https://example.com")).toThrow(FetchRateLimitError);

    // 61 Sekunden vorspulen → Minute-Window ist abgelaufen
    vi.advanceTimersByTime(61_000);

    // Jetzt sollte es wieder gehen
    expect(() => limiter.check("https://example.com")).not.toThrow();
  });

  it("should block 101st call per hour", () => {
    const limiter = new CostLimiter({ maxPerMinute: 200, maxPerHour: 100 });

    // 100 Calls verteilt ueber 10 Minuten (um Minuten-Limit nicht zu triggern)
    for (let i = 0; i < 100; i++) {
      if (i > 0 && i % 10 === 0) {
        vi.advanceTimersByTime(61_000); // Naechste Minute
      }
      limiter.check("https://example.com");
      limiter.record();
    }

    // 101. Call → blockiert (Hour-Limit)
    expect(() => limiter.check("https://example.com")).toThrow(FetchRateLimitError);
  });

  it("should allow calls again after hour window passes", () => {
    const limiter = new CostLimiter({ maxPerMinute: 200, maxPerHour: 5 });

    for (let i = 0; i < 5; i++) {
      limiter.check("https://example.com");
      limiter.record();
    }

    // 6. Call blockiert
    expect(() => limiter.check("https://example.com")).toThrow(FetchRateLimitError);

    // 1 Stunde + 1 Sekunde vorspulen
    vi.advanceTimersByTime(3_601_000);

    // Jetzt sollte es wieder gehen
    expect(() => limiter.check("https://example.com")).not.toThrow();
  });

  it("should use default limits when no config provided", () => {
    const limiter = new CostLimiter();
    const { limits } = limiter.stats();
    expect(limits.maxPerMinute).toBe(10);
    expect(limits.maxPerHour).toBe(100);
  });

  it("should accept custom limits", () => {
    const limiter = new CostLimiter({ maxPerMinute: 5, maxPerHour: 50 });

    for (let i = 0; i < 5; i++) {
      limiter.check("https://example.com");
      limiter.record();
    }

    // 6. Call blockiert bei maxPerMinute=5
    expect(() => limiter.check("https://example.com")).toThrow(FetchRateLimitError);
  });

  it("should return correct stats", () => {
    const limiter = new CostLimiter({ maxPerMinute: 10, maxPerHour: 100 });

    limiter.check("https://example.com");
    limiter.record();
    limiter.check("https://example.com");
    limiter.record();

    const stats = limiter.stats();
    expect(stats.callsLastMinute).toBe(2);
    expect(stats.callsLastHour).toBe(2);
    expect(stats.limits.maxPerMinute).toBe(10);
    expect(stats.limits.maxPerHour).toBe(100);
  });

  it("should reset all counters", () => {
    const limiter = new CostLimiter({ maxPerMinute: 10, maxPerHour: 100 });

    for (let i = 0; i < 10; i++) {
      limiter.check("https://example.com");
      limiter.record();
    }

    // Blockiert
    expect(() => limiter.check("https://example.com")).toThrow(FetchRateLimitError);

    // Reset
    limiter.reset();

    // Wieder erlaubt
    expect(() => limiter.check("https://example.com")).not.toThrow();
    expect(limiter.stats().callsLastMinute).toBe(0);
  });

  it("should prune old entries to prevent memory leak", () => {
    const limiter = new CostLimiter({ maxPerMinute: 200, maxPerHour: 200 });

    // 50 Calls aufzeichnen
    for (let i = 0; i < 50; i++) {
      limiter.check("https://example.com");
      limiter.record();
    }

    // 2 Stunden vorspulen — alle Eintraege sollten gepruned werden
    vi.advanceTimersByTime(7_200_000);

    const stats = limiter.stats();
    expect(stats.callsLastMinute).toBe(0);
    expect(stats.callsLastHour).toBe(0);
  });

  it("should include retryAfterSec in FetchRateLimitError", () => {
    const limiter = new CostLimiter({ maxPerMinute: 1, maxPerHour: 100 });

    limiter.check("https://example.com");
    limiter.record();

    try {
      limiter.check("https://example.com");
      // Sollte nie hierhin kommen
      expect.fail("Expected FetchRateLimitError");
    } catch (err) {
      expect(err).toBeInstanceOf(FetchRateLimitError);
      const rateLimitErr = err as FetchRateLimitError;
      expect(rateLimitErr.retryAfterSec).toBeGreaterThan(0);
      expect(rateLimitErr.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });
});
